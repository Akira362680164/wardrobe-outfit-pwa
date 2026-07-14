import { closeDatabase, getPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { readRecommendationFeatureFlags } from "./feature-flags.js";
import { nextShanghaiSchedule, RecommendationWorker } from "./worker.js";

await runMigrations();
const worker = new RecommendationWorker(getPostgresPool());
if (process.argv.includes("--run-once")) {
  const result = await worker.runOnce();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  await closeDatabase();
  process.exit(result.acquired && result.job?.status !== "failed" ? 0 : 1);
}
const flags = readRecommendationFeatureFlags(process.env);
if (!flags.DAILY_RECOMMENDATIONS_ENABLED && !flags.RECOMMENDATION_V2_SHADOW_ENABLED && !flags.RECOMMENDATION_V2_WORKER_ENABLED) throw new Error("a recommendation worker flag must be true for daemon mode");
let stopping = false;
const stop = () => { stopping = true; };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
while (!stopping) {
  const next = nextShanghaiSchedule();
  process.stdout.write(`${JSON.stringify({ event: "recommendation_worker_waiting", nextScheduledFor: next.toISOString(), timezone: "Asia/Shanghai" })}\n`);
  while (!stopping && Date.now() < next.getTime()) await new Promise<void>((resolve) => setTimeout(resolve, Math.min(next.getTime() - Date.now(), 60_000)));
  if (!stopping && Date.now() >= next.getTime()) process.stdout.write(`${JSON.stringify(await worker.runOnce(next.toISOString()))}\n`);
}
await closeDatabase();
