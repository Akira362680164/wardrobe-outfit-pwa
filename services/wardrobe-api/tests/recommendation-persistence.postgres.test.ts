import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { PublishDailyRecommendationCommandSchema, type PublishDailyRecommendationCommand } from "@wardrobe/cloud-contracts";

import { generateRecommendations, generateRecommendationsV3, RecommendationGenerationConflictError, RecommendationJobRepository, RecommendationPersistenceService, RecommendationWorker, type RecommendationPublishStage } from "../src/recommendations/index.js";
import { RecommendationRegenerationService } from "../src/recommendations/regeneration-service.js";
import { RecommendationReadService } from "../src/recommendations/read-service.js";
import { buildFixtureInput } from "./fixtures/recommendations/scenarios.js";
import { buildLocationlessInput } from "./fixtures/recommendations/v2-scenarios.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const schema = `run_recommendation_1b_${process.pid}`;
const upgradeSchema = `${schema}_upgrade`;
const admin = new Pool({ connectionString: databaseUrl, max: 4 });
let pool: Pool;
let service: RecommendationPersistenceService;
let baseCommand: PublishDailyRecommendationCommand;
let baseV3Command: PublishDailyRecommendationCommand;

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const migrationsDir = resolve(process.cwd(), "migrations");
const migrationFiles = readdirSync(migrationsDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();

async function createSchema(name: string): Promise<void> {
  await admin.query(`drop schema if exists ${quote(name)} cascade`);
  await admin.query(`create schema ${quote(name)}`);
}

async function applyMigrations(name: string, files = migrationFiles): Promise<void> {
  const client = await admin.connect();
  try {
    await client.query(`set search_path to ${quote(name)}`);
    for (const file of files) await client.query(readFileSync(resolve(migrationsDir, file), "utf8"));
  } finally {
    client.release();
  }
}

async function createUser(userId = randomUUID()): Promise<string> {
  await pool.query("insert into users (id) values ($1)", [userId]);
  return userId;
}

function command(overrides: Partial<PublishDailyRecommendationCommand> = {}): PublishDailyRecommendationCommand {
  const candidate = {
    ...structuredClone(baseCommand),
    generationRequestId: randomUUID(),
    generationBatchId: randomUUID(),
    ...overrides,
  };
  candidate.payload.dateContextInput.date = candidate.targetDate;
  candidate.payload.dateContextInput.timezone = candidate.targetTimezone;
  return PublishDailyRecommendationCommandSchema.parse(candidate);
}

function v3Command(overrides: Partial<PublishDailyRecommendationCommand> = {}): PublishDailyRecommendationCommand {
  return PublishDailyRecommendationCommandSchema.parse({ ...structuredClone(baseV3Command), generationRequestId: randomUUID(), generationBatchId: randomUUID(), ...overrides });
}

async function rows(userId: string, targetDate: string) {
  return (await pool.query("select id, revision, generation_request_id, is_current, superseded_at from daily_recommendations where user_id = $1 and target_date = $2 order by revision", [userId, targetDate])).rows;
}

beforeAll(async () => {
  await createSchema(schema);
  await applyMigrations(schema);
  pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 24 });
  pool.on("error", () => { /* expected only when the termination fault test kills its writer backend */ });
  service = new RecommendationPersistenceService(pool);
  const input = buildFixtureInput();
  const output = await generateRecommendations(input);
  baseCommand = PublishDailyRecommendationCommandSchema.parse({
    userId: input.userId,
    targetDate: input.dateContextInput.date,
    targetTimezone: input.dateContextInput.timezone,
    generationBatchId: randomUUID(),
    generationRequestId: input.requestId,
    readiness: output.readiness.status,
    generationMode: "rule_only",
    payload: { engineOutput: output, dateContextInput: input.dateContextInput },
    algorithmVersion: "wardora-recommendation-1b.1",
    ruleVersion: output.ruleVersion,
    pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" },
    generatedAt: "2026-07-13T23:30:00.000Z",
    expiresAt: "2026-08-13T23:30:00.000Z",
  });
  const v3Input = buildLocationlessInput();
  const v3Output = await generateRecommendationsV3(v3Input);
  baseV3Command = PublishDailyRecommendationCommandSchema.parse({
    userId: v3Input.userId, targetDate: v3Input.dateContextInput.date, targetTimezone: v3Input.dateContextInput.timezone,
    generationBatchId: randomUUID(), generationRequestId: randomUUID(), inputFingerprint: "a".repeat(64), generationSource: "foreground",
    readiness: v3Output.readiness.status, generationMode: "rule_only",
    payload: { schemaVersion: 3, resolvedContext: v3Input.resolvedContext, dateContextInput: v3Input.dateContextInput, engineOutput: v3Output },
    algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1",
    pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" }, generatedAt: "2026-07-14T00:00:00.000Z", expiresAt: "2026-08-14T00:00:00.000Z",
  });
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await admin.query(`drop schema if exists ${quote(schema)} cascade`);
  await admin.query(`drop schema if exists ${quote(upgradeSchema)} cascade`);
  await admin.end();
}, 30_000);

describe("daily recommendation real PostgreSQL migration", () => {
  it("replays the empty database and upgrades the current 0018 baseline through 0025", async () => {
    const full = await pool.query("select count(*)::int as count from information_schema.tables where table_schema = $1 and table_name = 'daily_recommendations'", [schema]);
    expect(full.rows[0].count).toBe(1);
    await createSchema(upgradeSchema);
    await applyMigrations(upgradeSchema, migrationFiles.filter((file) => !file.startsWith("0019_") && !file.startsWith("0020_") && !file.startsWith("0022_") && !file.startsWith("0023_") && !file.startsWith("0024_") && !file.startsWith("0025_")));
    expect((await admin.query("select to_regclass($1) as table_name", [`${upgradeSchema}.daily_recommendations`])).rows[0].table_name).toBeNull();
    await applyMigrations(upgradeSchema, migrationFiles.filter((file) => file.startsWith("0019_") || file.startsWith("0020_") || file.startsWith("0022_") || file.startsWith("0023_") || file.startsWith("0024_") || file.startsWith("0025_")));
    expect((await admin.query("select to_regclass($1) as table_name", [`${upgradeSchema}.daily_recommendations`])).rows[0].table_name).toBe("daily_recommendations");
    expect((await admin.query("select to_regclass($1) as table_name", [`${upgradeSchema}.recommendation_job_runs`])).rows[0].table_name).toBe("recommendation_job_runs");
    expect((await admin.query("select to_regclass($1) as table_name", [`${upgradeSchema}.recommendation_regeneration_requests`])).rows[0].table_name).toBe("recommendation_regeneration_requests");
    expect((await admin.query("select column_name from information_schema.columns where table_schema=$1 and table_name='daily_recommendations' and column_name='input_fingerprint'", [upgradeSchema])).rowCount).toBe(1);
    expect((await admin.query("select to_regclass($1) as table_name", [`${upgradeSchema}.recommendation_actions`])).rows[0].table_name).toBe("recommendation_actions");
  }, 120_000);
});

describe("daily recommendation atomic publication and idempotency", () => {
  it("reuses one V3 current for concurrent same-input publishers across connections", async () => {
    const userId = await createUser();
    const published = await Promise.all(Array.from({ length: 12 }, () => service.publish(v3Command({ userId }))));
    expect(new Set(published.map((record) => record.id)).size).toBe(1);
    expect(published[0]?.inputFingerprint).toBe("a".repeat(64));
    expect((await rows(userId, baseV3Command.targetDate))).toHaveLength(1);
  }, 30_000);

  it("makes force refresh mutation idempotent and rejects same key with changed input", async () => {
    const userId = await createUser();
    const generationRequestId = randomUUID();
    const first = v3Command({ userId, generationRequestId, forceRefresh: true });
    const created = await service.publish(first);
    const replay = await service.publish({ ...structuredClone(first), generationBatchId: randomUUID(), generatedAt: "2026-07-14T00:01:00.000Z", expiresAt: "2026-08-14T00:01:00.000Z" });
    expect(replay.id).toBe(created.id);
    await expect(service.publish({ ...structuredClone(first), inputFingerprint: "b".repeat(64) })).rejects.toBeInstanceOf(RecommendationGenerationConflictError);
    expect((await rows(userId, first.targetDate))).toHaveLength(1);
  });
  it("lets only one worker claim a request and rejects a stale lease token before current publication", async () => {
    await pool.query("update recommendation_regeneration_requests set status='completed',claim_token=null,lease_expires_at=null,generation_batch_id=null,locked_at=null,completed_at=now() where status in ('pending','processing')");
    const userId = await createUser();
    const targetDate = "2026-07-18";
    const regeneration = new RecommendationRegenerationService(pool, {} as any);
    await regeneration.enqueueExplicit(userId, targetDate, { clientMutationId: randomUUID() });
    const [left, right] = await Promise.all([regeneration.claimNext("2026-07-14"), regeneration.claimNext("2026-07-14")]);
    const oldClaim = left ?? right;
    expect([left, right].filter(Boolean)).toHaveLength(1);
    await pool.query("update recommendation_regeneration_requests set lease_expires_at=now()-interval '1 second' where id=$1", [oldClaim!.requests[0]!.id]);
    const newClaim = await regeneration.claimNext("2026-07-14");
    expect(newClaim?.claimToken).not.toBe(oldClaim?.claimToken);
    await expect(service.publishGuarded(command({ userId, targetDate, generationBatchId: oldClaim!.generationBatchId }), {
      requestIds: oldClaim!.requests.map((request) => request.id), claimToken: oldClaim!.claimToken, generationBatchId: oldClaim!.generationBatchId,
    })).rejects.toThrow(/claim fenced/);
    expect(await service.findCurrent(userId, targetDate)).toBeNull();
    const record = await service.publishGuarded(command({ userId, targetDate, generationBatchId: newClaim!.generationBatchId }), {
      requestIds: newClaim!.requests.map((request) => request.id), claimToken: newClaim!.claimToken, generationBatchId: newClaim!.generationBatchId,
    });
    expect((await service.findCurrent(userId, targetDate))?.id).toBe(record.id);
    expect(await regeneration.finishClaim(newClaim!, [record.id])).toBe(true);
  });

  it("publishes today and tomorrow atomically with one batch and never exposes a mixed pair", async () => {
    const userId = await createUser();
    const oldBatch = randomUUID();
    await service.publishHomePair([command({ userId, targetDate: "2026-07-14", generationBatchId: oldBatch }), command({ userId, targetDate: "2026-07-15", generationBatchId: oldBatch })]);
    let reached!: () => void; let release!: () => void;
    const blocked = new Promise<void>((resolve) => { reached = resolve; }); const proceed = new Promise<void>((resolve) => { release = resolve; });
    const publishing = new RecommendationPersistenceService(pool, undefined, async (stage) => { if (stage === "beforeCommit") { reached(); await proceed; } });
    const nextBatch = randomUUID();
    const pending = publishing.publishHomePair([command({ userId, targetDate: "2026-07-14", generationBatchId: nextBatch }), command({ userId, targetDate: "2026-07-15", generationBatchId: nextBatch })]);
    await blocked;
    expect(new Set((await service.listCurrent(userId, ["2026-07-14", "2026-07-15"])).map((row) => row.generationBatchId))).toEqual(new Set([oldBatch]));
    release(); await pending;
    expect(new Set((await service.listCurrent(userId, ["2026-07-14", "2026-07-15"])).map((row) => row.generationBatchId))).toEqual(new Set([nextBatch]));
  });

  it("rolls back both home dates when pair activation fails", async () => {
    const userId = await createUser(); const oldBatch = randomUUID();
    await service.publishHomePair([command({ userId, targetDate: "2026-07-14", generationBatchId: oldBatch }), command({ userId, targetDate: "2026-07-15", generationBatchId: oldBatch })]);
    const failed = new RecommendationPersistenceService(pool, undefined, (stage) => { if (stage === "beforeCommit") throw new Error("pair-failed"); }); const nextBatch = randomUUID();
    await expect(failed.publishHomePair([command({ userId, targetDate: "2026-07-14", generationBatchId: nextBatch }), command({ userId, targetDate: "2026-07-15", generationBatchId: nextBatch })])).rejects.toThrow("pair-failed");
    expect(new Set((await service.listCurrent(userId, ["2026-07-14", "2026-07-15"])).map((row) => row.generationBatchId))).toEqual(new Set([oldBatch]));
  });
  it("publishes first revision, replaces sequentially, and preserves old revisions", async () => {
    const userId = await createUser();
    const first = await service.publish(command({ userId }));
    const second = await service.publish(command({ userId }));
    expect([first.revision, second.revision]).toEqual([1, 2]);
    expect((await service.findCurrent(userId, baseCommand.targetDate))?.id).toBe(second.id);
    const history = await rows(userId, baseCommand.targetDate);
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.is_current)).toEqual([false, true]);
    expect(history[0].superseded_at).not.toBeNull();
  });

  it("serializes different concurrent requests without duplicate revisions and leaves exactly one current", async () => {
    const userId = await createUser();
    const published = await Promise.all(Array.from({ length: 12 }, () => service.publish(command({ userId }))));
    expect(new Set(published.map((record) => record.revision)).size).toBe(12);
    expect((await rows(userId, baseCommand.targetDate)).filter((row) => row.is_current)).toHaveLength(1);
    expect(Math.max(...published.map((record) => record.revision))).toBe(12);
  }, 30_000);

  it("deduplicates concurrent same-request replay to one row and returns the same record", async () => {
    const userId = await createUser();
    const same = command({ userId });
    const published = await Promise.all(Array.from({ length: 12 }, () => service.publish(structuredClone(same))));
    expect(new Set(published.map((record) => record.id)).size).toBe(1);
    expect(await rows(userId, same.targetDate)).toHaveLength(1);
  }, 30_000);

  it("rejects same key with different content without changing the database", async () => {
    const userId = await createUser();
    const original = command({ userId });
    await service.publish(original);
    const conflicting = { ...structuredClone(original), algorithmVersion: "different-version" };
    await expect(service.publish(conflicting)).rejects.toBeInstanceOf(RecommendationGenerationConflictError);
    expect(await rows(userId, original.targetDate)).toHaveLength(1);
  });

  it("treats generationRequestId as user-wide server generation idempotency, not a date-scoped client key", async () => {
    const userId = await createUser();
    const original = command({ userId });
    await service.publish(original);
    const otherDate = command({ userId, targetDate: "2026-07-15", generationRequestId: original.generationRequestId });
    await expect(service.publish(otherDate)).rejects.toBeInstanceOf(RecommendationGenerationConflictError);
    expect(await rows(userId, "2026-07-15")).toHaveLength(0);
  });

  it("returns a superseded replay without reactivating it", async () => {
    const userId = await createUser();
    const oldCommand = command({ userId });
    const old = await service.publish(oldCommand);
    const current = await service.publish(command({ userId }));
    const replay = await service.publish(oldCommand);
    expect(replay.id).toBe(old.id);
    expect(replay.isCurrent).toBe(false);
    expect((await service.findCurrent(userId, oldCommand.targetDate))?.id).toBe(current.id);
  });

  it("keeps the old current visible to another connection until commit", async () => {
    const userId = await createUser();
    const old = await service.publish(command({ userId }));
    let reached!: () => void;
    let release!: () => void;
    const atCommit = new Promise<void>((resolve) => { reached = resolve; });
    const continueCommit = new Promise<void>((resolve) => { release = resolve; });
    const blocking = new RecommendationPersistenceService(pool, undefined, async (stage) => {
      if (stage === "beforeCommit") { reached(); await continueCommit; }
    });
    const publishing = blocking.publish(command({ userId }));
    await atCommit;
    expect((await service.findCurrent(userId, baseCommand.targetDate))?.id).toBe(old.id);
    release();
    const next = await publishing;
    expect((await service.findCurrent(userId, baseCommand.targetDate))?.id).toBe(next.id);
  });

  it.each(["afterInsert", "afterSupersede", "afterPromote", "beforeCommit"] as RecommendationPublishStage[])("rolls back %s fault and preserves old current", async (stage) => {
    const userId = await createUser();
    const old = await service.publish(command({ userId }));
    const failing = new RecommendationPersistenceService(pool, undefined, (currentStage) => {
      if (currentStage === stage) throw new Error(`injected-${stage}`);
    });
    await expect(failing.publish(command({ userId }))).rejects.toThrow(`injected-${stage}`);
    expect((await service.findCurrent(userId, baseCommand.targetDate))?.id).toBe(old.id);
    expect(await rows(userId, baseCommand.targetDate)).toHaveLength(1);
  });

  it("rolls back when the writer backend is terminated before commit", async () => {
    const userId = await createUser();
    const old = await service.publish(command({ userId }));
    let backendPid!: number;
    let reached!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    const killed = new Promise<void>((resolve) => { release = resolve; });
    const doomed = new RecommendationPersistenceService(pool, undefined, async (stage, context) => {
      if (stage !== "beforeCommit") return;
      context.client.on("error", () => { /* the backend termination is the assertion under test */ });
      backendPid = (await context.client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      reached();
      await killed;
    });
    const publishing = doomed.publish(command({ userId }));
    await ready;
    expect((await admin.query("select pg_terminate_backend($1) as terminated", [backendPid])).rows[0].terminated).toBe(true);
    release();
    await expect(publishing).rejects.toThrow();
    expect((await service.findCurrent(userId, baseCommand.targetDate))?.id).toBe(old.id);
    expect(await rows(userId, baseCommand.targetDate)).toHaveLength(1);
  });
});

describe("daily recommendation isolation, validation, constraints, and retention", () => {
  it("isolates users, dates, and timezones and revalidates JSONB on read", async () => {
    const firstUser = await createUser();
    const secondUser = await createUser();
    const first = await service.publish(command({ userId: firstUser, targetTimezone: "Asia/Shanghai" }));
    const tomorrow = await service.publish(command({ userId: firstUser, targetDate: "2026-07-15", targetTimezone: "Asia/Tokyo" }));
    const other = await service.publish(command({ userId: secondUser, targetTimezone: "Europe/London" }));
    expect((await service.listCurrent(firstUser)).map((record) => [record.id, record.targetDate, record.targetTimezone])).toEqual([[first.id, "2026-07-14", "Asia/Shanghai"], [tomorrow.id, "2026-07-15", "Asia/Tokyo"]]);
    expect((await service.listCurrent(secondUser)).map((record) => record.id)).toEqual([other.id]);
    expect((await service.findCurrent(firstUser, first.targetDate))?.payload).toEqual(first.payload);
  });

  it("rejects invalid JSON before write and leaves no row", async () => {
    const userId = await createUser();
    const invalid: any = command({ userId });
    invalid.payload.engineOutput.recommendations[0].pawScores = { free: 100 };
    await expect(service.publish(invalid)).rejects.toThrow();
    expect(await rows(userId, baseCommand.targetDate)).toHaveLength(0);
  });

  it("revalidates controlled JSONB after read and refuses corrupted rows", async () => {
    const userId = await createUser();
    const record = await service.publish(command({ userId }));
    await pool.query("update daily_recommendations set payload = $2::jsonb where id = $1", [record.id, JSON.stringify({ corrupted: true })]);
    await expect(service.findCurrent(userId, record.targetDate)).rejects.toThrow();
  });

  it("enforces revision, partial-current, expiry, and cascade constraints", async () => {
    const userId = await createUser();
    const record = await service.publish(command({ userId }));
    const duplicateSql = `insert into daily_recommendations select gen_random_uuid(), user_id, target_date, target_timezone, revision, generation_batch_id, gen_random_uuid(), payload_fingerprint, readiness, generation_mode, false, now(), payload, algorithm_version, rule_version, paw_program_versions, generated_at, expires_at, now(), now() from daily_recommendations where id = $1`;
    await expect(pool.query(duplicateSql, [record.id])).rejects.toMatchObject({ code: "23505" });
    const currentSql = `insert into daily_recommendations select gen_random_uuid(), user_id, target_date, target_timezone, revision + 100, generation_batch_id, gen_random_uuid(), payload_fingerprint, readiness, generation_mode, true, null, payload, algorithm_version, rule_version, paw_program_versions, generated_at, expires_at, now(), now() from daily_recommendations where id = $1`;
    await expect(pool.query(currentSql, [record.id])).rejects.toMatchObject({ code: "23505" });
    const expirySql = `insert into daily_recommendations select gen_random_uuid(), user_id, target_date + 1, target_timezone, 1, generation_batch_id, gen_random_uuid(), payload_fingerprint, readiness, generation_mode, false, now(), payload, algorithm_version, rule_version, paw_program_versions, generated_at, generated_at, now(), now() from daily_recommendations where id = $1`;
    await expect(pool.query(expirySql, [record.id])).rejects.toMatchObject({ code: "23514" });
    const revisionSql = `insert into daily_recommendations select gen_random_uuid(), user_id, target_date + 2, target_timezone, -1, generation_batch_id, gen_random_uuid(), payload_fingerprint, readiness, generation_mode, false, now(), payload, algorithm_version, rule_version, paw_program_versions, generated_at, expires_at, now(), now() from daily_recommendations where id = $1`;
    await expect(pool.query(revisionSql, [record.id])).rejects.toMatchObject({ code: "23514" });
    await pool.query("delete from users where id = $1", [userId]);
    expect((await pool.query("select count(*)::int as count from daily_recommendations where user_id = $1", [userId])).rows[0].count).toBe(0);
  });

  it("cleans expired non-current rows without deleting current", async () => {
    const userId = await createUser();
    const old = await service.publish(command({ userId, expiresAt: "2026-07-20T00:00:00.000Z" }));
    const current = await service.publish(command({ userId, expiresAt: "2026-07-20T00:00:00.000Z" }));
    expect(await service.cleanupExpiredNonCurrent("2026-07-21T00:00:00.000Z")).toBeGreaterThanOrEqual(1);
    expect((await pool.query("select count(*)::int as count from daily_recommendations where id = $1", [old.id])).rows[0].count).toBe(0);
    expect((await service.findCurrent(userId, baseCommand.targetDate))?.id).toBe(current.id);
  });
});

describe("recommendation worker real PostgreSQL end to end", () => {
  it("allows only one global worker lock", async () => {
    const firstRepo = new RecommendationJobRepository(pool); const secondRepo = new RecommendationJobRepository(pool);
    const first = await firstRepo.tryAcquireGlobalLock(); expect(first).not.toBeNull();
    expect(await secondRepo.tryAcquireGlobalLock()).toBeNull();
    await firstRepo.releaseGlobalLock(first!);
    const after = await secondRepo.tryAcquireGlobalLock(); expect(after).not.toBeNull(); await secondRepo.releaseGlobalLock(after!);
  });

  it("uses Asia/Shanghai for ordinary worker business dates regardless of profile timezone", async () => {
    const userId = await createUser();
    await pool.query("insert into profiles (user_id, origin_device_id, payload) values ($1, 'test', $2::jsonb)", [userId, JSON.stringify({ timezone: "America/Los_Angeles" })]);
    const tasks = (await new RecommendationWorker(pool).selectTasks(new Date("2026-07-14T18:00:00.000Z"))).filter((task) => task.userId === userId);
    expect(tasks.filter((task) => task.homePair).map((task) => task.targetDate)).toEqual(["2026-07-15", "2026-07-16"]);
    expect(new Set(tasks.map((task) => task.asOfDate))).toEqual(new Set(["2026-07-15"]));
    expect(new Set(tasks.map((task) => task.timezone))).toEqual(new Set(["Asia/Shanghai"]));
    expect((await new RecommendationReadService(pool).read(userId, "2026-08-20", "2026-08-20")).timezone).toBe("Asia/Shanghai");
  });

  it("adapts representative workspace data, skips protected dates, and prewarms only today and tomorrow", async () => {
    await pool.query("update users set disabled_at=now() where disabled_at is null");
    const userId = await createUser();
    await pool.query("insert into profiles (user_id, origin_device_id, payload) values ($1, 'test', $2::jsonb)", [userId, JSON.stringify({ profileType: "preferences", timezone: "Asia/Shanghai", workdayScene: "commute", restDayScene: "casual", thermalBias: "normal" })]);
    const garments = [
      ["tops", "shirt", "白", "commute", 4, 2], ["tops", "t_shirt", "黑", "casual", 2, 1], ["pants", "suit_pants", "黑", "commute", 4, 2], ["pants", "casual_pants", "蓝", "casual", 2, 2], ["shoes", "loafers", "黑", "commute", 4, 2], ["shoes", "sneakers", "白", "casual", 2, 1],
    ];
    const ids: string[] = [];
    for (const [category, subcategory, color, style, formality, warmth] of garments) { const id = randomUUID(); ids.push(id); await pool.query("insert into garments (id, user_id, origin_device_id, payload) values ($1, $2, 'test', $3::jsonb)", [id, userId, JSON.stringify({ name: `${category}-${subcategory}`, status: "active", category, subcategory, colors: { mode: "single", primary: color }, seasons: ["all"], styles: [style], formality, warmth, temperatureMinC: 5, temperatureMaxC: 35, imageUrl: "authorized-test-asset" })]); }
    const excludedIds = [randomUUID(), randomUUID(), randomUUID()];
    await pool.query("insert into garments (id, user_id, origin_device_id, payload) values ($1, $4, 'test', $5::jsonb), ($2, $4, 'test', $6::jsonb), ($3, $4, 'test', $7::jsonb)", [excludedIds[0], excludedIds[1], excludedIds[2], userId, JSON.stringify({ name: "归档测试衣物", status: "archived", category: "tops", colors: { mode: "single", primary: "黑" }, seasons: ["all"], formality: 2, warmth: 2, imageUrl: "authorized-test-asset" }), JSON.stringify({ name: "缺主图测试衣物", status: "active", category: "tops", colors: { mode: "single", primary: "黑" }, seasons: ["all"], formality: 2, warmth: 2 }), JSON.stringify({ name: "缺字段测试衣物", status: "active", category: "tops", colors: { mode: "single", primary: "未标注" }, seasons: [], imageUrl: "authorized-test-asset", needsReview: true })]);
    const outfitId = randomUUID(); await pool.query("insert into outfits (id, user_id, origin_device_id, payload) values ($1, $2, 'test', $3::jsonb)", [outfitId, userId, JSON.stringify({ name: "代表性通勤套装" })]);
    for (const [index, garmentId] of [ids[0], ids[2], ids[4]].entries()) await pool.query("insert into outfit_items (user_id, outfit_id, garment_id, origin_device_id, sort_order) values ($1, $2, $3, 'test', $4)", [userId, outfitId, garmentId, index]);
    await pool.query("insert into wear_events (user_id, outfit_id, worn_at, origin_device_id, payload) values ($1, $2, '2026-07-01T08:00:00Z', 'test', $3::jsonb)", [userId, outfitId, JSON.stringify({ sceneType: "commute", sentiment: "positive" })]);
    await pool.query("insert into trip_plans (user_id, start_date, end_date, origin_device_id, payload) values ($1, '2026-08-01', '2026-08-02', 'test', $2::jsonb)", [userId, JSON.stringify({ title: "测试出差", destination: "测试城市", activities: ["business meeting"] })]);
    await pool.query("insert into outfit_plans (user_id, plan_date, origin_device_id, payload) values ($1, '2026-07-16', 'test', $2::jsonb), ($1, '2026-07-17', 'test', $3::jsonb)", [userId, JSON.stringify({ status: "planned", isPrimary: true }), JSON.stringify({ status: "worn", isPrimaryActual: true })]);
    const invalidLegacyUser = await createUser();
    await pool.query("insert into garments (user_id, origin_device_id, payload) values ($1, 'test', $2::jsonb)", [invalidLegacyUser, JSON.stringify({ status: "active", category: "tops", colors: ["legacy-unknown-color"], seasons: ["all"], styles: ["legacy-unknown-style"], formality: 2, warmth: 2, imageUrl: "authorized-test-asset" })]);
    const result = await new RecommendationWorker(pool).runOnce("2026-07-13T19:30:00.000Z");
    expect(result.acquired).toBe(true); expect(result.job?.status).toBe("completed"); expect(result.job!.failedCount).toBe(0); expect(result.peakQueueSize).toBeLessThanOrEqual(64);
    const current = await pool.query<{ target_date: string; generation_batch_id: string }>("select target_date::text, generation_batch_id::text from daily_recommendations where user_id = $1 and is_current order by target_date", [userId]);
    expect(current.rows.map((row) => row.target_date)).toEqual(["2026-07-14", "2026-07-15"]);
    expect(current.rows.map((row) => row.target_date)).not.toContain("2026-07-16"); expect(current.rows.map((row) => row.target_date)).not.toContain("2026-07-17");
    expect(current.rows[0]!.generation_batch_id).toBe(current.rows[1]!.generation_batch_id);
    const todayPayload = (await pool.query<{ payload: { engineOutput: { readiness: { status: string }; exclusions: Array<{ garmentId: string; codes: string[] }> } } }>("select payload from daily_recommendations where user_id = $1 and target_date = '2026-07-14' and is_current", [userId])).rows[0]!.payload;
    expect(todayPayload.engineOutput.readiness.status).toBe("ready");
    expect(Object.fromEntries(todayPayload.engineOutput.exclusions.map((entry) => [entry.garmentId, entry.codes]))).toMatchObject({ [excludedIds[0]!]: ["unavailable_status"], [excludedIds[1]!]: ["missing_primary_image"], [excludedIds[2]!]: ["missing_required_field"] });
    expect(result.job?.errorCodeCounts).not.toHaveProperty("freeStack");
  }, 30_000);
});
