import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { AuthApiError } from "../src/auth/registrations.js";
import { FixedWindowRateLimiter } from "../src/auth/rate-limit.js";
import type { SessionService } from "../src/auth/session.js";
import type { ImageCropService } from "../src/image-crop/service.js";
import type { WeatherLocationServiceLike } from "../src/weather/location-service.js";
import { SHANGHAI_LOCATION } from "./fixtures/weather/qweather.js";

const USER = "10000000-0000-4000-8000-000000000001";
const headers = { authorization: "Bearer ok", "x-wardrobe-device-id": "device-1", "content-type": "application/json" };
const mutation = "20000000-0000-4000-8000-000000000001";

describe("authenticated location settings and GeoAPI routes", () => {
  it("never trusts userId or location metadata and forwards only authenticated user", async () => {
    const calls: unknown[] = []; const app = testApp(service(calls));
    const put = await app.inject({ method: "PUT", url: "/api/settings/location-profile", headers, payload: { clientMutationId: mutation, expectedRevision: 0, locationId: "101020100" } });
    expect(put.statusCode).toBe(200); expect(calls[0]).toEqual(["putProfile", USER, { clientMutationId: mutation, expectedRevision: 0, locationId: "101020100" }]);
    expect((await app.inject({ method: "PUT", url: "/api/settings/location-profile", headers, payload: { clientMutationId: mutation, expectedRevision: 0, locationId: "101020100", displayName: "fake" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/settings/location-override", headers, payload: { clientMutationId: mutation, expectedRevision: 0, locationId: "101020100", effectiveThrough: "2099-01-01" } })).statusCode).toBe(400);
    await app.close();
  });

  it("requires auth, matching device, and strict payloads on every route", async () => {
    const app = testApp(service([]));
    for (const request of [
      { method: "GET", url: "/api/settings/location-profile" },
      { method: "GET", url: "/api/settings/location-override" },
      { method: "GET", url: "/api/weather/locations/search?q=上海" },
      { method: "POST", url: "/api/weather/locations/resolve-device", payload: { longitude: 121.47, latitude: 31.23 } },
    ] as const) expect((await app.inject(request)).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/weather/locations/search?q=上海", headers: { authorization: "Bearer ok", "x-wardrobe-device-id": "wrong" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/weather/locations/resolve-device", headers, payload: { longitude: 121.47, latitude: 31.23, rawAddress: "forbidden" } })).statusCode).toBe(400);
    await app.close();
  });

  it("rounds device coordinates to two decimals before the provider and never writes", async () => {
    const calls: unknown[] = []; const app = testApp(service(calls));
    const response = await app.inject({ method: "POST", url: "/api/weather/locations/resolve-device", headers, payload: { longitude: 121.47391, latitude: 31.23042 } });
    expect(response.statusCode).toBe(200); expect(calls).toEqual([["resolveDevice", USER, 121.47, 31.23]]);
    expect(calls.some((call) => JSON.stringify(call).includes("put"))).toBe(false);
    await app.close();
  });

  it("applies a per-user cost limit to search and resolve", async () => {
    const limiter = new FixedWindowRateLimiter({ maxAttempts: 1, windowMs: 60_000 }); const app = testApp(service([]), limiter);
    expect((await app.inject({ method: "GET", url: "/api/weather/locations/search?q=上海", headers })).statusCode).toBe(200);
    const limited = await app.inject({ method: "GET", url: "/api/weather/locations/search?q=北京", headers });
    expect(limited.statusCode).toBe(429); expect(limited.json()).toMatchObject({ code: "rate_limited" });
    await app.close();
  });

  it("returns unavailable instead of a fixture when production QWeather is disabled", async () => {
    const app = buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session() });
    const response = await app.inject({ method: "GET", url: "/api/weather/locations/search?q=上海", headers });
    expect(response.statusCode).toBe(503); expect(response.json()).toMatchObject({ code: "weather_unavailable" });
    await app.close();
  });
});

function testApp(locationService: WeatherLocationServiceLike, locationCostLimiter?: FixedWindowRateLimiter) {
  return buildApp({ storageProvider: null, imageCropService: { close: async () => {} } as ImageCropService, sessionService: session(), weatherLocationService: locationService, locationCostLimiter });
}

function session(): SessionService { return { authenticate: async (header: string | undefined) => { if (header !== "Bearer ok") throw new AuthApiError(401, "AUTH_TOKEN_INVALID", "invalid"); return { userId: USER, sessionId: "session-1", deviceId: "device-1" }; } } as SessionService; }

function service(calls: unknown[]): WeatherLocationServiceLike {
  const record = { homeCity: SHANGHAI_LOCATION, revision: 1, updatedAt: "2026-07-14T12:00:00.000Z" };
  const override = { id: "30000000-0000-4000-8000-000000000001", location: SHANGHAI_LOCATION, effectiveFrom: "2026-07-14", effectiveThrough: "2026-07-15", source: "device_location" as const, confirmedAt: "2026-07-14T12:00:00.000Z", revision: 1 };
  return {
    getProfile: async (userId) => { calls.push(["getProfile", userId]); return record; },
    putProfile: async (userId, command) => { calls.push(["putProfile", userId, command]); return record; },
    deleteProfile: async (userId, command) => { calls.push(["deleteProfile", userId, command]); return { ...record, homeCity: null }; },
    getOverride: async (userId) => { calls.push(["getOverride", userId]); return { override, revision: 1, updatedAt: override.confirmedAt }; },
    putOverride: async (userId, command) => { calls.push(["putOverride", userId, command]); return { override, revision: 1, updatedAt: override.confirmedAt }; },
    deleteOverride: async (userId, command) => { calls.push(["deleteOverride", userId, command]); return { override: null, revision: 2, updatedAt: override.confirmedAt }; },
    search: async (userId, query) => { calls.push(["search", userId, query]); return { candidates: [SHANGHAI_LOCATION] }; },
    resolveDevice: async (userId, longitude, latitude) => { calls.push(["resolveDevice", userId, longitude, latitude]); return { candidates: [SHANGHAI_LOCATION] }; },
  };
}
