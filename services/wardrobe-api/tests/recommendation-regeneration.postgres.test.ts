import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { RecommendationRegenerationConflictError, RecommendationRegenerationService } from "../src/recommendations/regeneration-service.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const schema = `run_recommendation_regeneration_${process.pid}`;
const admin = new Pool({ connectionString: databaseUrl, max: 4 });
let pool: Pool;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const migrationsDir = resolve(process.cwd(), "migrations");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const add = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

beforeAll(async () => {
  await admin.query(`drop schema if exists ${quote(schema)} cascade`); await admin.query(`create schema ${quote(schema)}`);
  const client = await admin.connect();
  try { await client.query(`set search_path to ${quote(schema)}`); for (const file of readdirSync(migrationsDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) await client.query(readFileSync(resolve(migrationsDir, file), "utf8")); }
  finally { client.release(); }
  pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 12 });
}, 120_000);
afterAll(async () => { await pool?.end(); await admin.query(`drop schema if exists ${quote(schema)} cascade`); await admin.end(); }, 30_000);
async function user() { const id = randomUUID(); await pool.query("insert into users(id) values($1)", [id]); return id; }

describe("persistent recommendation regeneration requests", () => {
  it("is idempotent for the same mutation, conflicts across content, and merges concurrent requests per user-date", async () => {
    const userId = await user(); const service = new RecommendationRegenerationService(pool, {} as any); const mutation = randomUUID();
    const [left, right] = await Promise.all([service.enqueueExplicit(userId, today, { clientMutationId: mutation }), service.enqueueExplicit(userId, today, { clientMutationId: mutation })]);
    expect(left.id).toBe(right.id);
    await expect(service.enqueueExplicit(userId, add(today, 1), { clientMutationId: mutation })).rejects.toBeInstanceOf(RecommendationRegenerationConflictError);
    const second = randomUUID(); const merged = await service.enqueueExplicit(userId, today, { clientMutationId: second });
    expect(new Set(merged.clientMutationIds)).toEqual(new Set([mutation, second]));
    expect((await pool.query("select count(*)::int count from recommendation_regeneration_requests where user_id=$1 and status in ('pending','processing')", [userId])).rows[0].count).toBe(1);
  });

  it("creates bounded trigger requests and cascades them with account deletion", async () => {
    const userId = await user();
    await pool.query(`insert into user_location_profiles(user_id,location_id,display_name,timezone,revision,client_mutation_id,mutation_fingerprint) values($1,'101020100','上海','Asia/Shanghai',1,$2,$3)`, [userId, randomUUID(), "a".repeat(64)]);
    const rows = (await pool.query("select target_date::text,reasons from recommendation_regeneration_requests where user_id=$1 order by target_date", [userId])).rows;
    expect(rows).toHaveLength(7); expect(rows.every((row) => row.reasons.includes("home_city_changed"))).toBe(true);
    await pool.query("delete from users where id=$1", [userId]);
    expect((await pool.query("select count(*)::int count from recommendation_regeneration_requests where user_id=$1", [userId])).rows[0].count).toBe(0);
  });

  it("claims with SKIP LOCKED, bounds retries, and keeps controlled errors", async () => {
    await pool.query("update recommendation_regeneration_requests set status='completed',completed_at=now() where status in ('pending','processing')");
    const userId = await user();
    const failingGeneration = { prepare: async () => { throw new Error("weather unavailable"); }, persistence: { publish: async () => { throw new Error("must not publish"); } } };
    const service = new RecommendationRegenerationService(pool, failingGeneration as any);
    const first = await service.enqueueExplicit(userId, today, { clientMutationId: randomUUID() });
    await pool.query("update recommendation_regeneration_requests set max_attempts=1 where id=$1", [first.id]);
    const processed = await service.processNext(today);
    expect(processed).toMatchObject({ id: first.id, status: "failed", attemptCount: 1, lastErrorCode: "weather_unavailable" });
    expect(await service.processNext(today)).toBeNull();
  });
});
