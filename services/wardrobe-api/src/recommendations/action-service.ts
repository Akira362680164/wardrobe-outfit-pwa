import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  RejectRecommendationResponseSchema,
  type RejectRecommendationCommand,
  type RejectRecommendationResponse,
} from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import { WorkspaceApiError } from "../workspace/errors.js";

export class RecommendationActionService {
  constructor(private readonly pool: Pool = getPostgresPool()) {}

  async reject(userId: string, command: RejectRecommendationCommand): Promise<RejectRecommendationResponse> {
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`recommendation-action:${userId}:${command.clientMutationId}`]);
      const existing = await client.query("select id,payload from recommendation_actions where user_id=$1 and client_mutation_id=$2 for update", [userId, command.clientMutationId]);
      if (existing.rows[0]) {
        if (existing.rows[0].payload?.fingerprint !== fingerprint) throw conflict("mutation_payload_conflict");
        await client.query("commit");
        return RejectRecommendationResponseSchema.parse({ status: "committed", idempotentReplay: true, actionId: existing.rows[0].id });
      }
      const recResult = await client.query("select revision,payload from daily_recommendations where id=$1 and user_id=$2 for share", [command.recommendationId, userId]);
      const rec = recResult.rows[0];
      if (!rec || rec.revision !== command.expectedRecommendationRevision) throw conflict("recommendation_no_longer_valid");
      const candidates = [...(rec.payload?.engineOutput?.recommendations ?? []), ...(rec.payload?.engineOutput?.shortlist ?? [])];
      if (!candidates.some((candidate: any) => candidate.candidateId === command.candidateId)) throw conflict("recommendation_no_longer_valid");
      const inserted = await client.query("insert into recommendation_actions(user_id,recommendation_id,action,candidate_id,client_mutation_id,payload) values($1,$2,'rejected',$3,$4,$5::jsonb) returning id", [userId, command.recommendationId, command.candidateId, command.clientMutationId, JSON.stringify({ fingerprint, reason: command.reason, recommendationRevision: command.expectedRecommendationRevision })]);
      await client.query("commit");
      return RejectRecommendationResponseSchema.parse({ status: "committed", idempotentReplay: false, actionId: inserted.rows[0].id });
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}

function conflict(reasonCode: string) {
  const details = { reasonCode };
  return new WorkspaceApiError(409, "conflict", reasonCode, false, details, details);
}
