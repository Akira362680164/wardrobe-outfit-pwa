import { WeatherCacheEntrySchema, type WeatherCacheKey, type WeatherEndpoint } from "@wardrobe/cloud-contracts";
import { QWeatherProviderError, type ProviderResult } from "./qweather-provider.js";

const POLICY: Record<WeatherEndpoint, { ttlMs: number; staleMs: number }> = {
  now: { ttlMs: 20 * 60_000, staleMs: 2 * 60 * 60_000 },
  hourly: { ttlMs: 60 * 60_000, staleMs: 6 * 60 * 60_000 },
  daily: { ttlMs: 3 * 60 * 60_000, staleMs: 12 * 60 * 60_000 },
};

export interface WeatherCacheStored {
  payload: unknown;
  providerUpdatedAt: Date;
  fetchedAt: Date;
  expiresAt: Date;
  staleUntil: Date;
  sources: string[];
  license: string[];
  targetLocalDate: string;
}
export interface WeatherNegativeStored { code: string; retryAt: Date }
export interface WeatherCacheRepositoryLike {
  read(key: WeatherCacheKey): Promise<WeatherCacheStored | null>;
  write(key: WeatherCacheKey, value: WeatherCacheStored): Promise<void>;
  readNegative(key: WeatherCacheKey): Promise<WeatherNegativeStored | null>;
  writeNegative(key: WeatherCacheKey, value: WeatherNegativeStored): Promise<void>;
  withSingleFlight<T>(key: WeatherCacheKey, run: () => Promise<T>): Promise<T>;
}
export interface WeatherCacheResult<T> extends ProviderResult<T> {
  freshness: "fresh" | "stale";
  fetchedAt: string;
  expiresAt: string;
  staleUntil: string;
}

export class WeatherUnavailableError extends Error {
  readonly code = "weather_unavailable";
  constructor(public readonly causeCode: string) { super("weather_unavailable"); }
}

export class WeatherCacheService {
  constructor(private readonly repository: WeatherCacheRepositoryLike, private readonly clock: () => Date = () => new Date()) {}

  async get<T>(key: WeatherCacheKey, targetTimezone: string, loader: () => Promise<ProviderResult<T>>): Promise<WeatherCacheResult<T>> {
    const now = this.clock();
    const first = validateStored(key, await this.repository.read(key));
    if (isFresh(first, key.endpoint, targetTimezone, now)) return result(first!, "fresh") as WeatherCacheResult<T>;
    return this.repository.withSingleFlight(key, async () => {
      const lockedNow = this.clock();
      const cached = validateStored(key, await this.repository.read(key));
      if (isFresh(cached, key.endpoint, targetTimezone, lockedNow)) return result(cached!, "fresh") as WeatherCacheResult<T>;
      const negative = await this.repository.readNegative(key);
      if (negative && negative.retryAt > lockedNow) {
        if (isStale(cached, lockedNow)) return result(cached!, "stale") as WeatherCacheResult<T>;
        throw new WeatherUnavailableError(negative.code);
      }
      try {
        const loaded = await loader();
        const policy = POLICY[key.endpoint];
        const stored: WeatherCacheStored = {
          payload: loaded.data,
          providerUpdatedAt: new Date(loaded.updatedAt),
          fetchedAt: lockedNow,
          expiresAt: new Date(lockedNow.getTime() + policy.ttlMs),
          staleUntil: new Date(lockedNow.getTime() + policy.staleMs),
          sources: [...loaded.sources],
          license: [...loaded.license],
          targetLocalDate: localDate(lockedNow, targetTimezone),
        };
        const validated = validateStored(key, stored);
        if (!validated) throw new QWeatherProviderError("invalid_response");
        await this.repository.write(key, validated);
        return result(validated, "fresh") as WeatherCacheResult<T>;
      } catch (error) {
        const providerError = error instanceof QWeatherProviderError ? error : new QWeatherProviderError("upstream_unavailable");
        if (["rate_limited", "timeout", "upstream_unavailable"].includes(providerError.code)) {
          const seconds = Math.min(300, Math.max(30, providerError.retryAfterSeconds ?? 60));
          await this.repository.writeNegative(key, { code: providerError.code, retryAt: new Date(lockedNow.getTime() + seconds * 1000) });
        }
        if (isStale(cached, lockedNow)) return result(cached!, "stale") as WeatherCacheResult<T>;
        throw new WeatherUnavailableError(providerError.code);
      }
    });
  }
}

function isFresh(value: WeatherCacheStored | null, endpoint: WeatherEndpoint, timezone: string, now: Date) {
  if (!value || value.expiresAt <= now) return false;
  return endpoint !== "daily" || value.targetLocalDate === localDate(now, timezone);
}
function isStale(value: WeatherCacheStored | null, now: Date) { return Boolean(value && value.staleUntil > now); }
function result(value: WeatherCacheStored, freshness: "fresh" | "stale"): WeatherCacheResult<unknown> {
  return {
    data: value.payload,
    updatedAt: value.providerUpdatedAt.toISOString(),
    sources: value.sources,
    license: value.license,
    freshness,
    fetchedAt: value.fetchedAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    staleUntil: value.staleUntil.toISOString(),
  };
}
function validateStored(key: WeatherCacheKey, value: WeatherCacheStored | null): WeatherCacheStored | null {
  if (!value) return null;
  const parsed = WeatherCacheEntrySchema.safeParse({
    ...key,
    payload: value.payload,
    providerUpdatedAt: value.providerUpdatedAt.toISOString(),
    fetchedAt: value.fetchedAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    staleUntil: value.staleUntil.toISOString(),
    sources: value.sources,
    license: value.license,
    targetLocalDate: value.targetLocalDate,
    status: "positive",
  });
  return parsed.success ? { ...value, payload: parsed.data.payload, sources: parsed.data.sources, license: parsed.data.license } : null;
}
function localDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
