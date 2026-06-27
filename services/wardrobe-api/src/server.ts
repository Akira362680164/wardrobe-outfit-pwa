import { buildApp } from "./app.js";
import { closeDatabase } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { cleanupExpiredRefreshIdempotencyPayloads } from "./security/refresh-idempotency-cleanup.js";
import { cleanupExpiredDiagnosticCases } from "./diagnostics/cleanup.js";
import { cleanupAssetStorage, validateStoredAssets } from "./assets/cleanup.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const app = buildApp();

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function shutdown() {
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
  await app.close();
  await closeDatabase();
}

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

await runMigrations();
await app.listen({ host, port });

// periodic cleanup and local-storage consistency checks
void cleanupExpiredRefreshIdempotencyPayloads().catch(() => {});
void cleanupExpiredDiagnosticCases().catch(() => {});
void validateStoredAssets().catch(() => {});
void cleanupAssetStorage().catch(() => {});
cleanupTimer = setInterval(() => {
  cleanupExpiredRefreshIdempotencyPayloads().catch(() => {});
  cleanupExpiredDiagnosticCases().catch(() => {});
  validateStoredAssets().catch(() => {});
  cleanupAssetStorage().catch(() => {});
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
