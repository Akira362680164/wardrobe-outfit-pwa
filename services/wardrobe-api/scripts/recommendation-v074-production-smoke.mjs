import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { RecommendationAcceptService } from "../dist/recommendations/accept-service.js";
import { RecommendationGenerationCoordinator } from "../dist/recommendations/coordinator.js";
import { RecommendationGenerationServiceV3 } from "../dist/recommendations/generation-service-v3.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const userId = randomUUID();
const deviceId = "controlled-v074-smoke";
const today = shanghaiDate(new Date());
const tomorrow = addDays(today, 1);
let exitCode = 0;

try {
  await pool.query("insert into users(id) values($1)", [userId]);
  await pool.query("insert into profiles(user_id,origin_device_id,payload) values($1,$2,$3::jsonb)", [
    userId,
    deviceId,
    JSON.stringify({ timezone: "Asia/Shanghai", workdayScene: "commute", restDayScene: "casual", thermalBias: "normal" }),
  ]);

  const garments = [
    ["tops", "shirt", "白", "commute", 4, 1], ["tops", "t_shirt", "黑", "casual", 2, 1],
    ["pants", "suit_pants", "黑", "commute", 4, 1], ["pants", "casual_pants", "蓝", "casual", 2, 1],
    ["shoes", "loafers", "黑", "commute", 4, 1], ["shoes", "sneakers", "白", "casual", 2, 1],
    ["hats", "cap", "蓝", "casual", 2, 1], ["bags", "tote", "黑", "commute", 3, 1],
  ];
  for (const [index, garment] of garments.entries()) {
    const [category, subcategory, color, style, formality, warmth] = garment;
    const garmentId = randomUUID();
    const assetId = randomUUID();
    await pool.query("insert into garments(id,user_id,origin_device_id,payload) values($1,$2,$3,$4::jsonb)", [
      garmentId, userId, deviceId,
      JSON.stringify({ name: `controlled-garment-${index + 1}`, legacyItemId: index + 1, status: "active", category, subcategory, colors: [color], seasons: ["all"], styles: [style], formality, warmth, temperatureMinC: -10, temperatureMaxC: 45 }),
    ]);
    await pool.query("insert into assets(id,owner_entity_type,owner_entity_id,user_id,origin_device_id,payload) values($1,'garment',$2,$3,$4,'{}'::jsonb)", [assetId, garmentId, userId, deviceId]);
    await pool.query("insert into asset_bindings(user_id,asset_id,owner_entity_type,owner_entity_id,field_name) values($1,$2,'garment',$3,'primaryImage')", [userId, assetId, garmentId]);
  }

  const generation = new RecommendationGenerationServiceV3(pool);
  const coordinator = new RecommendationGenerationCoordinator({
    prepare: (...args) => generation.prepare(...args),
    findCurrent: (...args) => generation.persistence.findCurrent(...args),
    publish: (...args) => generation.persistence.publish(...args),
    publishHomePair: (...args) => generation.persistence.publishHomePair(...args),
  });
  const started = performance.now();
  const first = await coordinator.resolve(userId, { dates: [today, tomorrow] }, "foreground");
  const generatedMs = performance.now() - started;
  const reuseStarted = performance.now();
  const second = await coordinator.resolve(userId, { dates: [today, tomorrow] }, "foreground");
  const reuseMs = performance.now() - reuseStarted;
  const recommendation = first.results[0]?.recommendation;
  const candidate = recommendation?.recommendations[0];
  if (!recommendation || !candidate) throw controlled("recommendation_not_ready");

  const mutationId = randomUUID();
  const command = {
    clientMutationId: mutationId,
    recommendationId: recommendation.recommendationId,
    expectedRecommendationRevision: recommendation.recommendationRevision,
    candidateId: candidate.candidateId,
    selectedGarmentIds: candidate.garmentIds,
  };
  const accept = new RecommendationAcceptService(pool);
  const accepted = await accept.accept(userId, deviceId, today, command);
  const replay = await accept.accept(userId, deviceId, today, command);
  const counts = (await pool.query(`
    select
      (select count(*)::int from outfit_plans where user_id=$1) plans,
      (select count(*)::int from recommendation_actions where user_id=$1) actions,
      (select count(*)::int from sync_mutations where user_id=$1 and mutation_id=$2) mutations,
      (select count(*)::int from asset_bindings where user_id=$1 and owner_entity_type='outfitPlan' and owner_entity_id=$3) plan_bindings
  `, [userId, mutationId, accepted.plan.id])).rows[0];
  const passed = first.results.every((item) => item.status === "generated")
    && second.results.every((item) => item.status === "reused")
    && accepted.status === "committed" && accepted.idempotentReplay === false
    && replay.idempotentReplay === true && replay.plan.id === accepted.plan.id
    && !("outfitId" in accepted.plan.payload)
    && accepted.plan.payload.garmentIds.length === accepted.plan.payload.garmentSnapshots.length
    && Number(counts.plans) === 1 && Number(counts.actions) === 1 && Number(counts.mutations) === 1
    && Number(counts.plan_bindings) === accepted.plan.payload.garmentIds.length;
  process.stdout.write(`${JSON.stringify({
    passed,
    firstStatuses: first.results.map((item) => item.status),
    secondStatuses: second.results.map((item) => item.status),
    pairConsistent: first.results[0]?.recommendation?.generationBatchId === first.results[1]?.recommendation?.generationBatchId,
    generatedMs: Number(generatedMs.toFixed(2)), reuseMs: Number(reuseMs.toFixed(2)),
    acceptCommitted: accepted.status === "committed", idempotentReplay: replay.idempotentReplay,
    planHasOutfitId: "outfitId" in accepted.plan.payload,
    garmentCount: accepted.plan.payload.garmentIds.length,
    snapshotCount: accepted.plan.payload.garmentSnapshots.length,
    assetBindingCount: Number(counts.plan_bindings), actionCount: Number(counts.actions), mutationCount: Number(counts.mutations),
  })}\n`);
  if (!passed) exitCode = 2;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ passed: false, errorCode: controlledCode(error), errorStage: safeError(error) })}\n`);
  exitCode = 1;
} finally {
  let cleanupError;
  await pool.query("delete from users where id=$1", [userId]).catch((error) => { cleanupError = safeError(error); });
  const residual = (await pool.query("select count(*)::int count from users where id=$1", [userId]).catch(() => ({ rows: [{ count: -1 }] }))).rows[0].count;
  process.stdout.write(`${JSON.stringify({ cleanupPassed: Number(residual) === 0, ...(cleanupError ? { cleanupError } : {}) })}\n`);
  await pool.end();
}

process.exitCode = exitCode;

function controlled(code) { const error = new Error(code); error.code = code; return error; }
function controlledCode(error) { return error && typeof error === "object" && typeof error.code === "string" ? error.code : "controlled_smoke_failed"; }
function safeError(error) { return String(error instanceof Error ? error.message : "controlled_smoke_failed").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<synthetic-id>").slice(0, 240); }
function shanghaiDate(value) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function addDays(date, count) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }
