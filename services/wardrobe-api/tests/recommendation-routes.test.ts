import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthApiError } from "../src/auth/registrations.js";
import type { SessionService } from "../src/auth/session.js";
import type { RecommendationReadService } from "../src/recommendations/read-service.js";
import type { RecommendationRegenerationService } from "../src/recommendations/regeneration-service.js";
import type { RecommendationGenerationCoordinator } from "../src/recommendations/coordinator.js";
import type { RecommendationAcceptService } from "../src/recommendations/accept-service.js";
import type { ImageCropService } from "../src/image-crop/service.js";

const USER = "10000000-0000-4000-8000-000000000001";
const EMPTY = { timezone: "Asia/Shanghai", pairConsistent: false, items: [] };
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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
    const request = { id: "30000000-0000-4000-8000-000000000001", userId: USER, targetDate: TODAY, reasons: ["explicit_reassess"], clientMutationIds: ["40000000-0000-4000-8000-000000000001"], status: "pending", attemptCount: 0, maxAttempts: 5, nextAttemptAt: "2026-07-15T12:00:00.000Z", lockedAt: null, lastErrorCode: null, resultRecommendationId: null, createdAt: "2026-07-15T12:00:00.000Z", updatedAt: "2026-07-15T12:00:00.000Z", completedAt: null };
    const calls: unknown[] = [];
    const app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService, recommendationRegenerationService: { enqueueExplicit: async (...args: unknown[]) => { calls.push(args); return request; } } as unknown as RecommendationRegenerationService });
    const headers = { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" };
    expect((await app.inject({ method: "POST", url: `/api/recommendations/daily/${TODAY}/reassess`, payload: { clientMutationId: request.clientMutationIds[0] }, headers })).statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect((await app.inject({ method: "POST", url: `/api/recommendations/daily/${TODAY}/reassess`, payload: { clientMutationId: request.clientMutationIds[0], paw: true }, headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/recommendations/daily/${TODAY}/reassess`, payload: { clientMutationId: request.clientMutationIds[0] } })).statusCode).toBe(401);
    await app.close();
  });
  it("keeps resolve behind the realtime flag and validates force idempotency", async () => {
    const previous = process.env.RECOMMENDATION_REALTIME_ENABLED;
    const calls: unknown[] = [];
    const coordinator = { resolve: async (...args: unknown[]) => { calls.push(args); return { timezone: "Asia/Shanghai", results: [{ targetDate: TODAY, status: "not_ready" }] }; } } as RecommendationGenerationCoordinator;
    const headers = { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" };
    try {
      process.env.RECOMMENDATION_REALTIME_ENABLED = "false";
      let app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService, recommendationGenerationCoordinator: coordinator });
      expect((await app.inject({ method: "POST", url: "/api/recommendations/resolve", payload: { dates: [TODAY] }, headers })).statusCode).toBe(404);
      await app.close();
      process.env.RECOMMENDATION_REALTIME_ENABLED = "true";
      app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService, recommendationGenerationCoordinator: coordinator });
      expect((await app.inject({ method: "POST", url: "/api/recommendations/resolve", payload: { dates: [TODAY], force: true }, headers })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url: "/api/recommendations/resolve", payload: { dates: [TODAY] }, headers })).statusCode).toBe(200);
      expect(calls).toHaveLength(1);
      await app.close();
    } finally {
      if (previous === undefined) delete process.env.RECOMMENDATION_REALTIME_ENABLED; else process.env.RECOMMENDATION_REALTIME_ENABLED = previous;
    }
  });
  it("keeps accept behind its independent flag and forwards authenticated device identity", async () => {
    const previous = process.env.RECOMMENDATION_ACCEPT_ENABLED; const calls: unknown[][] = [];
    const recommendationId = "50000000-0000-4000-8000-000000000001"; const candidateId = "50000000-0000-4000-8000-000000000002";
    const garmentIds = ["50000000-0000-4000-8000-000000000003", "50000000-0000-4000-8000-000000000004"];
    const mutationId = "50000000-0000-4000-8000-000000000005"; const selectedAt = "2026-07-15T12:00:00.000Z";
    const payload = { sourceType: "daily_recommendation", date: TODAY, garmentIds, itemIds: [3, 4], recommendationId, recommendationRevision: 1, recommendationCandidateId: candidateId, recommendationInputFingerprint: "a".repeat(64), algorithmVersion: "wardora-recommendation-realtime-v1", sourceVariant: "original", originalGarmentIds: garmentIds, garmentSnapshots: [{ garmentId: garmentIds[0], legacyItemId: 3, name: "top", role: "tops", category: "tops" }, { garmentId: garmentIds[1], legacyItemId: 4, name: "pants", role: "pants", category: "pants" }], recommendationSnapshot: { candidateId, reasonCodes: [], riskCodes: [] }, snapshotVersion: 1, selectedAt, status: "planned", isPrimary: true, role: "primary" } as const;
    const accept = { accept: async (...args: unknown[]) => { calls.push(args); return { status: "committed", idempotentReplay: false, plan: { id: "50000000-0000-4000-8000-000000000006", revision: 1, payload, createdAt: selectedAt, updatedAt: selectedAt } }; } } as unknown as RecommendationAcceptService;
    const headers = { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1" };
    try {
      process.env.RECOMMENDATION_ACCEPT_ENABLED = "false";
      let app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService, recommendationAcceptService: accept });
      expect((await app.inject({ method: "POST", url: `/api/recommendations/daily/${TODAY}/accept`, headers, payload: { clientMutationId: mutationId, recommendationId, expectedRecommendationRevision: 1, candidateId, selectedGarmentIds: garmentIds } })).statusCode).toBe(404); await app.close();
      process.env.RECOMMENDATION_ACCEPT_ENABLED = "true";
      app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), recommendationReadService: { read: async () => EMPTY } as unknown as RecommendationReadService, recommendationAcceptService: accept });
      expect((await app.inject({ method: "POST", url: `/api/recommendations/daily/${TODAY}/accept`, headers, payload: { clientMutationId: mutationId, recommendationId, expectedRecommendationRevision: 1, candidateId, selectedGarmentIds: garmentIds } })).statusCode).toBe(200);
      expect(calls[0]?.slice(0, 3)).toEqual([USER, "device-1", TODAY]); await app.close();
    } finally { if (previous === undefined) delete process.env.RECOMMENDATION_ACCEPT_ENABLED; else process.env.RECOMMENDATION_ACCEPT_ENABLED = previous; }
  });
});

function session(): SessionService { return { authenticate: async (header: string | undefined) => { if (header !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "invalid"); return { userId: USER, sessionId: "session-1", deviceId: "device-1" }; } } as SessionService; }
