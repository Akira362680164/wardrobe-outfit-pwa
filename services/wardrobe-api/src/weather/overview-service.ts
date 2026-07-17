import type { Pool } from "pg";
import {
  WeatherOverviewSchema,
  type NormalizedWeatherDay,
  type NormalizedWeatherHour,
  type NormalizedWeatherNow,
  type ResolvedRecommendationContext,
  type WeatherCacheKey,
  type WeatherEndpoint,
  type WeatherOverview,
} from "@wardrobe/cloud-contracts";
import { getPostgresPool } from "../db/client.js";
import { RecommendationContextResolver } from "../recommendations/context-resolver.js";
import { PostgresWeatherCacheRepository } from "./cache-repository.js";
import { WeatherCacheService, type WeatherCacheResult } from "./cache-service.js";
import { createQWeatherProviderFromEnv, type QWeatherProviderLike } from "./qweather-provider.js";

interface ContextResolverLike { resolve(userId: string, targetDate: string): Promise<ResolvedRecommendationContext> }
interface CacheLike { get(key: WeatherCacheKey, targetTimezone: string, loader: () => Promise<any>): Promise<WeatherCacheResult<any>> }

export class WeatherOverviewService {
  private readonly resolver: ContextResolverLike;
  private readonly cache: CacheLike;
  private readonly provider: QWeatherProviderLike;
  constructor(options: { pool?: Pool; resolver?: ContextResolverLike; cache?: CacheLike; provider?: QWeatherProviderLike; clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date());
    const pool = options.pool ?? (!options.resolver || !options.cache ? getPostgresPool() : undefined);
    this.resolver = options.resolver ?? new RecommendationContextResolver(pool!, this.clock);
    this.cache = options.cache ?? new WeatherCacheService(new PostgresWeatherCacheRepository(pool!), this.clock);
    this.provider = options.provider ?? createQWeatherProviderFromEnv();
  }
  private readonly clock: () => Date;

  async get(userId: string, targetDate: string): Promise<WeatherOverview> {
    const context = await this.resolver.resolve(userId, targetDate);
    if (context.contextMode === "locationless") return WeatherOverviewSchema.parse({
      targetDate, contextMode: "locationless", targetTimezone: "Asia/Shanghai", contextResolvedAt: context.contextResolvedAt,
      weatherEvidence: { weatherSource: "layering_default", weatherConfidence: 0, weatherUpdatedAt: context.contextResolvedAt, summary: "未设置城市，采用通用分层推荐" },
      endpointFreshness: [], availabilityReason: "locationless",
    });
    const today = localDate(this.clock(), context.targetTimezone);
    const offset = daysBetween(today, targetDate);
    if (offset < 0 || offset > 6) return fallback(context, "forecast_out_of_range");
    const locationId = context.resolvedLocation!.locationId;
    const endpoints: WeatherEndpoint[] = offset === 0 ? ["now", "hourly", "daily"] : offset === 1 ? ["hourly", "daily"] : ["daily"];
    const results = new Map<WeatherEndpoint, WeatherCacheResult<any>>();
    await Promise.all(endpoints.map(async (endpoint) => {
      try {
        const key = { provider: "qweather" as const, locationId, endpoint, lang: "zh" as const, unit: "m" as const };
        const loader = endpoint === "now" ? () => this.provider.getNow(locationId, "zh", "m") : endpoint === "hourly" ? () => this.provider.getHourly(locationId, "zh", "m") : () => this.provider.getDaily(locationId, "zh", "m");
        results.set(endpoint, await this.cache.get(key, context.targetTimezone, loader));
      } catch { /* endpoint unavailability is represented by the aggregate fallback below */ }
    }));
    const daily = (results.get("daily")?.data as NormalizedWeatherDay[] | undefined)?.find((day) => day.date === targetDate);
    if (!daily) return fallback(context, results.size ? "insufficient_evidence" : "provider_unavailable", [...results.entries()]);
    const nowInstant = this.clock().getTime();
    const hours = ((results.get("hourly")?.data as NormalizedWeatherHour[] | undefined) ?? []).filter((hour) =>
      localDate(new Date(hour.time), context.targetTimezone) === targetDate && (offset !== 0 || Date.parse(hour.time) >= nowInstant),
    );
    const now = offset === 0 ? results.get("now")?.data as NormalizedWeatherNow | undefined : undefined;
    const rainValues = [
      ...(now?.precipitationMm !== undefined && now.precipitationMm > 0 ? [100] : isRainCode(now?.weatherCode) ? [100] : []),
      ...hours.map((hour) => hour.rainProbability).filter((value): value is number => value !== undefined),
    ];
    const windValues = [windLevel(now?.windScale), ...hours.map((hour) => windLevel(hour.windScale))].filter((value): value is number => value !== undefined);
    const used = [...results.entries()];
    const participatingEndpoints: WeatherEndpoint[] = ["daily"];
    if (now) participatingEndpoints.push("now");
    if (hours.length) participatingEndpoints.push("hourly");
    const attribution = attributionOf(used);
    return WeatherOverviewSchema.parse({
      targetDate, contextMode: "forecast", resolvedLocation: context.resolvedLocation, locationSource: context.locationSource,
      targetTimezone: context.targetTimezone, contextResolvedAt: context.contextResolvedAt,
      weatherEvidence: {
        weatherSource: "forecast", weatherConfidence: participatingEndpoints.some((endpoint) => results.get(endpoint)?.freshness === "stale") ? 0.7 : 1,
        weatherUpdatedAt: latestUpdatedAt(used), temperatureMinC: daily.temperatureMinC, temperatureMaxC: daily.temperatureMaxC,
        ...(now ? { currentTemperatureC: now.temperatureC } : {}),
        ...(now?.feelsLikeC === undefined ? {} : { feelsLikeMinC: now.feelsLikeC, feelsLikeMaxC: now.feelsLikeC }),
        ...(now?.feelsLikeC === undefined ? {} : { currentFeelsLikeC: now.feelsLikeC }),
        ...(rainValues.length ? { rainProbability: Math.max(...rainValues) } : {}),
        ...(windValues.length ? { windLevel: Math.max(...windValues) } : {}),
        ...(now ? { weatherCode: now.weatherCode } : {}),
        dayWeatherCode: daily.dayWeatherCode, nightWeatherCode: daily.nightWeatherCode,
        summary: now ? `${now.weatherText}，${daily.dayWeatherText === daily.nightWeatherText ? daily.dayWeatherText : `${daily.dayWeatherText}转${daily.nightWeatherText}`}` : daily.dayWeatherText === daily.nightWeatherText ? daily.dayWeatherText : `${daily.dayWeatherText}转${daily.nightWeatherText}`,
      },
      endpointFreshness: endpointEvidence(used), availabilityReason: "available", ...(attribution ? { attribution } : {}),
    });
  }
}

function fallback(context: ResolvedRecommendationContext, availabilityReason: "forecast_out_of_range" | "provider_unavailable" | "insufficient_evidence", results: Array<[WeatherEndpoint, WeatherCacheResult<any>]> = []): WeatherOverview {
  const attribution = attributionOf(results);
  return WeatherOverviewSchema.parse({
    targetDate: context.targetDate, contextMode: "weather_fallback", resolvedLocation: context.resolvedLocation, locationSource: context.locationSource,
    targetTimezone: context.targetTimezone, contextResolvedAt: context.contextResolvedAt,
    weatherEvidence: { weatherSource: "layering_default", weatherConfidence: 0, weatherUpdatedAt: context.contextResolvedAt, summary: "天气暂不可用，采用通用分层推荐" },
    endpointFreshness: endpointEvidence(results), availabilityReason, ...(attribution ? { attribution } : {}),
  });
}
function endpointEvidence(results: Array<[WeatherEndpoint, WeatherCacheResult<any>]>) { return results.map(([endpoint, value]) => ({ endpoint, freshness: value.freshness, providerUpdatedAt: value.updatedAt, fetchedAt: value.fetchedAt, expiresAt: value.expiresAt, staleUntil: value.staleUntil })).sort((a, b) => a.endpoint.localeCompare(b.endpoint)); }
function attributionOf(results: Array<[WeatherEndpoint, WeatherCacheResult<any>]>) {
  const sources = [...new Set(results.flatMap(([, value]) => value.sources))];
  const license = [...new Set(results.flatMap(([, value]) => value.license))];
  return results.length ? { label: "天气服务由 QWeather 提供" as const, url: "https://www.qweather.com" as const, sources, license } : undefined;
}
function latestUpdatedAt(results: Array<[WeatherEndpoint, WeatherCacheResult<any>]>) { return results.map(([, value]) => value.updatedAt).sort().at(-1)!; }
function windLevel(value: string | undefined) { if (!value) return undefined; const match = value.match(/\d+/g)?.map(Number); return match?.length ? Math.min(12, Math.max(...match)) : undefined; }
function isRainCode(value: string | undefined) { return value !== undefined && /^3\d{2}$/.test(value); }
function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }
function localDate(value: Date, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
