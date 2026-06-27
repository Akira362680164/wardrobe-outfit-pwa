import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BootstrapRequestSchema,
  BootstrapResponseSchema,
  PullRequestSchema,
  PullResponseSchema,
  PushRequestSchema,
  PushResponseSchema,
  ResolveConflictRequestSchema,
} from "@wardrobe/cloud-contracts";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const migration = readFileSync(path.join(root, "services/wardrobe-api/migrations/0001_business_sync_schema.sql"), "utf8");
const closetLocationMigration = readFileSync(path.join(root, "services/wardrobe-api/migrations/0005_closet_locations.sql"), "utf8");
const journal = readFileSync(path.join(root, "services/wardrobe-api/migrations/meta/_journal.json"), "utf8");
const drizzleSchema = readFileSync(path.join(root, "services/wardrobe-api/src/db/schema.ts"), "utf8");

const businessTables = [
  "wardrobes",
  "garments",
  "outfits",
  "outfit_items",
  "wishlist_items",
  "wear_events",
  "trip_plans",
  "outfit_plans",
  "assets",
  "sync_changes",
  "sync_mutations",
];

function emptyEntities() {
  return {
    garments: [],
    outfits: [],
    outfitItems: [],
    wishlistItems: [],
    wearEvents: [],
    tripPlans: [],
    outfitPlans: [],
    assets: [],
    closetLocations: [],
  };
}

describe("business sync schema", () => {
  it("has the B3 business tables in SQL migration and journal", () => {
    for (const table of businessTables) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
    }
    expect(journal).toContain("0001_business_sync_schema");
  });

  it("keeps sync changes per-user ordered and mutations idempotent per user", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX sync_changes_user_seq_unique ON sync_changes(user_id, change_seq)");
    expect(migration).toContain("CREATE UNIQUE INDEX sync_mutations_user_mutation_unique ON sync_mutations(user_id, mutation_id)");
    expect(migration).toContain("REFERENCES users(id) ON DELETE CASCADE");
  });

  it("exports drizzle tables for B3", () => {
    for (const name of ["wardrobes", "garments", "outfits", "outfitItems", "wishlistItems", "wearEvents", "tripPlans", "outfitPlans", "assets", "syncChanges", "syncMutations"]) {
      expect(drizzleSchema).toContain(`export const ${name}`);
    }
  });

  it("migrates closet locations required by the current bootstrap contract", () => {
    expect(closetLocationMigration).toContain("ADD VALUE IF NOT EXISTS 'closetLocation'");
    expect(closetLocationMigration).toContain("CREATE TABLE IF NOT EXISTS locations");
    expect(journal).toContain("0005_closet_locations");
  });
});

describe("sync contracts", () => {
  it("validates bootstrap request and response", () => {
    expect(BootstrapRequestSchema.parse({ deviceId: "device-a", workspaceSchemaVersion: 1 })).toMatchObject({ deviceId: "device-a" });
    expect(BootstrapResponseSchema.parse({
      serverCursor: "cursor-1",
      entities: emptyEntities(),
      assetManifest: [],
      hasMore: false,
    })).toMatchObject({ serverCursor: "cursor-1", hasMore: false });
  });

  it("validates push, pull, and conflict contracts", () => {
    const mutationId = "018f6f02-7b7a-7a20-8d1d-000000000001";
    const entityId = "018f6f02-7b7a-7a20-8d1d-000000000002";
    const conflictId = "018f6f02-7b7a-7a20-8d1d-000000000003";
    const createdAt = "2026-06-26T12:00:00.000Z";

    expect(PushRequestSchema.parse({
      deviceId: "device-a",
      mutations: [{
        mutationId,
        entityType: "garment",
        entityId,
        operation: "create",
        createdAt,
        attemptCount: 0,
      }],
    }).mutations[0].payload).toEqual({});
    expect(PushResponseSchema.parse({
      results: [{ mutationId, entityType: "garment", entityId, status: "accepted", serverRevision: 1 }],
      serverCursor: "cursor-2",
    }).results[0].status).toBe("accepted");
    expect(PullRequestSchema.parse({ cursor: null, limit: 500 }).limit).toBe(500);
    expect(PullResponseSchema.parse({
      changes: [{ cursor: "cursor-2", entityType: "garment", entityId, operation: "create", revision: 1, createdAt }],
      nextCursor: "cursor-2",
      hasMore: false,
    }).changes[0].payload).toEqual({});
    expect(ResolveConflictRequestSchema.parse({ conflictId, resolution: "keep_local" }).resolution).toBe("keep_local");
  });
});
