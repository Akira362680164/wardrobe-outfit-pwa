import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { QWeatherProvider, qweatherOptionsFromEnv, type ProviderResult } from "../src/weather/qweather-provider.js";
import { WeatherCacheService } from "../src/weather/cache-service.js";
import { PostgresWeatherCacheRepository } from "../src/weather/cache-repository.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const schema = `run_qweather_smoke_${process.pid}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const admin = new Pool({ connectionString: databaseUrl, max: 2 });
let upstreamCount = 0;
const transport: Array<{ endpoint: string; httpStatus: number | "transport_error"; durationMs: number }> = [];
const fetchImpl: typeof fetch = async (input, init) => {
  if (upstreamCount >= 5) throw new Error("qweather smoke request cap exceeded");
  upstreamCount += 1;
  const started = performance.now();
  const endpoint = new URL(input instanceof Request ? input.url : input.toString()).pathname;
  try {
    const response = await fetch(input, init);
    transport.push({ endpoint, httpStatus: response.status, durationMs: Math.round((performance.now() - started) * 10) / 10 });
    return response;
  } catch (error) {
    transport.push({ endpoint, httpStatus: "transport_error", durationMs: Math.round((performance.now() - started) * 10) / 10 });
    throw error;
  }
};

async function controlled<T>(endpoint: string, run: () => Promise<T>, summarize: (value: T) => object) {
  try { return { endpoint, ok: true, ...summarize(await run()) }; }
  catch (error) { return { endpoint, ok: false, errorCode: controlledCode(error) }; }
}

try {
  await admin.query(`create schema ${quote(schema)}`);
  await admin.query(`set search_path to ${quote(schema)}`);
  await admin.query(readFileSync(resolve(process.cwd(), "migrations/0000_auth_schema.sql"), "utf8"));
  await admin.query(readFileSync(resolve(process.cwd(), "migrations/0021_location_weather_infrastructure.sql"), "utf8"));
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 8 });
  try {
    const provider = new QWeatherProvider({ ...qweatherOptionsFromEnv(), fetchImpl });
    const search = await controlled("geo-search", () => provider.searchLocations("上海"), (value) => ({ resultCount: value.length, locationId: value[0]?.locationId ?? null }));
    const resolved = await controlled("geo-resolve", () => provider.resolveCoordinates(121.47, 31.23), (value) => ({ resultCount: value.length, locationId: value[0]?.locationId ?? null }));
    const locationId = (search as { locationId?: string }).locationId ?? (resolved as { locationId?: string }).locationId ?? process.env.QWEATHER_SMOKE_LOCATION_ID ?? "101020100";
    const cache = new WeatherCacheService(new PostgresWeatherCacheRepository(pool));
    const weather = [];
    const jobs: Array<{ endpoint: "now" | "hourly" | "daily"; loader: () => Promise<ProviderResult<unknown>> }> = [
      { endpoint: "now", loader: () => provider.getNow(locationId, "zh", "m") },
      { endpoint: "hourly", loader: () => provider.getHourly(locationId, "zh", "m") },
      { endpoint: "daily", loader: () => provider.getDaily(locationId, "zh", "m") },
    ];
    for (const { endpoint, loader } of jobs) {
      const key = { provider: "qweather" as const, locationId, endpoint, lang: "zh" as const, unit: "m" as const };
      const first = await controlled(endpoint, () => cache.get(key, "Asia/Shanghai", loader), (value) => ({ resultCount: Array.isArray(value.data) ? value.data.length : 1, freshness: value.freshness }));
      const before = upstreamCount;
      const second = await controlled(`${endpoint}-repository-read`, () => cache.get(key, "Asia/Shanghai", loader), (value) => ({ resultCount: Array.isArray(value.data) ? value.data.length : 1, freshness: value.freshness, cacheHit: upstreamCount === before }));
      weather.push(first, second);
    }
    process.stdout.write(`${JSON.stringify({ upstreamRequestCount: upstreamCount, transport, results: [search, resolved, ...weather] }, null, 2)}\n`);
    if (upstreamCount > 5) process.exitCode = 2;
  } finally { await pool.end(); }
} finally {
  await admin.query(`drop schema if exists ${quote(schema)} cascade`);
  await admin.end();
}

function controlledCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "upstream_unavailable";
}
