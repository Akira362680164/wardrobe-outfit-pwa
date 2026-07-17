import { describe, expect, it } from "vitest";
import { WeatherOverviewService } from "../src/weather/overview-service.js";

const context = { targetDate: "2026-07-14", targetTimezone: "Asia/Shanghai", contextResolvedAt: "2026-07-14T12:00:00.000Z", contextMode: "forecast" as const, resolvedLocation: { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" }, locationSource: "home_city" as const };
const meta = { freshness: "fresh" as const, updatedAt: "2026-07-14T11:55:00.000Z", fetchedAt: "2026-07-14T12:00:00.000Z", expiresAt: "2026-07-14T13:00:00.000Z", staleUntil: "2026-07-14T18:00:00.000Z", sources: ["QWeather"], license: ["QWeather Developers License"] };

describe("WeatherOverview evidence aggregation", () => {
  it("performs zero provider/cache calls for locationless", async () => {
    let calls = 0;
    const service = new WeatherOverviewService({
      resolver: { resolve: async () => ({ targetDate: "2026-07-14", targetTimezone: "Asia/Shanghai", contextResolvedAt: context.contextResolvedAt, contextMode: "locationless" }) },
      cache: { get: async () => { calls++; throw new Error("must not call"); } }, provider: {} as any,
      clock: () => new Date("2026-07-14T12:00:00.000Z"),
    });
    expect(await service.get("user", "2026-07-14")).toMatchObject({ contextMode: "locationless", availabilityReason: "locationless", endpointFreshness: [] });
    expect((await service.get("user", "2026-07-14")).weatherEvidence).not.toHaveProperty("currentTemperatureC");
    expect(calls).toBe(0);
  });

  it("uses today now/hourly/daily without leaking now into tomorrow", async () => {
    const endpoints: string[] = [];
    const data: Record<string, unknown> = {
      now: { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, feelsLikeC: 34, weatherCode: "305", weatherText: "小雨", precipitationMm: 0.8, windScale: "5-6" },
      hourly: [
        { time: "2026-07-14T19:00:00.000+08:00", temperatureC: 32, weatherCode: "399", weatherText: "过去的暴雨", rainProbability: 100, windScale: "11-12" },
        { time: "2026-07-14T21:00:00.000+08:00", temperatureC: 30, weatherCode: "101", weatherText: "多云", rainProbability: 20, windScale: "3-4" },
        { time: "2026-07-15T09:00:00.000+08:00", temperatureC: 29, weatherCode: "101", weatherText: "多云", rainProbability: 10 },
      ],
      daily: [{ date: "2026-07-14", temperatureMinC: 26, temperatureMaxC: 33, dayWeatherCode: "101", dayWeatherText: "多云", nightWeatherCode: "305", nightWeatherText: "小雨" }, { date: "2026-07-15", temperatureMinC: 25, temperatureMaxC: 32, dayWeatherCode: "100", dayWeatherText: "晴", nightWeatherCode: "150", nightWeatherText: "晴" }],
    };
    const service = new WeatherOverviewService({ resolver: { resolve: async (_u, date) => ({ ...context, targetDate: date }) }, cache: { get: async (key: any) => { endpoints.push(key.endpoint); return { data: data[key.endpoint], ...meta }; } }, provider: {} as any, clock: () => new Date("2026-07-14T12:00:00.000Z") });
    const today = await service.get("user", "2026-07-14");
    expect(today).toMatchObject({ contextMode: "forecast", weatherEvidence: {
      temperatureMinC: 26, temperatureMaxC: 33, currentTemperatureC: 31,
      feelsLikeMinC: 34, currentFeelsLikeC: 34, rainProbability: 100, windLevel: 6,
      weatherCode: "305", dayWeatherCode: "101", nightWeatherCode: "305",
    } });
    expect(today.weatherEvidence.summary).toContain("小雨");
    endpoints.length = 0;
    const tomorrow = await service.get("user", "2026-07-15");
    expect(endpoints.sort()).toEqual(["daily", "hourly"]);
    expect(tomorrow.weatherEvidence).not.toHaveProperty("feelsLikeMinC");
    expect(tomorrow.weatherEvidence).not.toHaveProperty("currentTemperatureC");
    expect(tomorrow.weatherEvidence).not.toHaveProperty("currentFeelsLikeC");
    expect(tomorrow.weatherEvidence).not.toHaveProperty("weatherCode");
    expect(tomorrow.weatherEvidence).toMatchObject({ dayWeatherCode: "100", nightWeatherCode: "150" });
    expect(tomorrow.weatherEvidence.rainProbability).toBe(10);
  });

  it("reduces confidence when any participating endpoint is stale", async () => {
    const data: Record<string, unknown> = {
      now: { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, weatherCode: "101", weatherText: "多云" },
      hourly: [{ time: "2026-07-14T21:00:00.000+08:00", temperatureC: 30, weatherCode: "305", weatherText: "小雨", rainProbability: 60 }],
      daily: [{ date: "2026-07-14", temperatureMinC: 26, temperatureMaxC: 33, dayWeatherCode: "101", dayWeatherText: "多云", nightWeatherCode: "305", nightWeatherText: "小雨" }],
    };
    const service = new WeatherOverviewService({
      resolver: { resolve: async () => context },
      cache: { get: async (key: any) => ({ data: data[key.endpoint], ...meta, freshness: key.endpoint === "hourly" ? "stale" as const : "fresh" as const }) },
      provider: {} as any,
      clock: () => new Date("2026-07-14T12:00:00.000Z"),
    });
    expect((await service.get("user", "2026-07-14")).weatherEvidence.weatherConfidence).toBe(0.7);
  });

  it("keeps legal realtime evidence when today's daily endpoint fails", async () => {
    const data: Record<string, unknown> = {
      now: { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, feelsLikeC: 34, weatherCode: "305", weatherText: "小雨", precipitationMm: 0.8, windScale: "5-6" },
      hourly: [
        { time: "2026-07-14T21:00:00.000+08:00", temperatureC: 30, weatherCode: "101", weatherText: "多云", rainProbability: 20, windScale: "3-4" },
      ],
    };
    const service = new WeatherOverviewService({
      resolver: { resolve: async () => context },
      cache: { get: async (key: any) => {
        if (key.endpoint === "daily") throw new Error("daily unavailable");
        return { data: data[key.endpoint], ...meta };
      } },
      provider: {} as any,
      clock: () => new Date("2026-07-14T12:00:00.000Z"),
    });

    const result = await service.get("user", "2026-07-14");
    expect(result).toMatchObject({
      contextMode: "forecast",
      availabilityReason: "available",
      weatherEvidence: {
        currentTemperatureC: 31,
        currentFeelsLikeC: 34,
        weatherCode: "305",
        rainProbability: 100,
        windLevel: 6,
        summary: "小雨",
      },
    });
    for (const field of ["temperatureMinC", "temperatureMaxC", "dayWeatherCode", "nightWeatherCode"]) {
      expect(result.weatherEvidence).not.toHaveProperty(field);
    }
    expect(result.endpointFreshness.map((entry) => entry.endpoint).sort()).toEqual(["hourly", "now"]);
  });

  it("keeps travel context but clears weather values beyond the seven-day window", async () => {
    let calls = 0;
    const service = new WeatherOverviewService({ resolver: { resolve: async () => ({ ...context, targetDate: "2026-07-22", locationSource: "travel" }) }, cache: { get: async () => { calls++; throw new Error(); } }, provider: {} as any, clock: () => new Date("2026-07-14T04:00:00.000Z") });
    const result = await service.get("user", "2026-07-22");
    expect(result).toMatchObject({ contextMode: "weather_fallback", locationSource: "travel", availabilityReason: "forecast_out_of_range" });
    expect(result.weatherEvidence).not.toHaveProperty("temperatureMinC");
    expect(result.weatherEvidence).not.toHaveProperty("currentTemperatureC");
    expect(result.weatherEvidence).not.toHaveProperty("currentFeelsLikeC");
    expect(result.weatherEvidence).not.toHaveProperty("dayWeatherCode");
    expect(result.weatherEvidence).not.toHaveProperty("nightWeatherCode");
    expect(calls).toBe(0);
  });

  it("does not leak pseudo fields after every cached endpoint is beyond max stale", async () => {
    const service = new WeatherOverviewService({
      resolver: { resolve: async () => context },
      cache: { get: async () => { throw new Error("max stale expired"); } }, provider: {} as any,
      clock: () => new Date("2026-07-14T12:00:00.000Z"),
    });
    const result = await service.get("user", "2026-07-14");
    expect(result).toMatchObject({ contextMode: "weather_fallback", availabilityReason: "provider_unavailable" });
    for (const field of ["currentTemperatureC", "currentFeelsLikeC", "weatherCode", "dayWeatherCode", "nightWeatherCode"]) {
      expect(result.weatherEvidence).not.toHaveProperty(field);
    }
  });
});
