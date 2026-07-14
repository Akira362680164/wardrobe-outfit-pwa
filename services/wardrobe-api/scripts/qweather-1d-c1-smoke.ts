import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { WeatherOverviewService } from "../src/weather/overview-service.js";
import { PostgresWeatherCacheRepository } from "../src/weather/cache-repository.js";
import { WeatherCacheService } from "../src/weather/cache-service.js";
import { QWeatherProvider, qweatherOptionsFromEnv } from "../src/weather/qweather-provider.js";
import { RecommendationGenerationServiceV2 } from "../src/recommendations/generation-service-v2.js";
import { RecommendationRegenerationService } from "../src/recommendations/regeneration-service.js";
import { RecommendationReadService } from "../src/recommendations/read-service.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const locationId = process.env.QWEATHER_SMOKE_LOCATION_ID ?? "101020100";
const schema = `run_qweather_1dc1_${process.pid}`;
const preseedNowDaily = process.env.QWEATHER_SMOKE_PRESEED_NOW_DAILY === "true";
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const migrationsDir = resolve(process.cwd(), "migrations");
const admin = new Pool({ connectionString: databaseUrl, max: 2 });
let upstreamRequestCount = 0;
const endpointCounts: Record<"now" | "hourly" | "daily", number> = { now: 0, hourly: 0, daily: 0 };
const fetchImpl: typeof fetch = async (input, init) => {
  if (upstreamRequestCount >= 3) throw controlled("request_cap_exceeded");
  const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
  const endpoint = path.includes("/weather/now") ? "now" : path.includes("/weather/72h") ? "hourly" : path.includes("/weather/7d") ? "daily" : null;
  if (!endpoint) throw controlled("unexpected_endpoint");
  upstreamRequestCount++;
  endpointCounts[endpoint]++;
  return fetch(input, init);
};

let exitCode = 0;
try {
  await admin.query(`create schema ${quote(schema)}`);
  const migrationClient = await admin.connect();
  try {
    await migrationClient.query(`set search_path to ${quote(schema)}`);
    for (const file of readdirSync(migrationsDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      await migrationClient.query(readFileSync(resolve(migrationsDir, file), "utf8"));
    }
  } finally { migrationClient.release(); }

  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 12 });
  try {
    const userId = randomUUID();
    await pool.query("insert into users(id) values($1)", [userId]);
    await pool.query("insert into profiles(user_id,origin_device_id,payload) values($1,'controlled-smoke',$2::jsonb)", [userId, JSON.stringify({ timezone: "America/Los_Angeles", workdayScene: "commute", restDayScene: "casual", thermalBias: "normal" })]);
    await pool.query(`insert into user_location_profiles(user_id,location_id,display_name,timezone,revision,client_mutation_id,mutation_fingerprint)
      values($1,$2,'受控测试城市','Asia/Shanghai',1,$3,$4)`, [userId, locationId, randomUUID(), "a".repeat(64)]);
    const garments = [
      ["tops", "shirt", "白", "commute", 4, 2], ["tops", "t_shirt", "黑", "casual", 2, 1],
      ["pants", "suit_pants", "黑", "commute", 4, 2], ["pants", "casual_pants", "蓝", "casual", 2, 2],
      ["shoes", "loafers", "黑", "commute", 4, 2], ["shoes", "sneakers", "白", "casual", 2, 1],
    ];
    for (const [category, subcategory, color, style, formality, warmth] of garments) {
      await pool.query("insert into garments(user_id,origin_device_id,payload) values($1,'controlled-smoke',$2::jsonb)", [userId, JSON.stringify({ status: "active", category, subcategory, colors: [color], seasons: ["all"], styles: [style], formality, warmth, temperatureMinC: -10, temperatureMaxC: 45, imageUrl: "controlled-test-asset" })]);
    }

    const provider = new QWeatherProvider({ ...qweatherOptionsFromEnv(), fetchImpl });
    const repository = new PostgresWeatherCacheRepository(pool);
    const cache = new WeatherCacheService(repository);
    const overview = new WeatherOverviewService({ pool, cache, provider });
    const generation = new RecommendationGenerationServiceV2(pool, overview);
    const regeneration = new RecommendationRegenerationService(pool, generation);
    const today = shanghaiDate(new Date());
    const tomorrow = addDays(today, 1);
    if (preseedNowDaily) await preseedControlledNowDaily(repository, locationId, today, tomorrow);
    await regeneration.enqueueExplicit(userId, today, { clientMutationId: randomUUID() });
    await regeneration.processNext(today);
    const afterGeneration = upstreamRequestCount;
    const [todayOverview, tomorrowOverview] = await Promise.all([overview.get(userId, today), overview.get(userId, tomorrow)]);
    const read = await new RecommendationReadService(pool).read(userId, today, tomorrow);
    const current = (await pool.query("select target_date::text,generation_batch_id::text from daily_recommendations where user_id=$1 and target_date=any($2::date[]) and is_current order by target_date", [userId, [today, tomorrow]])).rows;
    const cacheRowCount = (await pool.query("select count(*)::int count from weather_cache")).rows[0].count;
    const expectedRequests = preseedNowDaily ? 1 : 3;
    const passed = upstreamRequestCount === expectedRequests
      && afterGeneration === expectedRequests
      && endpointCounts.now === (preseedNowDaily ? 0 : 1) && endpointCounts.hourly === 1 && endpointCounts.daily === (preseedNowDaily ? 0 : 1)
      && cacheRowCount === 3 && current.length === 2
      && new Set(current.map((row) => row.generation_batch_id)).size === 1
      && read.pairConsistent && read.items.length === 2
      && todayOverview.contextMode === "forecast" && tomorrowOverview.contextMode === "forecast";
    process.stdout.write(`${JSON.stringify({
      passed, upstreamRequestCount, endpointCounts, preseededEndpoints: preseedNowDaily ? ["now", "daily"] : [], cacheRowCount, cacheReuseRequestDelta: upstreamRequestCount - afterGeneration,
      overviewModes: [todayOverview.contextMode, tomorrowOverview.contextMode], pairConsistent: read.pairConsistent,
      sameGenerationBatch: new Set(current.map((row) => row.generation_batch_id)).size === 1,
      currentCount: current.length, businessTimezone: read.timezone,
    })}\n`);
    if (!passed) exitCode = 2;
  } finally { await pool.end(); }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ passed: false, errorCode: controlledCode(error), upstreamRequestCount, endpointCounts })}\n`);
  exitCode = 1;
} finally {
  await admin.query(`drop schema if exists ${quote(schema)} cascade`).catch(() => undefined);
  await admin.end();
}
process.exitCode = exitCode;

function controlled(code: string) { const error = new Error(code); (error as Error & { code: string }).code = code; return error; }
function controlledCode(error: unknown) { return error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "controlled_smoke_failed"; }
function shanghaiDate(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function addDays(date: string, count: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); }

async function preseedControlledNowDaily(repository: PostgresWeatherCacheRepository, id: string, today: string, tomorrow: string) {
  const fetchedAt = new Date();
  const metadata = {
    providerUpdatedAt: fetchedAt, fetchedAt, expiresAt: new Date(fetchedAt.getTime() + 60 * 60_000),
    staleUntil: new Date(fetchedAt.getTime() + 6 * 60 * 60_000), sources: ["controlled_fixture"], license: ["test_only"], targetLocalDate: today,
  };
  await repository.write({ provider: "qweather", locationId: id, endpoint: "now", lang: "zh", unit: "m" }, {
    ...metadata, payload: { observedAt: fetchedAt.toISOString(), temperatureC: 28, feelsLikeC: 30, weatherCode: "101", weatherText: "多云", precipitationMm: 0, windScale: "2-3" },
  });
  await repository.write({ provider: "qweather", locationId: id, endpoint: "daily", lang: "zh", unit: "m" }, {
    ...metadata, payload: [today, tomorrow].map((date) => ({ date, temperatureMinC: 24, temperatureMaxC: 32, dayWeatherCode: "101", dayWeatherText: "多云", nightWeatherCode: "150", nightWeatherText: "晴" })),
  });
}
