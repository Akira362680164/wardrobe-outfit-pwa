import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { DailyRecommendationRecordSchema, PublishDailyRecommendationCommandSchema } from "@wardrobe/cloud-contracts";
import { generateRecommendationsV3 } from "../src/recommendations/engine.js";
import { RecommendationGenerationCoordinator } from "../src/recommendations/coordinator.js";
import { buildFixtureGarment } from "../tests/fixtures/recommendations/scenarios.js";
import { buildFallbackInput, buildForecastInput } from "../tests/fixtures/recommendations/v2-scenarios.js";

const lane = process.argv.find((value) => value.startsWith("--lane="))?.split("=")[1] ?? "1";
const categories = ["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "accessories"] as const;
const base = buildForecastInput();
const garments = Array.from({ length: 500 }, (_, index) => buildFixtureGarment(
  `8${lane.padStart(1, "0")}000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  categories[index % categories.length]!,
  { userId: base.userId, formality: 2 + (index % 2), colors: index % 3 === 0 ? ["黑"] : ["白"] },
));
const forecastInput = { ...base, requestId: randomUUID(), garments };
const fallbackBase = buildFallbackInput();
const fallbackInput = { ...fallbackBase, requestId: randomUUID(), garments: garments.map((garment) => ({ ...garment, userId: fallbackBase.userId })) };

async function samples(count: number, operation: () => Promise<unknown>): Promise<number[]> {
  for (let index = 0; index < 5; index++) await operation();
  const values: number[] = [];
  for (let index = 0; index < count; index++) { const started = performance.now(); await operation(); values.push(performance.now() - started); }
  return values;
}
function p95(values: number[]) { return Number([...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!.toFixed(2)); }

const cachedRule = await samples(60, () => generateRecommendationsV3({ ...forecastInput, requestId: randomUUID() }));
const fallbackRule = await samples(60, () => generateRecommendationsV3({ ...fallbackInput, requestId: randomUUID() }));
const output = await generateRecommendationsV3(forecastInput);
const now = "2026-07-15T00:00:00.000Z";
const command = PublishDailyRecommendationCommandSchema.parse({
  userId: forecastInput.userId, targetDate: forecastInput.dateContextInput.date, targetTimezone: forecastInput.dateContextInput.timezone,
  generationBatchId: randomUUID(), generationRequestId: randomUUID(), inputFingerprint: "a".repeat(64), generationSource: "foreground",
  readiness: output.readiness.status, generationMode: "rule_only", payload: { schemaVersion: 3, resolvedContext: forecastInput.resolvedContext, dateContextInput: forecastInput.dateContextInput, engineOutput: output },
  algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1", pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" }, generatedAt: now, expiresAt: "2026-08-15T00:00:00.000Z",
});
const record = DailyRecommendationRecordSchema.parse({ id: randomUUID(), ...command, revision: 1, payloadFingerprint: "b".repeat(64), isCurrent: true, lifecycle: "current", supersededAt: null, createdAt: now, updatedAt: now });
let reuseEngineCalls = 0;
const coordinator = new RecommendationGenerationCoordinator({ prepare: async () => ({ command, skipReason: null, materialize: async () => { reuseEngineCalls += 1; return command; } }), findCurrent: async () => record, publish: async () => { throw new Error("unexpected publish"); }, publishHomePair: async () => { throw new Error("unexpected publish"); } }, () => new Date("2026-07-15T01:00:00.000Z"));
const reuse = await samples(100, () => coordinator.resolve(forecastInput.userId, { dates: [forecastInput.dateContextInput.date] }));

const result = { lane, loadModel: "two simultaneous Node processes", samples: { reuse: reuse.length, cachedRule: cachedRule.length, fallbackRule: fallbackRule.length }, reuseEngineCalls, p95Ms: { reuse: p95(reuse), cachedRule: p95(cachedRule), weatherFallback: p95(fallbackRule), kernel500: p95(cachedRule) }, thresholdsMs: { reuse: 300, cachedRule: 800, weatherFallback: 2000, kernel500: 300 } };
const failed = reuseEngineCalls !== 0 || result.p95Ms.reuse > 300 || result.p95Ms.cachedRule > 800 || result.p95Ms.weatherFallback > 2000 || result.p95Ms.kernel500 > 300;
console.log(JSON.stringify({ ...result, passed: !failed }));
if (failed) process.exitCode = 1;
