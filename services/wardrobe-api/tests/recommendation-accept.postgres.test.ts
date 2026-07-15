import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { generateRecommendationsV3, RecommendationAcceptService, RecommendationPersistenceService, type RecommendationAcceptStage } from "../src/recommendations/index.js";
import { PublishDailyRecommendationCommandSchema, type AcceptRecommendationCommand, type RecommendationGarment } from "@wardrobe/cloud-contracts";
import { buildLocationlessInput } from "./fixtures/recommendations/v2-scenarios.js";
import { mapGarmentRole } from "../src/recommendations/engine.js";

const url = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const schema = `run_recommendation_accept_${process.pid}`;
const admin = new Pool({ connectionString: url, max: 3 });
let pool: Pool;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const migrationsDir = resolve(process.cwd(), "migrations");

beforeAll(async () => {
  await admin.query(`drop schema if exists ${quote(schema)} cascade`); await admin.query(`create schema ${quote(schema)}`);
  const client = await admin.connect();
  try { await client.query(`set search_path to ${quote(schema)}`); for (const file of readdirSync(migrationsDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) await client.query(readFileSync(resolve(migrationsDir, file), "utf8")); } finally { client.release(); }
  pool = new Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 12 });
}, 120_000);
afterAll(async () => { await pool?.end(); await admin.query(`drop schema if exists ${quote(schema)} cascade`); await admin.end(); }, 30_000);

async function seed() {
  const input = buildLocationlessInput(); const userId = randomUUID(); input.userId = userId;
  const remap = new Map(input.garments.map((garment) => [garment.id, randomUUID()]));
  input.garments.forEach((g) => { g.id = remap.get(g.id)!; g.userId = userId; });
  input.savedOutfits.forEach((outfit) => { outfit.userId = userId; outfit.garmentIds = outfit.garmentIds.map((id) => remap.get(id) ?? id); });
  input.wearHistory.forEach((event) => { event.garmentIds = event.garmentIds.map((id) => remap.get(id) ?? id); });
  input.feedback.forEach((event) => { event.garmentIds = event.garmentIds.map((id) => remap.get(id) ?? id); });
  input.anchorGarmentIds = input.anchorGarmentIds.map((id) => remap.get(id) ?? id);
  await pool.query("insert into users(id) values($1)", [userId]);
  for (const [index, garment] of input.garments.entries()) {
    await pool.query("insert into garments(id,user_id,origin_device_id,payload) values($1,$2,'seed',$3::jsonb)", [garment.id, userId, JSON.stringify({ name: `garment-${index}`, legacyItemId: index + 1, category: garment.category, subcategory: garment.subcategory, status: "active", colors: garment.colors, seasons: garment.seasons, styles: garment.styles, formality: garment.formality, warmth: garment.warmth, temperatureMinC: garment.temperatureMinC, temperatureMaxC: garment.temperatureMaxC, primaryImageUrl: "https://example.invalid/image" })]);
  }
  const output = await generateRecommendationsV3(input); const candidate = output.recommendations[0]!;
  const command = PublishDailyRecommendationCommandSchema.parse({ userId, targetDate: input.dateContextInput.date, targetTimezone: input.dateContextInput.timezone, generationBatchId: randomUUID(), generationRequestId: randomUUID(), inputFingerprint: "a".repeat(64), generationSource: "foreground", readiness: output.readiness.status, generationMode: "rule_only", payload: { schemaVersion: 3, resolvedContext: input.resolvedContext, dateContextInput: input.dateContextInput, engineOutput: output }, algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1", pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" }, generatedAt: "2026-07-15T00:00:00.000Z", expiresAt: "2026-08-15T00:00:00.000Z" });
  const rec = await new RecommendationPersistenceService(pool).publish(command);
  const byId = new Map(input.garments.map((g) => [g.id, g]));
  const validateSelection = async (_user: string, _date: string, ids: readonly string[]) => ids.map((id) => { const garment = byId.get(id)!; return { garment: garment as RecommendationGarment, role: mapGarmentRole(garment)! }; });
  const accept: AcceptRecommendationCommand = { clientMutationId: randomUUID(), recommendationId: rec.id, expectedRecommendationRevision: rec.revision, candidateId: candidate.candidateId, selectedGarmentIds: candidate.garmentIds };
  return { userId, input, candidate, rec, accept, validateSelection };
}

describe("recommendation accept real PostgreSQL transaction", () => {
  it("allows only one primary when two database connections accept concurrently", async () => {
    const s = await seed(); const service = new RecommendationAcceptService(pool, { validateSelection: s.validateSelection });
    const results = await Promise.allSettled([
      service.accept(s.userId, "device-a", s.input.dateContextInput.date, s.accept),
      service.accept(s.userId, "device-b", s.input.dateContextInput.date, { ...s.accept, clientMutationId: randomUUID() }),
    ]);
    expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((value) => value.status === "rejected")).toHaveLength(1);
    expect((await pool.query("select count(*)::int n from outfit_plans where user_id=$1 and payload->>'isPrimary'='true'", [s.userId])).rows[0].n).toBe(1);
  });

  it("commits no-outfit plan, action and mutation exactly once and replays the same plan", async () => {
    const s = await seed(); let validationCalls = 0;
    const service = new RecommendationAcceptService(pool, { validateSelection: async (...args) => { validationCalls += 1; if (validationCalls > 1) throw new Error("replay must not revalidate mutable state"); return s.validateSelection(...args); }, clock: () => new Date("2026-07-15T01:00:00.000Z") });
    const first = await service.accept(s.userId, "device-a", s.input.dateContextInput.date, s.accept);
    await pool.query("update garments set payload=jsonb_set(payload,'{status}','\"laundry\"') where id=$1", [s.accept.selectedGarmentIds[0]]);
    const replay = await service.accept(s.userId, "device-a", s.input.dateContextInput.date, s.accept);
    expect(replay.plan.id).toBe(first.plan.id); expect(replay.idempotentReplay).toBe(true); expect(first.plan.payload).not.toHaveProperty("outfitId");
    expect(validationCalls).toBe(1);
    expect((await pool.query("select count(*)::int n from outfit_plans where user_id=$1", [s.userId])).rows[0].n).toBe(1);
    expect((await pool.query("select count(*)::int n from recommendation_actions where user_id=$1", [s.userId])).rows[0].n).toBe(1);
    await expect(service.accept(s.userId, "device-a", s.input.dateContextInput.date, { ...s.accept, candidateId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("serializes two devices and demotes an explicitly replaced primary to backup", async () => {
    const s = await seed(); const service = new RecommendationAcceptService(pool, { validateSelection: s.validateSelection });
    const first = await service.accept(s.userId, "device-a", s.input.dateContextInput.date, s.accept);
    const next = { ...s.accept, clientMutationId: randomUUID(), replaceExistingPrimary: { planEntryId: first.plan.id, expectedRevision: first.plan.revision } };
    const second = await service.accept(s.userId, "device-b", s.input.dateContextInput.date, next);
    const rows = (await pool.query("select id,payload from outfit_plans where user_id=$1 order by created_at", [s.userId])).rows;
    expect(rows.find((r) => r.id === first.plan.id).payload).toMatchObject({ isPrimary: false, role: "backup" });
    expect(rows.find((r) => r.id === second.plan.id).payload).toMatchObject({ isPrimary: true, role: "primary" });
  });

  for (const stage of ["afterPlan", "afterBindings", "afterAction", "beforeCommit"] as RecommendationAcceptStage[]) it(`rolls back every write after ${stage} failure`, async () => {
    const s = await seed(); const service = new RecommendationAcceptService(pool, { validateSelection: s.validateSelection, fault: (seen) => { if (seen === stage) throw new Error(`fault-${stage}`); } });
    await expect(service.accept(s.userId, "device-a", s.input.dateContextInput.date, s.accept)).rejects.toThrow(`fault-${stage}`);
    for (const table of ["outfit_plans", "recommendation_actions", "sync_mutations"]) expect((await pool.query(`select count(*)::int n from ${table} where user_id=$1`, [s.userId])).rows[0].n).toBe(0);
  });
});
