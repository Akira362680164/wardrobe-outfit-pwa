import { readFileSync } from "node:fs";
import path from "node:path";

import {
  TemporaryAssetSessionStatusSchema,
  WorkspaceCommandResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceOverviewResponseSchema,
} from "@wardrobe/cloud-contracts";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AssetService } from "../src/assets/service.js";
import { AuthApiError } from "../src/auth/registrations.js";
import type { SessionService } from "../src/auth/session.js";
import type { WorkspaceCommandService } from "../src/workspace/command-service.js";
import { WorkspaceApiError } from "../src/workspace/errors.js";
import { decodeWorkspaceCursor, encodeWorkspaceCursor, type WorkspaceQueryService } from "../src/workspace/query-service.js";

const root = path.resolve(__dirname, "../../..");
const migration = readFileSync(path.join(root, "services/wardrobe-api/migrations/0009_online_workspace.sql"), "utf8");
const schema = readFileSync(path.join(root, "services/wardrobe-api/src/db/schema.ts"), "utf8");
const entityId = "018f6f02-7b7a-7a20-8d1d-000000000301";
const mutationId = "018f6f02-7b7a-7a20-8d1d-000000000302";
const sessionId = "018f6f02-7b7a-7a20-8d1d-000000000303";
const assetId = "018f6f02-7b7a-7a20-8d1d-000000000304";
const now = "2026-06-30T12:00:00.000Z";

describe("online workspace migration", () => {
  it("supports temporary ownership, expiry, binding and full idempotent responses", () => {
    for (const column of ["temporary_session_id", "client_mutation_id", "temporary_entity_type", "field_name", "temporary_variant", "expires_at", "bound_at", "response_json"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("assets_owner_or_temporary_check");
    expect(migration).toContain("assets_temporary_slot_unique");
    expect(schema).toContain('response: jsonb("response_json")');
  });
});

describe("workspace cursor", () => {
  it("roundtrips the stable updatedAt/id cursor and rejects malformed input", () => {
    const encoded = encodeWorkspaceCursor({ id: entityId, updatedAt: new Date(now) });
    expect(decodeWorkspaceCursor(encoded)).toEqual({ id: entityId, updatedAt: now });
    expect(decodeWorkspaceCursor("broken" )).toBeNull();
  });
});

describe("workspace routes", () => {
  it("isolates list and detail reads to the authenticated user", async () => {
    const calls: any[] = [];
    const query = {
      list: async (input: any) => {
        calls.push(input);
        return WorkspaceListResponseSchema.parse({ items: [], serverRevision: 4, requestId: input.requestId });
      },
      detail: async (input: any) => {
        calls.push(input);
        return { data: entity(), requestId: input.requestId };
      },
      overview: async () => overview(), wearSummary: async () => ({ garmentWearCounts: {}, outfitWearCounts: {}, recentEvents: [], serverRevision: 0 }),
    } as unknown as WorkspaceQueryService;
    const app = appWith({ query });
    const headers = authHeaders();
    const list = await app.inject({ method: "GET", url: "/api/workspace/garments?limit=20", headers });
    expect(list.statusCode).toBe(200);
    expect(calls[0]).toMatchObject({ resource: "garments", userId: "user-1", limit: 20, requestId: "request-1" });
    const detail = await app.inject({ method: "GET", url: `/api/workspace/garments/${entityId}`, headers });
    expect(detail.statusCode).toBe(200);
    expect(calls[1]).toMatchObject({ id: entityId, userId: "user-1" });
    await app.close();
  });

  it("serves overview and maps not-found/conflict to the shared error contract", async () => {
    const query = {
      overview: async () => overview(),
      detail: async () => { throw new WorkspaceApiError(404, "not_found", "missing"); },
      list: async () => ({ items: [], serverRevision: 0 }), wearSummary: async () => ({ garmentWearCounts: {}, outfitWearCounts: {}, recentEvents: [], serverRevision: 0 }),
    } as unknown as WorkspaceQueryService;
    const command = {
      update: async () => { throw new WorkspaceApiError(409, "conflict", "changed", false, entity()); },
    } as unknown as WorkspaceCommandService;
    const app = appWith({ query, command });
    const overviewResponse = await app.inject({ method: "GET", url: "/api/workspace/overview", headers: authHeaders() });
    expect(WorkspaceOverviewResponseSchema.parse(overviewResponse.json()).serverRevision).toBe(3);
    const missing = await app.inject({ method: "GET", url: `/api/workspace/garments/${entityId}`, headers: authHeaders() });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "not_found", retryable: false });
    const conflict = await app.inject({ method: "PUT", url: `/api/workspace/garments/${entityId}`, headers: { ...authHeaders(), "content-type": "application/json" }, payload: { clientMutationId: mutationId, expectedRevision: 1, payload: {}, temporaryAssetIds: [] } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "conflict", serverData: { id: entityId } });
    await app.close();
  });

  it("forwards create, batch, state and delete commands without accepting userId from the client", async () => {
    const calls: any[] = [];
    const committed = { status: "committed" as const, entity: entity(), revision: 1 };
    const command = Object.fromEntries(["create", "batchCreate", "patchPayload", "delete"].map((name) => [name, async (input: any) => { calls.push({ name, input }); return committed; }])) as unknown as WorkspaceCommandService;
    const app = appWith({ command });
    const headers = { ...authHeaders(), "content-type": "application/json" };
    const create = await app.inject({ method: "POST", url: "/api/workspace/garments", headers, payload: { clientMutationId: mutationId, payload: { name: "coat", userId: "attacker" }, temporaryAssetIds: [] } });
    expect(WorkspaceCommandResponseSchema.parse(create.json()).status).toBe("committed");
    await app.inject({ method: "POST", url: "/api/workspace/garments/batch", headers, payload: { items: [{ clientMutationId: mutationId, payload: {}, temporaryAssetIds: [] }] } });
    await app.inject({ method: "POST", url: `/api/workspace/outfits/${entityId}/favorite`, headers, payload: { clientMutationId: mutationId, expectedRevision: 1, value: true, payload: {} } });
    await app.inject({ method: "DELETE", url: `/api/workspace/garments/${entityId}`, headers, payload: { clientMutationId: mutationId, expectedRevision: 1 } });
    expect(calls.map((call) => call.name)).toEqual(["create", "batchCreate", "patchPayload", "delete"]);
    expect(calls.every((call) => call.input.userId === "user-1")).toBe(true);
    await app.close();
  });

  it("supports temporary session create, binary upload, status and abandon", async () => {
    const calls: any[] = [];
    const temporaryAsset = { assetId, fieldName: "image", variant: "original" as const, sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 8, uploadStatus: "uploaded" as const };
    const asset = {
      createTemporarySession: async (input: any) => { calls.push(input); return { sessionId, clientMutationId: mutationId, assets: [{ ...temporaryAsset, uploadStatus: "pending" }], expiresAt: now }; },
      uploadTemporary: async (input: any) => { calls.push(input); return { status: "uploaded", asset: temporaryAsset }; },
      getTemporarySession: async () => ({ sessionId, clientMutationId: mutationId, assets: [temporaryAsset], expiresAt: now, ready: true }),
      abandonTemporarySession: async () => ({ status: "abandoned", sessionId }),
    } as unknown as AssetService;
    const app = appWith({ asset });
    const headers = { ...authHeaders(), "content-type": "application/json" };
    const created = await app.inject({ method: "POST", url: "/api/workspace/assets/sessions", headers, payload: { clientMutationId: mutationId, entityType: "garment", slots: [{ fieldName: "image", variant: "original", sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 8 }] } });
    expect(created.statusCode).toBe(200);
    const uploaded = await app.inject({ method: "PUT", url: `/api/workspace/assets/sessions/${sessionId}/assets/${assetId}`, headers: { ...authHeaders(), "content-type": "image/png" }, payload: Buffer.from("12345678") });
    expect(uploaded.statusCode).toBe(200);
    const status = await app.inject({ method: "GET", url: `/api/workspace/assets/sessions/${sessionId}`, headers: authHeaders() });
    expect(TemporaryAssetSessionStatusSchema.parse(status.json()).ready).toBe(true);
    const abandoned = await app.inject({ method: "DELETE", url: `/api/workspace/assets/sessions/${sessionId}`, headers: authHeaders() });
    expect(abandoned.json()).toMatchObject({ status: "abandoned" });
    expect(calls[0]).toMatchObject({ userId: "user-1", deviceId: "device-1" });
    expect(calls[1]).toMatchObject({ userId: "user-1", bytes: Buffer.from("12345678") });
    await app.close();
  });

  it("rejects a mismatched device before calling services", async () => {
    const app = appWith({});
    const response = await app.inject({ method: "GET", url: "/api/workspace/overview", headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "other" } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "auth" });
    await app.close();
  });
});

function appWith(input: { query?: WorkspaceQueryService; command?: WorkspaceCommandService; asset?: AssetService }) {
  return buildApp({
    readinessCheck: async () => ({ database: "ready" }), storageProvider: null,
    sessionService: fakeSessionService(),
    workspaceQueryService: input.query ?? ({ overview: async () => overview(), list: async () => ({ items: [], serverRevision: 0 }), detail: async () => ({ data: entity() }), wearSummary: async () => ({ garmentWearCounts: {}, outfitWearCounts: {}, recentEvents: [], serverRevision: 0 }) } as unknown as WorkspaceQueryService),
    workspaceCommandService: input.command ?? ({} as WorkspaceCommandService),
    assetService: input.asset ?? ({} as AssetService),
  });
}

function fakeSessionService(): SessionService {
  return { authenticate: async (authorization: string | undefined) => {
    if (authorization !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "invalid");
    return { userId: "user-1", sessionId: "session-1", deviceId: "device-1" };
  } } as SessionService;
}

function authHeaders() { return { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1", "x-wardrobe-request-id": "request-1" }; }
function entity() { return { id: entityId, revision: 1, createdAt: now, updatedAt: now, payload: {} }; }
function overview() { return WorkspaceOverviewResponseSchema.parse({ garments: [], outfits: [], wishlistItems: [], locations: [], tripPlans: [], outfitPlans: [], wearEvents: [], profiles: [], serverRevision: 3 }); }
