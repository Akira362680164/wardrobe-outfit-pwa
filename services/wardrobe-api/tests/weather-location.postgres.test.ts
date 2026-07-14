import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { WeatherLocationService, LocationMutationConflictError } from "../src/weather/location-service.js";
import { WeatherCacheService } from "../src/weather/cache-service.js";
import { PostgresWeatherCacheRepository } from "../src/weather/cache-repository.js";
import { SHANGHAI_LOCATION } from "./fixtures/weather/qweather.js";

const databaseUrl = process.env.WARDROBE_RECOMMENDATION_TEST_DATABASE_URL ?? "postgresql:///wardrobe_test";
const schema = `run_weather_1d_b_${process.pid}`;
const upgradeSchema = `${schema}_upgrade`;
const admin = new Pool({ connectionString: databaseUrl, max: 4 });
let pool: Pool;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const migrationsDir = resolve(process.cwd(), "migrations");
const migrationFiles = readdirSync(migrationsDir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const mutation = () => randomUUID();
const provider = {
  getLocationById: async (locationId: string) => ({ ...SHANGHAI_LOCATION, locationId }),
  searchLocations: async () => [SHANGHAI_LOCATION],
  resolveCoordinates: async () => [SHANGHAI_LOCATION],
};

async function createSchema(name: string) { await admin.query(`drop schema if exists ${quote(name)} cascade`); await admin.query(`create schema ${quote(name)}`); }
async function applyMigrations(name: string, files = migrationFiles) { const client = await admin.connect(); try { await client.query(`set search_path to ${quote(name)}`); for (const file of files) await client.query(readFileSync(resolve(migrationsDir, file), "utf8")); } finally { client.release(); } }
async function user() { const id = randomUUID(); await pool.query("insert into users (id) values ($1)", [id]); return id; }

beforeAll(async () => {
  await createSchema(schema); await applyMigrations(schema);
  pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 16 });
}, 120_000);
afterAll(async () => { await pool?.end(); await admin.query(`drop schema if exists ${quote(schema)} cascade`); await admin.query(`drop schema if exists ${quote(upgradeSchema)} cascade`); await admin.end(); }, 30_000);

describe("1D-B fresh and 0020 upgrade migrations", () => {
  it("creates all three tables from fresh and from 0020", async () => {
    for (const table of ["user_location_profiles", "location_date_overrides", "weather_cache"]) expect((await pool.query("select to_regclass($1) as name", [table])).rows[0].name).toBe(table);
    await createSchema(upgradeSchema); await applyMigrations(upgradeSchema, migrationFiles.filter((file) => !file.startsWith("0021_")));
    expect((await admin.query("select to_regclass($1) as name", [`${upgradeSchema}.weather_cache`])).rows[0].name).toBeNull();
    await applyMigrations(upgradeSchema, migrationFiles.filter((file) => file.startsWith("0021_")));
    expect((await admin.query("select to_regclass($1) as name", [`${upgradeSchema}.weather_cache`])).rows[0].name).toBe("weather_cache");
  }, 120_000);
});

describe("location revisions, tombstones, idempotency and isolation", () => {
  it("creates, updates, clears, replays and rejects mutation conflicts", async () => {
    const userId = await user(); const service = new WeatherLocationService(pool, provider, () => new Date("2026-07-14T12:00:00.000Z"));
    const createId = mutation(); const first = await service.putProfile(userId, { clientMutationId: createId, expectedRevision: 0, locationId: "101020100" });
    expect(first).toMatchObject({ homeCity: SHANGHAI_LOCATION, revision: 1 });
    expect(await service.putProfile(userId, { clientMutationId: createId, expectedRevision: 0, locationId: "101020100" })).toEqual(first);
    await expect(service.putProfile(userId, { clientMutationId: createId, expectedRevision: 0, locationId: "101010100" })).rejects.toBeInstanceOf(LocationMutationConflictError);
    await expect(service.putProfile(userId, { clientMutationId: mutation(), expectedRevision: 0, locationId: "101020100" })).rejects.toMatchObject({ code: "revision_conflict" });
    const clearId = mutation(); const cleared = await service.deleteProfile(userId, { clientMutationId: clearId, expectedRevision: 1 }); expect(cleared).toMatchObject({ homeCity: null, revision: 2 });
    const replacement = await service.putProfile(userId, { clientMutationId: mutation(), expectedRevision: 2, locationId: "101020100" }); expect(replacement.revision).toBe(3);
    expect(await service.deleteProfile(userId, { clientMutationId: clearId, expectedRevision: 1 })).toEqual(cleared);
    expect((await service.getProfile(userId)).revision).toBe(3);
  });

  it("serializes concurrent same-mutation replay and competing revisions", async () => {
    const userId = await user(); const service = new WeatherLocationService(pool, provider, () => new Date("2026-07-14T12:00:00.000Z")); const same = { clientMutationId: mutation(), expectedRevision: 0, locationId: "101020100" };
    const replayed = await Promise.all(Array.from({ length: 12 }, () => service.putProfile(userId, same)));
    expect(new Set(replayed.map((value) => value.revision))).toEqual(new Set([1]));
    expect((await pool.query("select count(*)::int as count from user_location_profiles where user_id=$1", [userId])).rows[0].count).toBe(1);
    const competing = await Promise.allSettled([service.putProfile(userId, { clientMutationId: mutation(), expectedRevision: 1, locationId: "101010100" }), service.putProfile(userId, { clientMutationId: mutation(), expectedRevision: 1, locationId: "101030100" })]);
    expect(competing.filter((value) => value.status === "fulfilled")).toHaveLength(1); expect(competing.filter((value) => value.status === "rejected")).toHaveLength(1);
  });

  it("isolates users, cascades account deletion, and server-generates override dates", async () => {
    const userA = await user(); const userB = await user(); const service = new WeatherLocationService(pool, provider, () => new Date("2026-07-14T22:00:00.000Z"));
    const value = await service.putOverride(userA, { clientMutationId: mutation(), expectedRevision: 0, locationId: "101020100" });
    await service.putProfile(userA, { clientMutationId: mutation(), expectedRevision: 0, locationId: "101020100" });
    expect(value).toMatchObject({ override: { effectiveFrom: "2026-07-15", effectiveThrough: "2026-07-16", source: "device_location", revision: 1 }, revision: 1 });
    expect(await service.getOverride(userB)).toEqual({ override: null, revision: 0, updatedAt: null });
    await pool.query("delete from users where id = $1", [userA]);
    expect((await pool.query("select count(*)::int as count from location_date_overrides where user_id = $1", [userA])).rows[0].count).toBe(0);
    expect((await pool.query("select count(*)::int as count from user_location_profiles where user_id = $1", [userA])).rows[0].count).toBe(0);
  });

  it("versions, updates, clears and idempotently replays the one current device override", async () => {
    const userId = await user(); const service = new WeatherLocationService(pool, provider, () => new Date("2026-07-14T12:00:00.000Z")); const createId = mutation();
    const first = await service.putOverride(userId, { clientMutationId: createId, expectedRevision: 0, locationId: "101020100" });
    expect(await service.putOverride(userId, { clientMutationId: createId, expectedRevision: 0, locationId: "101020100" })).toEqual(first);
    await expect(service.putOverride(userId, { clientMutationId: createId, expectedRevision: 0, locationId: "101010100" })).rejects.toBeInstanceOf(LocationMutationConflictError);
    const second = await service.putOverride(userId, { clientMutationId: mutation(), expectedRevision: 1, locationId: "101010100" }); expect(second.revision).toBe(2);
    const clearId = mutation(); const cleared = await service.deleteOverride(userId, { clientMutationId: clearId, expectedRevision: 2 }); expect(cleared).toMatchObject({ override: null, revision: 3 });
    expect(await service.deleteOverride(userId, { clientMutationId: clearId, expectedRevision: 2 })).toEqual(cleared);
    await expect(service.deleteOverride(userId, { clientMutationId: mutation(), expectedRevision: 2 })).rejects.toMatchObject({ code: "revision_conflict" });
    expect((await pool.query("select count(*)::int as count from location_date_overrides where user_id=$1 and is_current=true", [userId])).rows[0].count).toBe(1);
  });

  it("never stores raw device coordinates", async () => {
    const all = JSON.stringify([...(await pool.query("select * from user_location_profiles")).rows, ...(await pool.query("select * from location_date_overrides")).rows]);
    expect(all).not.toContain("121.47391"); expect(all).not.toContain("31.23042");
  });
});

describe("weather_cache real PostgreSQL single-flight", () => {
  it("serves a pool-sized concurrent cold miss with one upstream request and then a fresh hit", async () => {
    const repository = new PostgresWeatherCacheRepository(pool); const service = new WeatherCacheService(repository, () => new Date("2026-07-14T12:00:00.000Z")); let calls = 0;
    const key = { provider: "qweather" as const, locationId: "101020100", endpoint: "now" as const, lang: "zh" as const, unit: "m" as const };
    const loader = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 15)); return { data: { observedAt: "2026-07-14T19:54:00.000+08:00", temperatureC: 31, weatherCode: "101", weatherText: "多云" }, updatedAt: "2026-07-14T20:00:00.000+08:00", sources: ["QWeather"], license: ["QWeather Developers License"] }; };
    const results = await Promise.all(Array.from({ length: 16 }, () => service.get(key, "Asia/Shanghai", loader)));
    expect(calls).toBe(1); expect(results.every((result) => result.freshness === "fresh")).toBe(true);
    await service.get(key, "Asia/Shanghai", loader); expect(calls).toBe(1);
    const row = (await pool.query("select payload, sources, negative_code from weather_cache where provider='qweather' and location_id='101020100' and endpoint='now' and lang='zh' and unit='m'")).rows[0];
    expect(row.payload).toMatchObject({ weatherCode: "101" }); expect(row.sources).toEqual(["QWeather"]); expect(row.negative_code).toBeNull();
  }, 30_000);
});
