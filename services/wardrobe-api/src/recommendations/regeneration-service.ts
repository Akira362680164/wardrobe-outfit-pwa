import { createHash, randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  RealDateSchema,
  ReassessRecommendationCommandSchema,
  RecommendationRegenerationRequestSchema,
  type RecommendationRegenerationRequest,
} from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import { RecommendationGenerationServiceV2 } from "./generation-service-v2.js";

export class RecommendationRegenerationConflictError extends Error { readonly code = "REGENERATION_MUTATION_CONFLICT"; }

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
      const replay = (await client.query("select * from recommendation_regeneration_requests where user_id=$1 and $2::uuid=any(client_mutation_ids) order by created_at desc limit 1", [userId, command.clientMutationId])).rows[0];
      if (replay) {
        if (dateOf(replay.target_date) !== date || replay.content_fingerprint !== fingerprint) throw new RecommendationRegenerationConflictError();
        await client.query("commit"); return parseRow(replay);
      }
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-regeneration:${userId}:${date}`]);
      const active = (await client.query("select * from recommendation_regeneration_requests where user_id=$1 and target_date=$2 and status in ('pending','processing') for update", [userId, date])).rows[0];
      const row = active
        ? (await client.query(`update recommendation_regeneration_requests set reasons=(select array_agg(distinct value order by value) from unnest(reasons || ARRAY['explicit_reassess']) value), client_mutation_ids=array_append(client_mutation_ids,$2::uuid), updated_at=now() where id=$1 returning *`, [active.id, command.clientMutationId])).rows[0]
        : (await client.query(`insert into recommendation_regeneration_requests(user_id,target_date,reasons,client_mutation_ids,content_fingerprint) values($1,$2,ARRAY['explicit_reassess'],ARRAY[$3::uuid],$4) returning *`, [userId, date, command.clientMutationId, fingerprint])).rows[0];
      await client.query("commit"); return parseRow(row);
    } catch (error) { await client.query("rollback").catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async get(userId: string, requestId: string) {
    const row = (await this.pool.query("select * from recommendation_regeneration_requests where id=$1 and user_id=$2", [requestId, userId])).rows[0];
    return row ? parseRow(row) : null;
  }

  async processNext(asOfDate = shanghaiDate(new Date())): Promise<RecommendationRegenerationRequest | null> {
    const row = (await this.pool.query(`with candidate as (
      select id from recommendation_regeneration_requests where status='pending' and next_attempt_at<=now() order by next_attempt_at,created_at for update skip locked limit 1
    ) update recommendation_regeneration_requests r set status='processing',attempt_count=attempt_count+1,locked_at=now(),updated_at=now() from candidate where r.id=candidate.id returning r.*`)).rows[0];
    if (!row) return null;
    try {
      const batchId = randomUUID();
      const prepared = await this.generation.prepare(row.user_id, String(row.target_date).slice(0, 10), asOfDate, "Asia/Shanghai", batchId, "regeneration");
      if (!prepared.command) {
        const completed = (await this.pool.query("update recommendation_regeneration_requests set status='completed',last_error_code='protected_plan',locked_at=null,completed_at=now(),updated_at=now() where id=$1 returning *", [row.id])).rows[0];
        return parseRow(completed);
      }
      const record = await this.generation.persistence.publish(prepared.command);
      const completed = (await this.pool.query("update recommendation_regeneration_requests set status='completed',result_recommendation_id=$2,last_error_code=null,locked_at=null,completed_at=now(),updated_at=now() where id=$1 returning *", [row.id, record.id])).rows[0];
      return parseRow(completed);
    } catch (error) {
      const code = classify(error);
      const failed = row.attempt_count >= row.max_attempts;
      const nextSeconds = Math.min(3600, 30 * 2 ** Math.max(0, row.attempt_count - 1));
      const updated = failed
        ? (await this.pool.query("update recommendation_regeneration_requests set status='failed',last_error_code=$2,locked_at=null,completed_at=now(),updated_at=now() where id=$1 returning *", [row.id, code])).rows[0]
        : (await this.pool.query("update recommendation_regeneration_requests set status='pending',last_error_code=$2,locked_at=null,next_attempt_at=now()+make_interval(secs => $3::int),completed_at=null,updated_at=now() where id=$1 returning *", [row.id, code, nextSeconds])).rows[0];
      return parseRow(updated);
    }
  }
}

function parseRow(row: QueryResultRow): RecommendationRegenerationRequest { const iso = (value: unknown) => value === null ? null : new Date(String(value)).toISOString(); return RecommendationRegenerationRequestSchema.parse({ id: row.id, userId: row.user_id, targetDate: dateOf(row.target_date), reasons: row.reasons, clientMutationIds: row.client_mutation_ids, status: row.status, attemptCount: row.attempt_count, maxAttempts: row.max_attempts, nextAttemptAt: iso(row.next_attempt_at), lockedAt: iso(row.locked_at), lastErrorCode: row.last_error_code, resultRecommendationId: row.result_recommendation_id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), completedAt: iso(row.completed_at) }); }
function dateOf(value: unknown) { return value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : String(value).slice(0, 10); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function shanghaiDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function classify(error: unknown): "weather_unavailable" | "candidate_generation_failed" | "persistence_failed" | "unknown" { const message = error instanceof Error ? error.message : ""; if (message.includes("weather")) return "weather_unavailable"; if (message.includes("persist") || message.includes("recommendation")) return "persistence_failed"; return message ? "candidate_generation_failed" : "unknown"; }
