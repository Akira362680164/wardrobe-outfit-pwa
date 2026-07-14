import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  RealDateSchema,
  ReassessRecommendationCommandSchema,
  RecommendationRegenerationRequestSchema,
  type RecommendationRegenerationRequest,
} from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import { RecommendationGenerationServiceV2 } from "./generation-service-v2.js";

const BUSINESS_TIMEZONE = "Asia/Shanghai";
const CLAIM_LEASE_SECONDS = 120;

export class RecommendationRegenerationConflictError extends Error { readonly code = "REGENERATION_MUTATION_CONFLICT"; }

interface ClaimedRequest extends RecommendationRegenerationRequest { claimedTriggerVersion: number }
export interface RecommendationRegenerationClaim {
  claimToken: string;
  generationBatchId: string;
  requests: ClaimedRequest[];
}

export class RecommendationRegenerationService {
  private readonly generation: RecommendationGenerationServiceV2;
  constructor(private readonly pool: Pool = getPostgresPool(), generation?: RecommendationGenerationServiceV2) { this.generation = generation ?? new RecommendationGenerationServiceV2(pool); }

  async enqueueExplicit(userId: string, targetDate: string, input: unknown): Promise<RecommendationRegenerationRequest> {
    const command = ReassessRecommendationCommandSchema.parse(input);
    const date = RealDateSchema.parse(targetDate);
    const fingerprint = hash(`${userId}:${date}:explicit_reassess`);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-reassess:${userId}:${command.clientMutationId}`]);
      const replay = (await client.query(`select * from recommendation_regeneration_requests
        where user_id=$1 and client_mutation_fingerprints ? $2 order by created_at desc limit 1`, [userId, command.clientMutationId])).rows[0];
      if (replay) {
        if (dateOf(replay.target_date) !== date || replay.client_mutation_fingerprints?.[command.clientMutationId] !== fingerprint) throw new RecommendationRegenerationConflictError();
        await client.query("commit");
        return parseRow(replay);
      }
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-regeneration:${userId}:${date}`]);
      const active = (await client.query("select * from recommendation_regeneration_requests where user_id=$1 and target_date=$2 and status in ('pending','processing') for update", [userId, date])).rows[0];
      const row = active
        ? (await client.query(`update recommendation_regeneration_requests
            set reasons=(select array_agg(distinct value order by value) from unnest(reasons || ARRAY['explicit_reassess']) value),
                client_mutation_ids=array_append(client_mutation_ids,$2::uuid),
                client_mutation_fingerprints=client_mutation_fingerprints || jsonb_build_object($2::text,$3::text),
                trigger_version=trigger_version+1,next_attempt_at=least(next_attempt_at,now()),updated_at=now()
            where id=$1 returning *`, [active.id, command.clientMutationId, fingerprint])).rows[0]
        : (await client.query(`insert into recommendation_regeneration_requests(
              user_id,target_date,reasons,client_mutation_ids,client_mutation_fingerprints,content_fingerprint
            ) values($1,$2,ARRAY['explicit_reassess'],ARRAY[$3::uuid],jsonb_build_object($3::text,$4::text),$4) returning *`, [userId, date, command.clientMutationId, fingerprint])).rows[0];
      await client.query("commit");
      return parseRow(row);
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async get(userId: string, requestId: string) {
    const row = (await this.pool.query("select * from recommendation_regeneration_requests where id=$1 and user_id=$2", [requestId, userId])).rows[0];
    return row ? parseRow(row) : null;
  }

  async claimNext(asOfDate = shanghaiDate(new Date())): Promise<RecommendationRegenerationClaim | null> {
    const today = RealDateSchema.parse(asOfDate);
    const tomorrow = addDays(today, 1);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(`update recommendation_regeneration_requests
        set status='pending',claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,
            next_attempt_at=now(),updated_at=now()
        where status='processing' and lease_expires_at<=now()`);
      const candidate = (await client.query(`select * from recommendation_regeneration_requests
        where status='pending' and next_attempt_at<=now()
        order by next_attempt_at,created_at for update skip locked limit 1`)).rows[0];
      if (!candidate) { await client.query("commit"); return null; }
      const candidateDate = dateOf(candidate.target_date);
      const pairDates = candidateDate === today || candidateDate === tomorrow ? [today, tomorrow] : [candidateDate];
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-regeneration-claim:${candidate.user_id}:${pairDates.join(":")}`]);
      if (pairDates.length === 2) await ensurePairRequest(client, candidate, pairDates.find((date) => date !== candidateDate)!);
      const rows = (await client.query(`select * from recommendation_regeneration_requests
        where user_id=$1 and target_date=any($2::date[]) and status='pending' and ($3::boolean or next_attempt_at<=now())
        order by target_date for update`, [candidate.user_id, pairDates, pairDates.length === 2])).rows;
      if (rows.length !== pairDates.length) { await client.query("rollback"); return null; }
      const claimToken = randomUUID();
      const generationBatchId = randomUUID();
      const claimed = (await client.query(`update recommendation_regeneration_requests
        set status='processing',attempt_count=attempt_count+1,locked_at=now(),claim_token=$2,
            lease_expires_at=now()+make_interval(secs=>$3::int),generation_batch_id=$4,
            claimed_trigger_version=trigger_version,updated_at=now()
        where id=any($1::uuid[]) returning *`, [rows.map((row) => row.id), claimToken, CLAIM_LEASE_SECONDS, generationBatchId])).rows;
      await client.query("commit");
      return { claimToken, generationBatchId, requests: claimed.sort((a, b) => dateOf(a.target_date).localeCompare(dateOf(b.target_date))).map(parseClaimedRow) };
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async finishClaim(claim: RecommendationRegenerationClaim, recommendationIds: string[], lastErrorCode: "protected_plan" | null = null): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rows = await lockClaim(client, claim);
      if (!rows) { await client.query("rollback"); return false; }
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index]!;
        const dirty = row.trigger_version > row.claimed_trigger_version;
        await client.query(`update recommendation_regeneration_requests set
          status=$2::recommendation_regeneration_status, result_recommendation_id=coalesce($3,result_recommendation_id), last_error_code=$4,
          claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,
          next_attempt_at=case when $2::recommendation_regeneration_status='pending' then now() else next_attempt_at end,
          completed_at=case when $2::recommendation_regeneration_status='completed' then now() else null end,updated_at=now()
          where id=$1`, [row.id, dirty ? "pending" : "completed", recommendationIds[index] ?? null, lastErrorCode]);
      }
      await client.query("commit");
      return true;
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async processNext(asOfDate = shanghaiDate(new Date())): Promise<RecommendationRegenerationRequest | null> {
    const claim = await this.claimNext(asOfDate);
    if (!claim) return null;
    try {
      const prepared = await Promise.all(claim.requests.map((request) => this.generation.prepare(
        request.userId, request.targetDate, asOfDate, BUSINESS_TIMEZONE, claim.generationBatchId, "regeneration",
      )));
      if (prepared.some((value) => !value.command)) {
        await this.finishClaim(claim, [], "protected_plan");
      } else if (prepared.length === 2) {
        const records = await this.generation.persistence.publishHomePairGuarded(
          [prepared[0]!.command!, prepared[1]!.command!],
          { requestIds: claim.requests.map((request) => request.id), claimToken: claim.claimToken, generationBatchId: claim.generationBatchId },
        );
        await this.finishClaim(claim, records.map((record: { id: string }) => record.id));
      } else {
        const record = await this.generation.persistence.publishGuarded(
          prepared[0]!.command!,
          { requestIds: [claim.requests[0]!.id], claimToken: claim.claimToken, generationBatchId: claim.generationBatchId },
        );
        await this.finishClaim(claim, [record.id]);
      }
    } catch (error) {
      await this.failClaim(claim, classify(error));
    }
    return this.get(claim.requests[0]!.userId, claim.requests[0]!.id);
  }

  private async failClaim(claim: RecommendationRegenerationClaim, code: ReturnType<typeof classify>): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const rows = await lockClaim(client, claim);
      if (!rows) { await client.query("rollback"); return false; }
      const failed = rows.some((row) => row.attempt_count >= row.max_attempts);
      const nextSeconds = Math.min(3600, 30 * 2 ** Math.max(0, Math.max(...rows.map((row) => row.attempt_count)) - 1));
      for (const row of rows) {
        const dirty = row.trigger_version > row.claimed_trigger_version;
        const status = dirty ? "pending" : failed ? "failed" : "pending";
        await client.query(`update recommendation_regeneration_requests set status=$2::recommendation_regeneration_status,last_error_code=$3,
          claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,
          next_attempt_at=case when $4 then now() else now()+make_interval(secs=>$5::int) end,
          completed_at=case when $2::recommendation_regeneration_status='failed' then now() else null end,updated_at=now() where id=$1`,
        [row.id, status, code, dirty, nextSeconds]);
      }
      await client.query("commit");
      return true;
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
    finally { client.release(); }
  }
}

async function ensurePairRequest(client: PoolClient, candidate: QueryResultRow, targetDate: string) {
  const fingerprint = hash(`${candidate.user_id}:${targetDate}:home_pair`);
  await client.query(`insert into recommendation_regeneration_requests(user_id,target_date,reasons,content_fingerprint,next_attempt_at)
    values($1,$2,$3,$4,now()) on conflict (user_id,target_date) where status in ('pending','processing') do nothing`,
  [candidate.user_id, targetDate, candidate.reasons, fingerprint]);
}

async function lockClaim(client: PoolClient, claim: RecommendationRegenerationClaim): Promise<QueryResultRow[] | null> {
  const rows = (await client.query(`select * from recommendation_regeneration_requests
    where id=any($1::uuid[]) and status='processing' and claim_token=$2 and lease_expires_at>now()
    order by target_date for update`, [claim.requests.map((request) => request.id), claim.claimToken])).rows;
  return rows.length === claim.requests.length ? rows : null;
}

function parseClaimedRow(row: QueryResultRow): ClaimedRequest { return { ...parseRow(row), claimedTriggerVersion: row.claimed_trigger_version }; }
function parseRow(row: QueryResultRow): RecommendationRegenerationRequest {
  const iso = (value: unknown) => value === null ? null : new Date(String(value)).toISOString();
  return RecommendationRegenerationRequestSchema.parse({ id: row.id, userId: row.user_id, targetDate: dateOf(row.target_date), reasons: row.reasons, clientMutationIds: row.client_mutation_ids, status: row.status, attemptCount: row.attempt_count, maxAttempts: row.max_attempts, nextAttemptAt: iso(row.next_attempt_at), lockedAt: iso(row.locked_at), lastErrorCode: row.last_error_code, resultRecommendationId: row.result_recommendation_id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), completedAt: iso(row.completed_at) });
}
function dateOf(value: unknown) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return String(value).slice(0, 10);
}
function addDays(date: string, count: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function shanghaiDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function classify(error: unknown): "weather_unavailable" | "candidate_generation_failed" | "persistence_failed" | "unknown" { const message = error instanceof Error ? error.message : ""; if (message.includes("weather")) return "weather_unavailable"; if (message.includes("persist") || message.includes("recommendation") || message.includes("claim")) return "persistence_failed"; return message ? "candidate_generation_failed" : "unknown"; }
