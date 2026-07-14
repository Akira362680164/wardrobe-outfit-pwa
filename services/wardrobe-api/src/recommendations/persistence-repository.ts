import type { PoolClient, QueryResultRow } from "pg";
import {
  DailyRecommendationRecordSchema,
  type DailyRecommendationRecord,
  type PublishDailyRecommendationCommand,
} from "@wardrobe/cloud-contracts";

export interface InsertRecommendationInput {
  command: PublishDailyRecommendationCommand;
  revision: number;
  fingerprint: string;
}

export class RecommendationPersistenceRepository {
  async acquireCurrentLock(client: PoolClient, userId: string, targetDate: string): Promise<void> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`recommendation-current:${userId}:${targetDate}`]);
  }

  async acquireGenerationRequestLock(client: PoolClient, userId: string, requestId: string): Promise<void> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`recommendation-generation-request:${userId}:${requestId}`]);
  }

  async findByGenerationRequest(client: PoolClient, userId: string, requestId: string): Promise<DailyRecommendationRecord | null> {
    const result = await client.query("select * from daily_recommendations where user_id = $1 and generation_request_id = $2", [userId, requestId]);
    return result.rows[0] ? parseRow(result.rows[0]) : null;
  }

  async nextRevision(client: PoolClient, userId: string, targetDate: string): Promise<number> {
    const result = await client.query<{ revision: number }>("select coalesce(max(revision), 0)::integer + 1 as revision from daily_recommendations where user_id = $1 and target_date = $2", [userId, targetDate]);
    return result.rows[0]!.revision;
  }

  async insertNonCurrent(client: PoolClient, input: InsertRecommendationInput): Promise<string> {
    const command = input.command;
    const result = await client.query<{ id: string }>(`
      insert into daily_recommendations (
        user_id, target_date, target_timezone, revision, generation_batch_id, generation_request_id,
        payload_fingerprint, readiness, generation_mode, is_current, superseded_at, payload,
        algorithm_version, rule_version, paw_program_versions, generated_at, expires_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11::jsonb, $12, $13, $14::jsonb, $15, $16)
      returning id
    `, [command.userId, command.targetDate, command.targetTimezone, input.revision, command.generationBatchId, command.generationRequestId, input.fingerprint, command.readiness, command.generationMode, command.generatedAt, JSON.stringify(command.payload), command.algorithmVersion, command.ruleVersion, JSON.stringify(command.pawProgramVersions), command.generatedAt, command.expiresAt]);
    return result.rows[0]!.id;
  }

  async supersedeCurrent(client: PoolClient, userId: string, targetDate: string, nextId: string, supersededAt: string): Promise<void> {
    await client.query("update daily_recommendations set is_current = false, superseded_at = $4, updated_at = now() where user_id = $1 and target_date = $2 and is_current = true and id <> $3", [userId, targetDate, nextId, supersededAt]);
  }

  async promote(client: PoolClient, id: string): Promise<void> {
    const result = await client.query("update daily_recommendations set is_current = true, superseded_at = null, updated_at = now() where id = $1", [id]);
    if (result.rowCount !== 1) throw new Error("recommendation promotion target missing");
  }

  async findById(client: PoolClient, id: string): Promise<DailyRecommendationRecord> {
    const result = await client.query("select * from daily_recommendations where id = $1", [id]);
    if (!result.rows[0]) throw new Error("recommendation record missing after publish");
    return parseRow(result.rows[0]);
  }

  async findCurrent(client: PoolClient, userId: string, targetDate: string): Promise<DailyRecommendationRecord | null> {
    const result = await client.query("select * from daily_recommendations where user_id = $1 and target_date = $2 and is_current = true", [userId, targetDate]);
    return result.rows[0] ? parseRow(result.rows[0]) : null;
  }

  async listCurrent(client: PoolClient, userId: string, targetDates?: readonly string[]): Promise<DailyRecommendationRecord[]> {
    const result = targetDates && targetDates.length > 0
      ? await client.query("select * from daily_recommendations where user_id = $1 and is_current = true and target_date = any($2::date[]) order by target_date", [userId, targetDates])
      : await client.query("select * from daily_recommendations where user_id = $1 and is_current = true order by target_date", [userId]);
    return result.rows.map(parseRow);
  }

  async cleanupExpiredNonCurrent(client: PoolClient, beforeIso: string): Promise<number> {
    const result = await client.query("delete from daily_recommendations where is_current = false and expires_at < $1", [beforeIso]);
    return result.rowCount ?? 0;
  }
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function parseRow(row: QueryResultRow): DailyRecommendationRecord {
  return DailyRecommendationRecordSchema.parse({
    id: row.id,
    userId: row.user_id,
    targetDate: row.target_date instanceof Date ? `${row.target_date.getFullYear()}-${String(row.target_date.getMonth() + 1).padStart(2, "0")}-${String(row.target_date.getDate()).padStart(2, "0")}` : String(row.target_date).slice(0, 10),
    targetTimezone: row.target_timezone,
    revision: row.revision,
    generationBatchId: row.generation_batch_id,
    generationRequestId: row.generation_request_id,
    payloadFingerprint: row.payload_fingerprint,
    readiness: row.readiness,
    generationMode: row.generation_mode,
    isCurrent: row.is_current,
    lifecycle: row.is_current ? "current" : "superseded",
    supersededAt: row.superseded_at === null ? null : iso(row.superseded_at),
    payload: row.payload,
    algorithmVersion: row.algorithm_version,
    ruleVersion: row.rule_version,
    pawProgramVersions: row.paw_program_versions,
    generatedAt: iso(row.generated_at),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}
