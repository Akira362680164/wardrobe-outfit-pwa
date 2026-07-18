import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RecommendationActionService } from "../src/recommendations/action-service.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const schema = `run_recommendation_action_${process.pid}`;
let pool: Pool;

describe("recommendation reject action real PostgreSQL persistence", () => {
  beforeAll(async () => {
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`create schema ${schema}`);
    await admin.query(`create table ${schema}.daily_recommendations (id uuid primary key,user_id uuid not null,revision int not null,payload jsonb not null)`);
    await admin.query(`create table ${schema}.recommendation_actions (id uuid primary key default gen_random_uuid(),user_id uuid not null,recommendation_id uuid,candidate_id uuid not null,client_mutation_id uuid not null,action text not null,payload jsonb not null default '{}',created_at timestamptz not null default now(),unique(user_id,client_mutation_id))`);
    await admin.end();
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  });

  afterAll(async () => {
    await pool?.end();
    const admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  });

  it("lands a controlled reason once and rejects changed replay payload", async () => {
    const userId = randomUUID();
    const recommendationId = randomUUID();
    const candidateId = randomUUID();
    const clientMutationId = randomUUID();
    await pool.query("insert into daily_recommendations(id,user_id,revision,payload) values($1,$2,3,$3::jsonb)", [recommendationId, userId, JSON.stringify({ engineOutput: { recommendations: [{ candidateId }] } })]);
    const service = new RecommendationActionService(pool);
    const command = { clientMutationId, recommendationId, expectedRecommendationRevision: 3, candidateId, reason: "style" as const };
    expect(await service.reject(userId, command)).toMatchObject({ status: "committed", idempotentReplay: false });
    expect(await service.reject(userId, command)).toMatchObject({ status: "committed", idempotentReplay: true });
    await expect(service.reject(userId, { ...command, reason: "weather" })).rejects.toMatchObject({ statusCode: 409, details: { reasonCode: "mutation_payload_conflict" } });
    const row = (await pool.query("select action,payload from recommendation_actions where user_id=$1", [userId])).rows[0];
    expect(row).toMatchObject({ action: "rejected", payload: { reason: "style", recommendationRevision: 3 } });
  });
});
