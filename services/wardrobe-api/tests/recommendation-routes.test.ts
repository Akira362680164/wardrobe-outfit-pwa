import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthApiError } from "../src/auth/registrations.js";
import type { SessionService } from "../src/auth/session.js";
import type { RecommendationReadService } from "../src/recommendations/read-service.js";
import type { RecommendationRegenerationService } from "../src/recommendations/regeneration-service.js";
import type { ImageCropService } from "../src/image-crop/service.js";

const USER = "10000000-0000-4000-8000-000000000001";
const EMPTY = { timezone: "Asia/Shanghai", pairConsistent: false, items: [] };

describe("authenticated recommendation read API", () => {
  it("uses only the authenticated user and validates range", async () => {
    const calls: unknown[] = [];
    const app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async (...args: unknown[]) => { calls.push(args); return EMPTY; } } as unknown as RecommendationReadService });
    const headers = { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" };
    const ok = await app.inject({ method: "GET", url: "/api/recommendations?startDate=2026-07-14&endDate=2026-07-15", headers });
    expect(ok.statusCode).toBe(200); expect(calls).toEqual([[USER, "2026-07-14", "2026-07-15"]]);
    expect((await app.inject({ method: "GET", url: "/api/recommendations?startDate=2026-07-16&endDate=2026-07-15", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/recommendations?startDate=2026-07-14&endDate=2026-08-20", headers })).statusCode).toBe(400);
    await app.close();
  });
  it("returns 401 without auth and 403 for a different device", async () => {
    const app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService });
    expect((await app.inject({ method: "GET", url: "/api/recommendations?startDate=2026-07-14&endDate=2026-07-15" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/recommendations?startDate=2026-07-14&endDate=2026-07-15", headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "other" } })).statusCode).toBe(403);
    await app.close();
  });
  it("reassess is authenticated, strict, and returns an auditable idempotent request", async () => {
    const request = { id: "30000000-0000-4000-8000-000000000001", userId: USER, targetDate: "2026-07-14", reasons: ["explicit_reassess"], clientMutationIds: ["40000000-0000-4000-8000-000000000001"], status: "pending", attemptCount: 0, maxAttempts: 5, nextAttemptAt: "2026-07-14T12:00:00.000Z", lockedAt: null, lastErrorCode: null, resultRecommendationId: null, createdAt: "2026-07-14T12:00:00.000Z", updatedAt: "2026-07-14T12:00:00.000Z", completedAt: null };
    const calls: unknown[] = [];
    const app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService, recommendationRegenerationService: { enqueueExplicit: async (...args: unknown[]) => { calls.push(args); return request; } } as unknown as RecommendationRegenerationService });
    const headers = { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" };
    expect((await app.inject({ method: "POST", url: "/api/recommendations/daily/2026-07-14/reassess", payload: { clientMutationId: request.clientMutationIds[0] }, headers })).statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: "/api/recommendations/daily/2026-07-14/reassess", payload: { clientMutationId: request.clientMutationIds[0], paw: true }, headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/recommendations/daily/2026-07-14/reassess", payload: { clientMutationId: request.clientMutationIds[0] } })).statusCode).toBe(401);
    await app.close();
  });
});

function session(): SessionService { return { authenticate: async (header: string | undefined) => { if (header !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "invalid"); return { userId: USER, sessionId: "session-1", deviceId: "device-1" }; } } as SessionService; }
