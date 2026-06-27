import { and, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "../db/client.js";
import { assets } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { createStorageProviderFromEnv } from "../storage/factory.js";
import type { StorageProvider } from "../storage/provider.js";

export async function validateStoredAssets(
  db?: NodePgDatabase<typeof schema>,
  injectedStorage?: StorageProvider | null,
): Promise<number> {
  const database = db ?? getDb();
  const storage = injectedStorage === undefined ? createStorageProviderFromEnv() : injectedStorage;
  if (!storage) return 0;
  const rows = await database.select().from(assets).where(and(sql`${assets.deletedAt} IS NULL`, eq(assets.uploadStatus, "uploaded")));
  let failed = 0;
  for (const row of rows) {
    const variants = [
      ["original", row.originalStorageKey],
      ["thumbnail", row.thumbnailStorageKey],
    ] as const;
    let payload = asRecord(row.payload);
    let missing = false;
    for (const [variant, key] of variants) {
      if (!key || !(await storage.stat(key).catch(() => ({ exists: false }))).exists) {
        const uploads = asRecord(payload.uploads);
        const metadata = asRecord(uploads[variant]);
        if (metadata.status === "uploaded" || key) {
          payload = { ...payload, uploads: { ...uploads, [variant]: { ...metadata, status: "failed", errorCode: "LOCAL_FILE_MISSING_REUPLOAD_REQUIRED" } } };
          missing = true;
        }
      }
    }
    if (missing) {
      await database.update(assets).set({ uploadStatus: "failed", payload, updatedAt: new Date() }).where(eq(assets.id, row.id));
      failed += 1;
    }
  }
  return failed;
}

export async function cleanupAssetStorage(
  db?: NodePgDatabase<typeof schema>,
  injectedStorage?: StorageProvider | null,
): Promise<void> {
  const database = db ?? getDb();
  const storage = injectedStorage === undefined ? createStorageProviderFromEnv() : injectedStorage;
  if (!storage) return;
  await storage.cleanupTemporaryFiles(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deletedRows = await database.select().from(assets).where(and(
    sql`${assets.deletedAt} IS NOT NULL`,
    lte(assets.deletedAt, retentionCutoff),
  ));
  for (const row of deletedRows) {
    const stillDeleted = await database.select({ id: assets.id }).from(assets)
      .where(and(eq(assets.id, row.id), sql`${assets.deletedAt} IS NOT NULL`)).limit(1);
    if (!stillDeleted[0]) continue;
    for (const key of [row.originalStorageKey, row.thumbnailStorageKey]) {
      if (key) await storage.delete(key).catch(() => {});
    }
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
