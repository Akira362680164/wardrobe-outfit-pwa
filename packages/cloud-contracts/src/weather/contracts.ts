import { z } from "zod";
import { RealDateSchema, TimeZoneSchema, WeatherLocationRefSchema } from "../recommendations/contracts.js";

const MutationIdSchema = z.string().uuid();
const RevisionSchema = z.number().int().nonnegative();
const DateTimeSchema = z.string().datetime({ offset: true });
const LimitedString = z.string().trim().min(1).max(160);

export const WeatherLanguageSchema = z.enum(["zh", "en"]);
export const WeatherUnitSchema = z.enum(["m", "i"]);
export const WeatherEndpointSchema = z.enum(["now", "hourly", "daily"]);
export const WeatherProviderIdSchema = z.literal("qweather");
export const WeatherProviderErrorCodeSchema = z.enum([
  "disabled", "unconfigured", "timeout", "rate_limited", "auth_failed", "upstream_unavailable", "invalid_response",
]);

export const WeatherAttributionSchema = z.object({
  sources: z.array(LimitedString).max(16),
  license: z.array(LimitedString).max(16),
}).strict();
export const QWeatherAttributionSchema = WeatherAttributionSchema.extend({
  label: z.literal("天气服务由 QWeather 提供"),
  url: z.literal("https://www.qweather.com"),
}).strict();

export const WeatherLocationCandidateSchema = WeatherLocationRefSchema.extend({
  country: z.string().trim().min(1).max(80).optional(),
  adminArea: z.string().trim().min(1).max(80).optional(),
  parentCity: z.string().trim().min(1).max(80).optional(),
}).strict();

export const WeatherLocationSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(80) }).strict();
export const ResolveDeviceLocationCommandSchema = z.object({
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
}).strict();
export const WeatherLocationCandidatesResponseSchema = z.object({ candidates: z.array(WeatherLocationCandidateSchema).max(20) }).strict();

const PutLocationCommandSchema = z.object({
  clientMutationId: MutationIdSchema,
  expectedRevision: RevisionSchema,
  locationId: z.string().trim().min(1).max(80),
}).strict();
const DeleteLocationCommandSchema = z.object({ clientMutationId: MutationIdSchema, expectedRevision: RevisionSchema }).strict();
export const PutLocationProfileCommandSchema = PutLocationCommandSchema;
export const PutLocationOverrideCommandSchema = PutLocationCommandSchema;
export const DeleteLocationProfileCommandSchema = DeleteLocationCommandSchema;
export const DeleteLocationOverrideCommandSchema = DeleteLocationCommandSchema;

export const UserLocationProfileSchema = z.object({
  homeCity: WeatherLocationRefSchema.nullable(),
  revision: z.number().int().positive(),
  updatedAt: DateTimeSchema,
}).strict();
export const EmptyUserLocationProfileSchema = z.object({ homeCity: z.null(), revision: z.literal(0), updatedAt: z.null() }).strict();
export const LocationDateOverrideSchema = z.object({
  id: z.string().uuid(),
  location: WeatherLocationRefSchema,
  effectiveFrom: RealDateSchema,
  effectiveThrough: RealDateSchema,
  source: z.literal("device_location"),
  confirmedAt: DateTimeSchema,
  revision: z.number().int().positive(),
}).strict();
export const LocationDateOverrideStateSchema = z.object({
  override: LocationDateOverrideSchema.nullable(),
  revision: RevisionSchema,
  updatedAt: DateTimeSchema.nullable(),
}).strict();

export const NormalizedWeatherNowSchema = z.object({
  observedAt: DateTimeSchema,
  temperatureC: z.number().finite().min(-80).max(80),
  feelsLikeC: z.number().finite().min(-100).max(100).optional(),
  weatherCode: z.string().regex(/^\d{3}$/),
  weatherText: z.string().trim().min(1).max(80),
  windDirectionDeg: z.number().finite().min(0).max(360).optional(),
  windScale: z.string().trim().min(1).max(16).optional(),
  windSpeedKph: z.number().finite().nonnegative().max(500).optional(),
  humidity: z.number().finite().min(0).max(100).optional(),
  precipitationMm: z.number().finite().nonnegative().max(2000).optional(),
  pressureHpa: z.number().finite().min(500).max(1200).optional(),
  visibilityKm: z.number().finite().nonnegative().max(1000).optional(),
  cloudCover: z.number().finite().min(0).max(100).optional(),
}).strict();

export const NormalizedWeatherHourSchema = z.object({
  time: DateTimeSchema,
  temperatureC: z.number().finite().min(-80).max(80),
  weatherCode: z.string().regex(/^\d{3}$/),
  weatherText: z.string().trim().min(1).max(80),
  rainProbability: z.number().finite().min(0).max(100).optional(),
  precipitationMm: z.number().finite().nonnegative().max(2000).optional(),
  humidity: z.number().finite().min(0).max(100).optional(),
  windSpeedKph: z.number().finite().nonnegative().max(500).optional(),
  windScale: z.string().trim().min(1).max(16).optional(),
  cloudCover: z.number().finite().min(0).max(100).optional(),
}).strict();

const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const NormalizedWeatherDaySchema = z.object({
  date: RealDateSchema,
  temperatureMinC: z.number().finite().min(-80).max(80),
  temperatureMaxC: z.number().finite().min(-80).max(80),
  dayWeatherCode: z.string().regex(/^\d{3}$/),
  dayWeatherText: z.string().trim().min(1).max(80),
  nightWeatherCode: z.string().regex(/^\d{3}$/),
  nightWeatherText: z.string().trim().min(1).max(80),
  precipitationMm: z.number().finite().nonnegative().max(2000).optional(),
  humidity: z.number().finite().min(0).max(100).optional(),
  uvIndex: z.number().finite().min(0).max(30).optional(),
  cloudCover: z.number().finite().min(0).max(100).optional(),
  sunrise: ClockTimeSchema.optional(),
  sunset: ClockTimeSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.temperatureMinC > value.temperatureMaxC) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["temperatureMinC"], message: "temperatureMinC must be <= temperatureMaxC" });
});

export const WeatherProviderResultSchema = <T extends z.ZodTypeAny>(data: T) => z.object({
  data,
  updatedAt: DateTimeSchema,
  sources: z.array(LimitedString).max(16),
  license: z.array(LimitedString).max(16),
}).strict();

export const WeatherCacheKeySchema = z.object({
  provider: WeatherProviderIdSchema,
  locationId: z.string().trim().min(1).max(80),
  endpoint: WeatherEndpointSchema,
  lang: WeatherLanguageSchema,
  unit: WeatherUnitSchema,
}).strict();

export const WeatherCachePayloadSchema = z.union([
  NormalizedWeatherNowSchema,
  z.array(NormalizedWeatherHourSchema).max(168),
  z.array(NormalizedWeatherDaySchema).max(30),
]);
export const WeatherCacheEntrySchema = WeatherCacheKeySchema.extend({
  payload: WeatherCachePayloadSchema,
  providerUpdatedAt: DateTimeSchema,
  fetchedAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  staleUntil: DateTimeSchema,
  sources: z.array(LimitedString).max(16),
  license: z.array(LimitedString).max(16),
  targetLocalDate: RealDateSchema,
  status: z.literal("positive"),
}).strict();

export const WeatherCacheFreshnessSchema = z.enum(["fresh", "stale"]);

export type WeatherLanguage = z.infer<typeof WeatherLanguageSchema>;
export type WeatherUnit = z.infer<typeof WeatherUnitSchema>;
export type WeatherEndpoint = z.infer<typeof WeatherEndpointSchema>;
export type WeatherProviderErrorCode = z.infer<typeof WeatherProviderErrorCodeSchema>;
export type WeatherLocationCandidate = z.infer<typeof WeatherLocationCandidateSchema>;
export type PutLocationProfileCommand = z.infer<typeof PutLocationProfileCommandSchema>;
export type PutLocationOverrideCommand = z.infer<typeof PutLocationOverrideCommandSchema>;
export type DeleteLocationProfileCommand = z.infer<typeof DeleteLocationProfileCommandSchema>;
export type DeleteLocationOverrideCommand = z.infer<typeof DeleteLocationOverrideCommandSchema>;
export type UserLocationProfile = z.infer<typeof UserLocationProfileSchema>;
export type LocationDateOverride = z.infer<typeof LocationDateOverrideSchema>;
export type LocationDateOverrideState = z.infer<typeof LocationDateOverrideStateSchema>;
export type NormalizedWeatherNow = z.infer<typeof NormalizedWeatherNowSchema>;
export type NormalizedWeatherHour = z.infer<typeof NormalizedWeatherHourSchema>;
export type NormalizedWeatherDay = z.infer<typeof NormalizedWeatherDaySchema>;
export type WeatherCacheKey = z.infer<typeof WeatherCacheKeySchema>;
export type WeatherCacheEntry = z.infer<typeof WeatherCacheEntrySchema>;
