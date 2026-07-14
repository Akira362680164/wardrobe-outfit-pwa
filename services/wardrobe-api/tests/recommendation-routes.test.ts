import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthApiError } from "../src/auth/registrations.js";
import type { SessionService } from "../src/auth/session.js";
import type { RecommendationReadService } from "../src/recommendations/read-service.js";
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
});

function session(): SessionService { return { authenticate: async (header: string | undefined) => { if (header !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "invalid"); return { userId: USER, sessionId: "session-1", deviceId: "device-1" }; } } as SessionService; }
