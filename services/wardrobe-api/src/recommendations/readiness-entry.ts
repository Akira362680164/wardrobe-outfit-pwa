import { randomUUID } from "node:crypto";
import { RecommendationPayloadV2Schema } from "@wardrobe/cloud-contracts";
import { closeDatabase, getPostgresPool } from "../db/client.js";
import { RecommendationContextResolver } from "./context-resolver.js";
import { RecommendationGenerationServiceV2 } from "./generation-service-v2.js";
import { RecommendationWorker } from "./worker.js";

const pool = getPostgresPool();
const worker = new RecommendationWorker(pool);
const resolver = new RecommendationContextResolver(pool);
const generation = new RecommendationGenerationServiceV2(pool);
const maxUpstreamRequests = positiveInteger(process.env.RECOMMENDATION_SHADOW_MAX_UPSTREAM_REQUESTS, 300);

try {
  const tasks = await worker.selectTasks(new Date());
  const contexts = await Promise.all(tasks.map(async (task) => ({ task, context: await resolver.resolve(task.userId, task.targetDate) })));
  const upstreamKeys = new Set<string>();
  const locations = new Set<string>();
  for (const { task, context } of contexts) {
    if (!context.resolvedLocation) continue;
    locations.add(context.resolvedLocation.locationId);
    const offset = daysBetween(task.asOfDate, task.targetDate);
    const endpoints = offset === 0 ? ["now", "hourly", "daily"] : offset === 1 ? ["hourly", "daily"] : offset >= 2 && offset <= 6 ? ["daily"] : [];
    for (const endpoint of endpoints) upstreamKeys.add(`${context.resolvedLocation.locationId}:${endpoint}:zh:m`);
  }
  if (upstreamKeys.size > maxUpstreamRequests) throw new Error(`shadow_upstream_budget_exceeded:${upstreamKeys.size}:${maxUpstreamRequests}`);

  const dateModes = { forecast: 0, locationless: 0, weather_fallback: 0 };
  const readiness = { ready: 0, limited: 0, not_ready: 0 };
  const perUser = new Map<string, Set<keyof typeof readiness>>();
  let failedDateCount = 0;
  for (const { task } of contexts) {
    try {
      const prepared = await generation.prepare(task.userId, task.targetDate, task.asOfDate, task.timezone, randomUUID());
      if (!prepared.command) continue;
      const payload = RecommendationPayloadV2Schema.parse(prepared.command.payload);
      dateModes[payload.resolvedContext.contextMode]++;
      readiness[prepared.command.readiness]++;
      (perUser.get(task.userId) ?? perUser.set(task.userId, new Set()).get(task.userId)!).add(prepared.command.readiness);
    } catch {
      failedDateCount++;
      (perUser.get(task.userId) ?? perUser.set(task.userId, new Set()).get(task.userId)!).add("not_ready");
    }
  }
  const userReadiness = { ready: 0, limited: 0, not_ready: 0 };
  for (const statuses of perUser.values()) {
    const status = statuses.has("not_ready") ? "not_ready" : statuses.has("limited") ? "limited" : "ready";
    userReadiness[status]++;
  }
  process.stdout.write(`${JSON.stringify({
    report: "recommendation_1d_c_readiness",
    generatedAt: new Date().toISOString(),
    userCount: perUser.size,
    targetDateCount: tasks.length,
    userReadiness,
    dateReadiness: readiness,
    contextMode: dateModes,
    failedDateCount,
    uniqueLocationCount: locations.size,
    uniqueLocationEndpointCacheKeyCount: upstreamKeys.size,
    estimatedUpstreamRequestUpperBound: upstreamKeys.size,
    configuredUpstreamRequestHardLimit: maxUpstreamRequests,
  })}\n`);
  process.exitCode = failedDateCount === 0 ? 0 : 1;
} finally {
  await closeDatabase();
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
