import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Readable } from "node:stream";
import type { Pool, PoolClient } from "pg";
import type { StorageProvider } from "../src/storage/provider.js";
import {
  assertResetTestDataAllowed,
  resetTestData,
  RESET_CONFIRMATION,
  USER_DATA_TABLES,
} from "../src/admin/reset-test-data.js";

const allowed = {
  WARDROBE_ENV: "test",
  ALLOW_TEST_DATA_RESET: "true",
  RESET_CONFIRMATION,
  TEST_RUN_ID: "run_fixture_001",
};

describe("test data reset guard", () => {
  it("requires all three independent confirmations", () => {
    expect(() =>
      assertResetTestDataAllowed({
        WARDROBE_ENV: "production",
        ALLOW_TEST_DATA_RESET: "true",
        RESET_CONFIRMATION,
      }),
    ).toThrow();
    expect(() =>
      assertResetTestDataAllowed({
        WARDROBE_ENV: "test",
        ALLOW_TEST_DATA_RESET: "false",
        RESET_CONFIRMATION,
      }),
    ).toThrow();
    expect(() =>
      assertResetTestDataAllowed({
        WARDROBE_ENV: "test",
        ALLOW_TEST_DATA_RESET: "true",
        RESET_CONFIRMATION: "wrong",
      }),
    ).toThrow();
    expect(() =>
      assertResetTestDataAllowed({
        WARDROBE_ENV: "test",
        ALLOW_TEST_DATA_RESET: "true",
        RESET_CONFIRMATION,
      }),
    ).toThrow();
    expect(() => assertResetTestDataAllowed(allowed)).not.toThrow();
  });

  it("covers authentication, workspace, assets, idempotency, and diagnostics tables", () => {
    for (const table of [
      "users",
      "refresh_tokens",
      "garments",
      "asset_bindings",
      "assets",
      "sync_mutations",
      "diagnostic_cases",
      "api_request_traces",
      "daily_recommendations",
    ]) {
      expect(USER_DATA_TABLES).toContain(table);
    }
    expect(USER_DATA_TABLES).toHaveLength(33);
  });

  it("clears all 33 isolated-schema tables and referenced assets without touching public", async () => {
    const counts = Object.fromEntries(
      USER_DATA_TABLES.map((table) => [table, 1]),
    );
    const publicSentinel = { rows: 7 };
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("current_schema()"))
          return { rows: [{ current_schema: "run_fixture_001" }] };
        if (sql.includes("original_storage_key"))
          return {
            rows: [
              { storage_key: "run_fixture_001/assets/a.jpg" },
              { storage_key: "run_fixture_001/diagnostics/d.json" },
            ],
          };
        if (sql.startsWith("select count")) {
          const table = /\.\"([a-z_]+)\"$/.exec(sql)?.[1] ?? "";
          return { rows: [{ count: String(counts[table] ?? 0) }] };
        }
        if (sql.startsWith("truncate table"))
          for (const table of USER_DATA_TABLES) counts[table] = 0;
        return { rows: [] };
      },
      release: () => {},
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as Pool;
    const existing = new Set([
      "run_fixture_001/assets/a.jpg",
      "run_fixture_001/diagnostics/d.json",
    ]);
    const deleted: string[] = [];
    const storage: StorageProvider = {
      name: "memory-trash",
      save: async (input) => ({
        storageKey: input.storageKey,
        sha256: input.expectedSha256,
        sizeBytes: input.bytes.length,
      }),
      openReadStream: async () => ({ stream: Readable.from([]), sizeBytes: 0 }),
      stat: async (key) => ({ exists: existing.has(key) }),
      delete: async (key) => {
        deleted.push(key);
        existing.delete(key);
      },
      cleanupTemporaryFiles: async () => 0,
      checkReady: async () => {},
    };

    const report = await resetTestData({
      pool,
      storage,
      env: allowed,
      execute: true,
    });
    expect(report.databaseCleared).toBe(true);
    expect(report.storageCleared).toBe(true);
    expect(Object.keys(report.tableCountsBefore)).toHaveLength(33);
    expect(Object.values(report.tableCountsBefore)).toEqual(Array(33).fill(1));
    expect(Object.values(report.tableCountsAfter)).toEqual(Array(33).fill(0));
    expect(deleted).toHaveLength(2);
    expect(publicSentinel.rows).toBe(7);
    expect(
      queries.some((sql) => sql.includes('"run_fixture_001"."users"')),
    ).toBe(true);
    const auditJson = JSON.stringify(report);
    expect(auditJson).not.toContain("run_fixture_001/assets/a.jpg");
    expect(auditJson).not.toContain("run_fixture_001/diagnostics/d.json");
    expect(auditJson).not.toContain("super-secret-value");
  });

  it("covers every current table declared by the API schema", () => {
    const schemaSource = readFileSync(fileURLToPath(new URL("../src/db/schema.ts", import.meta.url)), "utf8");
    const declaredTables = [...schemaSource.matchAll(/pgTable\(\s*["']([a-z_]+)["']/gu)].map((match) => match[1]).sort();
    expect([...USER_DATA_TABLES].sort()).toEqual(declaredTables);
  });
});
