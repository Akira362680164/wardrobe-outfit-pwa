import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";
import { WeatherCacheEntrySchema, WeatherCacheKeySchema, type WeatherCacheKey } from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import type { WeatherCacheRepositoryLike, WeatherCacheStored, WeatherNegativeStored } from "./cache-service.js";

export class PostgresWeatherCacheRepository implements WeatherCacheRepositoryLike {
  private readonly lockedClient = new AsyncLocalStorage<PoolClient>();
  constructor(private readonly pool: Pool = getPostgresPool()) {}

  async read(key: WeatherCacheKey): Promise<WeatherCacheStored | null> {
    const validKey = WeatherCacheKeySchema.parse(key);
    const row = (await this.executor().query(`select payload, provider_updated_at, fetched_at, expires_at, stale_until, sources, license, target_local_date::text as target_local_date from weather_cache where provider=$1 and location_id=$2 and endpoint=$3 and lang=$4 and unit=$5 and payload is not null`, values(validKey))).rows[0];
    if (!row) return null;
    const parsed = WeatherCacheEntrySchema.safeParse({ ...validKey, payload: row.payload, providerUpdatedAt: row.provider_updated_at.toISOString(), fetchedAt: row.fetched_at.toISOString(), expiresAt: row.expires_at.toISOString(), staleUntil: row.stale_until.toISOString(), sources: row.sources, license: row.license, targetLocalDate: row.target_local_date, status: "positive" });
    return parsed.success ? { payload: parsed.data.payload, providerUpdatedAt: row.provider_updated_at, fetchedAt: row.fetched_at, expiresAt: row.expires_at, staleUntil: row.stale_until, sources: parsed.data.sources, license: parsed.data.license, targetLocalDate: parsed.data.targetLocalDate } : null;
  }
  async write(key: WeatherCacheKey, value: WeatherCacheStored): Promise<void> {
    const validKey = WeatherCacheKeySchema.parse(key);
    const parsed = WeatherCacheEntrySchema.parse({
      ...validKey, payload: value.payload, providerUpdatedAt: value.providerUpdatedAt.toISOString(), fetchedAt: value.fetchedAt.toISOString(),
      expiresAt: value.expiresAt.toISOString(), staleUntil: value.staleUntil.toISOString(), sources: value.sources, license: value.license,
      targetLocalDate: value.targetLocalDate, status: "positive",
    });
    await this.executor().query(`
      insert into weather_cache (provider,location_id,endpoint,lang,unit,payload,provider_updated_at,fetched_at,expires_at,stale_until,sources,license,target_local_date,status,negative_code,negative_until,updated_at)
      values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,'positive',null,null,now())
      on conflict (provider,location_id,endpoint,lang,unit) do update set payload=excluded.payload,provider_updated_at=excluded.provider_updated_at,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,stale_until=excluded.stale_until,sources=excluded.sources,license=excluded.license,target_local_date=excluded.target_local_date,status='positive',negative_code=null,negative_until=null,updated_at=now()
    `, [...values(validKey), JSON.stringify(parsed.payload), value.providerUpdatedAt, value.fetchedAt, value.expiresAt, value.staleUntil, JSON.stringify(parsed.sources), JSON.stringify(parsed.license), parsed.targetLocalDate]);
  }
  async readNegative(key: WeatherCacheKey): Promise<WeatherNegativeStored | null> {
    const row = (await this.executor().query(`select negative_code,negative_until from weather_cache where provider=$1 and location_id=$2 and endpoint=$3 and lang=$4 and unit=$5 and negative_until is not null`, values(key))).rows[0];
    return row ? { code: row.negative_code, retryAt: row.negative_until } : null;
  }
  async writeNegative(key: WeatherCacheKey, value: WeatherNegativeStored): Promise<void> {
    await this.executor().query(`
      insert into weather_cache (provider,location_id,endpoint,lang,unit,status,negative_code,negative_until,updated_at)
      values ($1,$2,$3,$4,$5,'negative',$6,$7,now())
      on conflict (provider,location_id,endpoint,lang,unit) do update set negative_code=excluded.negative_code,negative_until=excluded.negative_until,status=case when weather_cache.payload is null then 'negative' else weather_cache.status end,updated_at=now()
    `, [...values(key), value.code, value.retryAt]);
  }
  async withSingleFlight<T>(key: WeatherCacheKey, run: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`weather-cache:${values(key).join(":")}`]);
      const output = await this.lockedClient.run(client, run);
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  private executor() { return this.lockedClient.getStore() ?? this.pool; }
}

function values(key: WeatherCacheKey) { return [key.provider, key.locationId, key.endpoint, key.lang, key.unit]; }
