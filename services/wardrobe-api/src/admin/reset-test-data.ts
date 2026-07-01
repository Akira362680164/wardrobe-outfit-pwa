import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import type { StorageProvider } from "../storage/provider.js";

export const RESET_CONFIRMATION = "RESET_WARDROBE_TEST_DATA";

export const USER_DATA_TABLES = [
  "diagnostic_case_request_traces", "diagnostic_access_audits", "api_request_traces", "diagnostic_cases",
  "asset_bindings", "sync_mutations", "sync_changes", "assets", "outfit_items", "wear_events",
  "outfit_plans", "trip_plans", "profiles", "wishlist_items", "outfits", "garments", "locations",
  "wardrobes", "refresh_tokens", "device_sessions", "password_credentials", "phone_identities",
  "pending_registrations", "account_security_events", "users",
] as const;

export interface ResetTestDataEnvironment {
  WARDROBE_ENV?: string;
  ALLOW_TEST_DATA_RESET?: string;
  RESET_CONFIRMATION?: string;
}

export interface ResetTestDataReport {
  environment: "test";
  mode: "dry-run" | "execute";
  databaseCleared: boolean;
  storageCleared: boolean;
  tableCountsBefore: Record<string, number>;
  tableCountsAfter: Record<string, number>;
  storageKeyCount: number;
  deletedStorageKeyCount: number;
  failedStorageKeyHashes: string[];
}

export function assertResetTestDataAllowed(env: ResetTestDataEnvironment): void {
  if (env.WARDROBE_ENV !== "test") throw new Error("WARDROBE_ENV must equal test");
  if (env.ALLOW_TEST_DATA_RESET !== "true") throw new Error("ALLOW_TEST_DATA_RESET must equal true");
  if (env.RESET_CONFIRMATION !== RESET_CONFIRMATION) throw new Error("RESET_CONFIRMATION is invalid");
}

export async function resetTestData(input: {
  pool: Pool;
  storage: StorageProvider | null;
  env: ResetTestDataEnvironment;
  execute: boolean;
  retryCount?: number;
}): Promise<ResetTestDataReport> {
  assertResetTestDataAllowed(input.env);
  const client = await input.pool.connect();
  try {
    const tableCountsBefore = await readTableCounts(client);
    const storageKeys = await readStorageKeys(client);
    if (!input.execute) return report("dry-run", false, storageKeys.length === 0, tableCountsBefore, tableCountsBefore, storageKeys, [], []);

    await client.query("begin");
    try {
      await client.query(`truncate table ${USER_DATA_TABLES.map(quoteIdentifier).join(", ")} restart identity cascade`);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const tableCountsAfter = await readTableCounts(client);
    const failed: string[] = [];
    const deleted: string[] = [];
    if (storageKeys.length > 0 && !input.storage) failed.push(...storageKeys);
    else if (input.storage) {
      for (const key of storageKeys) {
        let cleared = false;
        for (let attempt = 0; attempt <= (input.retryCount ?? 2); attempt += 1) {
          try {
            await input.storage.delete(key);
            cleared = !(await input.storage.stat(key)).exists;
            if (cleared) break;
          } catch { /* retry this key */ }
        }
        (cleared ? deleted : failed).push(key);
      }
    }
    const databaseCleared = Object.values(tableCountsAfter).every((count) => count === 0);
    return report("execute", databaseCleared, failed.length === 0, tableCountsBefore, tableCountsAfter, storageKeys, deleted, failed);
  } finally {
    client.release();
  }
}

async function readTableCounts(client: PoolClient): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of USER_DATA_TABLES) {
    const result = await client.query<{ count: string }>(`select count(*)::text as count from ${quoteIdentifier(table)}`);
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  return counts;
}

async function readStorageKeys(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ storage_key: string }>(`
    select original_storage_key as storage_key from assets where original_storage_key is not null
    union select thumbnail_storage_key from assets where thumbnail_storage_key is not null
    union select storage_key from diagnostic_cases where storage_key is not null
  `);
  return [...new Set(result.rows.map((row) => row.storage_key).filter(Boolean))];
}

function report(mode: "dry-run" | "execute", databaseCleared: boolean, storageCleared: boolean,
  before: Record<string, number>, after: Record<string, number>, keys: string[], deleted: string[], failed: string[]): ResetTestDataReport {
  return {
    environment: "test", mode, databaseCleared, storageCleared,
    tableCountsBefore: before, tableCountsAfter: after,
    storageKeyCount: keys.length, deletedStorageKeyCount: deleted.length,
    failedStorageKeyHashes: failed.map(hashStorageKey),
  };
}

function hashStorageKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_]+$/.test(value)) throw new Error("Unsafe SQL identifier");
  return `"${value}"`;
}
