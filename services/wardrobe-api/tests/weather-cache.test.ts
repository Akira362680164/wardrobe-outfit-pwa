import { describe, expect, it } from "vitest";
import { WeatherCacheService, type WeatherCacheRepositoryLike } from "../src/weather/cache-service.js";
import { QWeatherProviderError } from "../src/weather/qweather-provider.js";
import { WEATHER_CACHE_KEY } from "./fixtures/weather/qweather.js";

const payload = { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, weatherCode: "101", weatherText: "多云" };

class MemoryRepository implements WeatherCacheRepositoryLike {
  row: any = null; negative: any = null; lockRuns = 0;
  async read() { return this.row; }
  async write(_key: unknown, value: unknown) { this.row = value; }
  async readNegative() { return this.negative; }
  async writeNegative(_key: unknown, value: unknown) { this.negative = value; }
  async withSingleFlight<T>(_key: unknown, run: () => Promise<T>) { this.lockRuns += 1; return run(); }
}

describe("PostgreSQL weather cache policy", () => {
  it("uses fresh without upstream, refreshes stale, and refuses max-stale", async () => {
    const repo = new MemoryRepository(); let calls = 0; let now = new Date("2026-07-14T12:00:00.000Z");
    const service = new WeatherCacheService(repo, () => now);
    const loader = async () => { calls += 1; return { data: payload, updatedAt: "2026-07-14T20:00:00.000+08:00", sources: ["QWeather"], license: ["QWeather Developers License"] }; };
    expect((await service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", loader)).freshness).toBe("fresh"); expect(calls).toBe(1);
    now = new Date("2026-07-14T12:19:59.000Z"); expect((await service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", loader)).freshness).toBe("fresh"); expect(calls).toBe(1);
    now = new Date("2026-07-14T12:20:01.000Z"); expect((await service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", loader)).freshness).toBe("fresh"); expect(calls).toBe(2);
    now = new Date("2026-07-14T14:20:02.000Z");
    await expect(service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", async () => { throw new QWeatherProviderError("upstream_unavailable"); })).rejects.toMatchObject({ code: "weather_unavailable" });
  });

  it("returns legal stale on refresh failure and negative cache never hides stale", async () => {
    const repo = new MemoryRepository(); let now = new Date("2026-07-14T12:00:00.000Z"); const service = new WeatherCacheService(repo, () => now);
    await service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", async () => ({ data: payload, updatedAt: "2026-07-14T20:00:00.000+08:00", sources: ["QWeather"], license: ["QWeather Developers License"] }));
    now = new Date("2026-07-14T12:21:00.000Z");
    const stale = await service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", async () => { throw new QWeatherProviderError("rate_limited", 120); });
    expect(stale.freshness).toBe("stale"); expect(repo.negative.retryAt.toISOString()).toBe("2026-07-14T12:23:00.000Z");
    expect((await service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", async () => { throw new Error("must not call"); })).freshness).toBe("stale");
  });

  it("forces daily revalidation across destination local midnight", async () => {
    const repo = new MemoryRepository(); let calls = 0; let now = new Date("2026-07-14T15:59:00.000Z"); const service = new WeatherCacheService(repo, () => now);
    const key = { ...WEATHER_CACHE_KEY, endpoint: "daily" as const };
    const loader = async () => { calls += 1; return { data: [], updatedAt: "2026-07-14T20:00:00.000+08:00", sources: ["QWeather"], license: ["QWeather Developers License"] }; };
    await service.get(key, "Asia/Shanghai", loader); now = new Date("2026-07-14T16:01:00.000Z"); await service.get(key, "Asia/Shanghai", loader); expect(calls).toBe(2);
  });

  it("single-flights concurrent cold misses to one upstream call", async () => {
    const repo = new MemoryRepository(); let calls = 0; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    repo.withSingleFlight = async <T>(_key: unknown, run: () => Promise<T>) => { repo.lockRuns += 1; if (repo.lockRuns > 1) await gate; const value = await run(); release(); return value; };
    const service = new WeatherCacheService(repo, () => new Date("2026-07-14T12:00:00.000Z"));
    const loader = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { data: payload, updatedAt: "2026-07-14T20:00:00.000+08:00", sources: ["QWeather"], license: ["QWeather Developers License"] }; };
    await Promise.all(Array.from({ length: 12 }, () => service.get(WEATHER_CACHE_KEY, "Asia/Shanghai", loader)));
    expect(calls).toBe(1);
  });
});
