import { describe, expect, it } from "vitest";
import {
  DeleteLocationOverrideCommandSchema,
  DeleteLocationProfileCommandSchema,
  PutLocationOverrideCommandSchema,
  PutLocationProfileCommandSchema,
  ResolveDeviceLocationCommandSchema,
  WeatherCacheEntrySchema,
  WeatherLocationSearchQuerySchema,
  WeatherOverviewSchema,
} from "@wardrobe/cloud-contracts";

const mutation = "10000000-0000-4000-8000-000000000001";

describe("weather and location strict contracts", () => {
  it("accepts only locationId writes and server-owned override dates", () => {
    expect(PutLocationProfileCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 0, locationId: "101020100" }).locationId).toBe("101020100");
    expect(PutLocationOverrideCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 0, locationId: "101020100" }).locationId).toBe("101020100");
    expect(() => PutLocationProfileCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 0, locationId: "101020100", displayName: "fake" })).toThrow();
    expect(() => PutLocationOverrideCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 0, locationId: "101020100", effectiveThrough: "2099-01-01" })).toThrow();
  });

  it("makes clears retryable commands and rejects unknown fields", () => {
    expect(DeleteLocationProfileCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 2 })).toEqual({ clientMutationId: mutation, expectedRevision: 2 });
    expect(DeleteLocationOverrideCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 2 })).toEqual({ clientMutationId: mutation, expectedRevision: 2 });
    expect(() => DeleteLocationProfileCommandSchema.parse({ clientMutationId: mutation, expectedRevision: 2, hardDelete: true })).toThrow();
  });

  it("limits search input and device coordinates, with no persistence fields", () => {
    expect(WeatherLocationSearchQuerySchema.parse({ q: "上海" })).toEqual({ q: "上海" });
    expect(() => WeatherLocationSearchQuerySchema.parse({ q: "" })).toThrow();
    expect(() => WeatherLocationSearchQuerySchema.parse({ q: "a".repeat(81) })).toThrow();
    expect(ResolveDeviceLocationCommandSchema.parse({ longitude: 121.47391, latitude: 31.23042 })).toEqual({ longitude: 121.47391, latitude: 31.23042 });
    expect(() => ResolveDeviceLocationCommandSchema.parse({ longitude: 121.47, latitude: 31.23, remember: true })).toThrow();
  });

  it("validates endpoint-specific cache metadata and attribution", () => {
    expect(WeatherCacheEntrySchema.parse({
      provider: "qweather", locationId: "101020100", endpoint: "now", lang: "zh", unit: "m",
      payload: { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, weatherCode: "101", weatherText: "多云" },
      providerUpdatedAt: "2026-07-14T20:00:00.000+08:00", fetchedAt: "2026-07-14T12:00:00.000Z",
      expiresAt: "2026-07-14T12:20:00.000Z", staleUntil: "2026-07-14T14:00:00.000Z",
      sources: ["QWeather"], license: ["QWeather Developers License"], targetLocalDate: "2026-07-14", status: "positive",
    }).status).toBe("positive");
  });

  it("rejects all endpoint and payload shape mismatches", () => {
    const metadata = {
      provider: "qweather" as const, locationId: "101020100", lang: "zh" as const, unit: "m" as const,
      providerUpdatedAt: "2026-07-14T20:00:00.000+08:00", fetchedAt: "2026-07-14T12:00:00.000Z",
      expiresAt: "2026-07-14T12:20:00.000Z", staleUntil: "2026-07-14T14:00:00.000Z",
      sources: ["QWeather"], license: ["QWeather Developers License"], targetLocalDate: "2026-07-14", status: "positive" as const,
    };
    const now = { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, weatherCode: "101", weatherText: "多云" };
    const hour = { time: "2026-07-14T21:00:00.000+08:00", temperatureC: 30, weatherCode: "101", weatherText: "多云" };
    const day = { date: "2026-07-14", temperatureMinC: 26, temperatureMaxC: 33, dayWeatherCode: "101", dayWeatherText: "多云", nightWeatherCode: "150", nightWeatherText: "晴" };

    expect(() => WeatherCacheEntrySchema.parse({ ...metadata, endpoint: "now", payload: [hour] })).toThrow();
    expect(() => WeatherCacheEntrySchema.parse({ ...metadata, endpoint: "hourly", payload: [day] })).toThrow();
    expect(() => WeatherCacheEntrySchema.parse({ ...metadata, endpoint: "daily", payload: [hour] })).toThrow();
    expect(() => WeatherCacheEntrySchema.parse({ ...metadata, endpoint: "hourly", payload: now })).toThrow();
  });

  it("keeps old overview readers compatible while accepting the new display evidence", () => {
    const base = {
      targetDate: "2026-07-14", contextMode: "forecast" as const,
      resolvedLocation: { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" },
      locationSource: "home_city" as const, targetTimezone: "Asia/Shanghai", contextResolvedAt: "2026-07-14T12:00:00.000Z",
      endpointFreshness: [], availabilityReason: "available" as const,
    };
    const legacy = { ...base, weatherEvidence: { weatherSource: "forecast" as const, weatherConfidence: 1, weatherUpdatedAt: "2026-07-14T12:00:00.000Z", temperatureMinC: 26, temperatureMaxC: 33, weatherCode: "101", summary: "多云" } };
    expect(WeatherOverviewSchema.parse(legacy)).toEqual(legacy);
    expect(WeatherOverviewSchema.parse({ ...base, weatherEvidence: { ...legacy.weatherEvidence, currentTemperatureC: 31, currentFeelsLikeC: 34, dayWeatherCode: "101", nightWeatherCode: "305" } }).weatherEvidence).toMatchObject({ currentTemperatureC: 31, currentFeelsLikeC: 34, dayWeatherCode: "101", nightWeatherCode: "305" });
  });

  it("rejects pseudo display evidence in locationless and weather fallback modes", () => {
    const fallback = {
      targetDate: "2026-07-14", contextMode: "locationless" as const, targetTimezone: "Asia/Shanghai",
      contextResolvedAt: "2026-07-14T12:00:00.000Z", endpointFreshness: [], availabilityReason: "locationless" as const,
      weatherEvidence: { weatherSource: "layering_default" as const, weatherConfidence: 0, weatherUpdatedAt: "2026-07-14T12:00:00.000Z", summary: "通用分层" },
    };
    expect(WeatherOverviewSchema.safeParse({ ...fallback, weatherEvidence: { ...fallback.weatherEvidence, currentTemperatureC: 20 } }).success).toBe(false);
    expect(WeatherOverviewSchema.safeParse({ ...fallback, weatherEvidence: { ...fallback.weatherEvidence, dayWeatherCode: "998" } }).success).toBe(false);
  });
});
