import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { assertResetTestDataAllowed, RESET_CONFIRMATION, USER_DATA_TABLES } from "../src/admin/reset-test-data.js";

describe("test data reset guard", () => {
  it("requires all three independent confirmations", () => {
    expect(() => assertResetTestDataAllowed({ WARDROBE_ENV: "production", ALLOW_TEST_DATA_RESET: "true", RESET_CONFIRMATION })).toThrow();
    expect(() => assertResetTestDataAllowed({ WARDROBE_ENV: "test", ALLOW_TEST_DATA_RESET: "false", RESET_CONFIRMATION })).toThrow();
    expect(() => assertResetTestDataAllowed({ WARDROBE_ENV: "test", ALLOW_TEST_DATA_RESET: "true", RESET_CONFIRMATION: "wrong" })).toThrow();
    expect(() => assertResetTestDataAllowed({ WARDROBE_ENV: "test", ALLOW_TEST_DATA_RESET: "true", RESET_CONFIRMATION })).not.toThrow();
  });

  it("covers authentication, workspace, assets, idempotency, and diagnostics tables", () => {
    for (const table of ["users", "refresh_tokens", "garments", "asset_bindings", "assets", "sync_mutations", "diagnostic_cases", "api_request_traces"]) {
      expect(USER_DATA_TABLES).toContain(table);
    }
  });

  it("covers every current table declared by the API schema", () => {
    const schemaSource = readFileSync(fileURLToPath(new URL("../src/db/schema.ts", import.meta.url)), "utf8");
    const declaredTables = [...schemaSource.matchAll(/pgTable\(\s*["']([a-z_]+)["']/gu)].map((match) => match[1]).sort();
    expect([...USER_DATA_TABLES].sort()).toEqual(declaredTables);
  });
});
