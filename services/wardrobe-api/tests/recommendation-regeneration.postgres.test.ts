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

  it("replays a trigger-first explicit mutation after the original response is lost", async () => {
    const userId = await user();
    await pool.query("select enqueue_recommendation_regeneration($1,$2,'garment_changed')", [userId, today]);
    const service = new RecommendationRegenerationService(pool, {} as any);
    const clientMutationId = randomUUID();
    const first = await service.enqueueExplicit(userId, today, { clientMutationId });
    const replay = await service.enqueueExplicit(userId, today, { clientMutationId });
    expect(replay).toEqual(first);
    const stored = (await pool.query("select client_mutation_fingerprints from recommendation_regeneration_requests where id=$1", [first.id])).rows[0];
    expect(stored.client_mutation_fingerprints[clientMutationId]).toMatch(/^[a-f0-9]{64}$/);
    await expect(service.enqueueExplicit(userId, add(today, 1), { clientMutationId })).rejects.toBeInstanceOf(RecommendationRegenerationConflictError);
  });

  it("backfills pre-0023 explicit mutation fingerprints for replay compatibility", async () => {
    const userId = await user();
    const clientMutationId = randomUUID();
    const fingerprint = "b".repeat(64);
    const inserted = (await pool.query(`insert into recommendation_regeneration_requests(user_id,target_date,reasons,client_mutation_ids,content_fingerprint)
      values($1,$2,ARRAY['explicit_reassess'],$3::uuid[],$4) returning id`, [userId, add(today, 5), [clientMutationId], fingerprint])).rows[0];
    await pool.query(`update recommendation_regeneration_requests set client_mutation_fingerprints=jsonb_build_object($2::text,encode(public.digest($3,'sha256'),'hex')) where id=$1`, [inserted.id, clientMutationId, `${userId}:${add(today, 5)}:explicit_reassess`]);
    const replay = await new RecommendationRegenerationService(pool, {} as any).enqueueExplicit(userId, add(today, 5), { clientMutationId });
    expect(replay.id).toBe(inserted.id);
  });

  it("creates bounded trigger requests and cascades them with account deletion", async () => {
    const userId = await user();
    await pool.query(`insert into user_location_profiles(user_id,location_id,display_name,timezone,revision,client_mutation_id,mutation_fingerprint) values($1,'101020100','上海','Asia/Shanghai',1,$2,$3)`, [userId, randomUUID(), "a".repeat(64)]);
    const rows = (await pool.query("select target_date::text,reasons from recommendation_regeneration_requests where user_id=$1 order by target_date", [userId])).rows;
    expect(rows).toHaveLength(7); expect(rows.every((row) => row.reasons.includes("home_city_changed"))).toBe(true);
    await pool.query("delete from users where id=$1", [userId]);
    expect((await pool.query("select count(*)::int count from recommendation_regeneration_requests where user_id=$1", [userId])).rows[0].count).toBe(0);
  });

  it("does not enqueue garment dirtiness while account deletion cascades garments", async () => {
    const userId = await user();
    await pool.query("insert into garments(user_id,origin_device_id,payload) values($1,'account-delete-test',$2::jsonb)", [userId, JSON.stringify({ status: "active", category: "tops" })]);
    await expect(pool.query("delete from users where id=$1", [userId])).resolves.toBeDefined();
    expect((await pool.query("select count(*)::int count from garments where user_id=$1", [userId])).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int count from recommendation_regeneration_requests where user_id=$1", [userId])).rows[0].count).toBe(0);
  });

  it("claims with SKIP LOCKED, bounds retries, and keeps controlled errors", async () => {
    await pool.query("update recommendation_regeneration_requests set status='completed',claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,completed_at=now() where status in ('pending','processing')");
    const userId = await user();
    const failingGeneration = { prepare: async () => { throw new Error("weather unavailable"); }, persistence: { publish: async () => { throw new Error("must not publish"); } } };
    const service = new RecommendationRegenerationService(pool, failingGeneration as any);
    const first = await service.enqueueExplicit(userId, today, { clientMutationId: randomUUID() });
    await pool.query("update recommendation_regeneration_requests set max_attempts=1 where id=$1", [first.id]);
    const processed = await service.processNext(today);
    expect(processed).toMatchObject({ id: first.id, status: "failed", attemptCount: 1, lastErrorCode: "weather_unavailable" });
    expect(await service.processNext(today)).toBeNull();
  });

  it("publishes today and tomorrow as one claimed home pair", async () => {
    await pool.query("update recommendation_regeneration_requests set status='completed',claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,completed_at=now() where status in ('pending','processing')");
    const userId = await user();
    const prepared: Array<{ targetDate: string; batchId: string }> = [];
    let publishedDates: string[] = [];
    const generation = {
      prepare: async (_userId: string, targetDate: string, _asOf: string, _zone: string, batchId: string) => {
        prepared.push({ targetDate, batchId });
        return { command: { userId, targetDate, generationBatchId: batchId }, skipReason: null };
      },
      persistence: {
        publishHomePairGuarded: async (commands: any[]) => {
          publishedDates = commands.map((command) => command.targetDate).sort();
          return [{ id: null }, { id: null }];
        },
      },
    };
    const service = new RecommendationRegenerationService(pool, generation as any);
    await service.enqueueExplicit(userId, today, { clientMutationId: randomUUID() });
    await service.processNext(today);
    expect(prepared.map((entry) => entry.targetDate).sort()).toEqual([today, add(today, 1)]);
    expect(new Set(prepared.map((entry) => entry.batchId))).toHaveLength(1);
    expect(publishedDates).toEqual([today, add(today, 1)]);
    const rows = (await pool.query("select target_date::text,status from recommendation_regeneration_requests where user_id=$1 and target_date=any($2::date[]) order by target_date", [userId, [today, add(today, 1)]])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "completed")).toBe(true);
  });

  it("recovers expired leases, fences the old claim, and preserves triggers received while processing", async () => {
    await pool.query("update recommendation_regeneration_requests set status='completed',claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,completed_at=now() where status in ('pending','processing')");
    const userId = await user();
    const date = add(today, 3);
    const service = new RecommendationRegenerationService(pool, {} as any);
    await service.enqueueExplicit(userId, date, { clientMutationId: randomUUID() });
    const oldClaim = await service.claimNext(today);
    expect(oldClaim?.requests).toHaveLength(1);
    await pool.query("update recommendation_regeneration_requests set lease_expires_at=now()-interval '1 second' where id=$1", [oldClaim!.requests[0]!.id]);
    const newClaim = await service.claimNext(today);
    expect(newClaim?.claimToken).not.toBe(oldClaim?.claimToken);
    expect(await service.finishClaim(oldClaim!, [])).toBe(false);
    await pool.query("select enqueue_recommendation_regeneration($1,$2,'weather_changed')", [userId, date]);
    expect(await service.finishClaim(newClaim!, [])).toBe(true);
    const row = (await pool.query("select status,trigger_version,claimed_trigger_version,claim_token from recommendation_regeneration_requests where id=$1", [newClaim!.requests[0]!.id])).rows[0];
    expect(row.status).toBe("pending");
    expect(row.trigger_version).toBeGreaterThan(row.claimed_trigger_version);
    expect(row.claim_token).toBeNull();
  });

  it("reconsumes a retry exactly when next_attempt_at becomes due", async () => {
    await pool.query("update recommendation_regeneration_requests set status='completed',claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,completed_at=now() where status in ('pending','processing')");
    const userId = await user();
    const date = add(today, 4);
    const generation = { prepare: async () => { throw new Error("weather unavailable"); }, persistence: {} };
    const service = new RecommendationRegenerationService(pool, generation as any);
    const request = await service.enqueueExplicit(userId, date, { clientMutationId: randomUUID() });
    const first = await service.processNext(today);
    expect(first).toMatchObject({ id: request.id, status: "pending", attemptCount: 1 });
    expect(await service.processNext(today)).toBeNull();
    await pool.query("update recommendation_regeneration_requests set next_attempt_at=now() where id=$1", [request.id]);
    expect((await service.processNext(today))?.attemptCount).toBe(2);
  });
});
