import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  NormalizedWeatherDaySchema,
  NormalizedWeatherHourSchema,
  NormalizedWeatherNowSchema,
  WeatherLocationCandidateSchema,
  type NormalizedWeatherDay,
  type NormalizedWeatherHour,
  type NormalizedWeatherNow,
  type WeatherLanguage,
  type WeatherLocationCandidate,
  type WeatherProviderErrorCode,
  type WeatherUnit,
} from "@wardrobe/cloud-contracts";

type Clock = () => Date;
type Fetch = typeof fetch;
export interface ProviderResult<T> { data: T; updatedAt: string; sources: string[]; license: string[] }
export interface GeoResult { locations: WeatherLocationCandidate[]; sources: string[]; license: string[] }

export class QWeatherProviderError extends Error {
  constructor(public readonly code: WeatherProviderErrorCode, public readonly retryAfterSeconds?: number) {
    super(code);
    this.name = "QWeatherProviderError";
  }
}

interface TokenOptions {
  credentialId: string;
  projectId: string;
  privateKeyPem?: string;
  privateKeyFile?: string;
  clock?: Clock;
  ttlSeconds?: number;
  refreshBeforeSeconds?: number;
}

export class QWeatherTokenManager {
  private cached?: { token: string; expiresAtSeconds: number };
  private privateKey?: Promise<ReturnType<typeof createPrivateKey>>;
  private readonly clock: Clock;
  private readonly ttlSeconds: number;
  private readonly refreshBeforeSeconds: number;

  constructor(private readonly options: TokenOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.ttlSeconds = options.ttlSeconds ?? 900;
    this.refreshBeforeSeconds = options.refreshBeforeSeconds ?? 120;
    if (!options.credentialId || !options.projectId || (!options.privateKeyPem && !options.privateKeyFile)) throw new QWeatherProviderError("unconfigured");
    if (this.ttlSeconds <= this.refreshBeforeSeconds || this.ttlSeconds > 86_400) throw new QWeatherProviderError("unconfigured");
  }

  async getToken(): Promise<string> {
    const nowSeconds = Math.floor(this.clock().getTime() / 1000);
    if (this.cached && nowSeconds < this.cached.expiresAtSeconds - this.refreshBeforeSeconds) return this.cached.token;
    const header = encode({ alg: "EdDSA", kid: this.options.credentialId });
    const expiresAtSeconds = nowSeconds + this.ttlSeconds;
    const payload = encode({ sub: this.options.projectId, iat: nowSeconds - 30, exp: expiresAtSeconds });
    const signingInput = `${header}.${payload}`;
    const signature = sign(null, Buffer.from(signingInput), await this.getPrivateKey()).toString("base64url");
    const token = `${signingInput}.${signature}`;
    this.cached = { token, expiresAtSeconds };
    return token;
  }

  private getPrivateKey() {
    this.privateKey ??= (async () => {
      try {
        const pem = this.options.privateKeyPem ?? await readFile(this.options.privateKeyFile!, "utf8");
        return createPrivateKey(pem);
      } catch { throw new QWeatherProviderError("unconfigured"); }
    })();
    return this.privateKey;
  }
}

export interface QWeatherProviderOptions {
  enabled: boolean;
  apiHost: string;
  projectId: string;
  credentialId: string;
  privateKeyPem?: string;
  privateKeyFile?: string;
  timeoutMs?: number;
  fetchImpl?: Fetch;
  clock?: Clock;
}

export interface QWeatherProviderLike {
  searchLocations(query: string, signal?: AbortSignal): Promise<WeatherLocationCandidate[]>;
  getLocationById(locationId: string, signal?: AbortSignal): Promise<WeatherLocationCandidate>;
  resolveCoordinates(longitude: number, latitude: number, signal?: AbortSignal): Promise<WeatherLocationCandidate[]>;
  getNow(locationId: string, lang: WeatherLanguage, unit: WeatherUnit, signal?: AbortSignal): Promise<ProviderResult<NormalizedWeatherNow>>;
  getHourly(locationId: string, lang: WeatherLanguage, unit: WeatherUnit, signal?: AbortSignal): Promise<ProviderResult<NormalizedWeatherHour[]>>;
  getDaily(locationId: string, lang: WeatherLanguage, unit: WeatherUnit, signal?: AbortSignal): Promise<ProviderResult<NormalizedWeatherDay[]>>;
}

export class UnavailableQWeatherProvider implements QWeatherProviderLike {
  constructor(private readonly unavailableCode: "disabled" | "unconfigured" = "unconfigured") {}
  private fail(): never { throw new QWeatherProviderError(this.unavailableCode); }
  async searchLocations(): Promise<WeatherLocationCandidate[]> { return this.fail(); }
  async getLocationById(): Promise<WeatherLocationCandidate> { return this.fail(); }
  async resolveCoordinates(): Promise<WeatherLocationCandidate[]> { return this.fail(); }
  async getNow(): Promise<ProviderResult<NormalizedWeatherNow>> { return this.fail(); }
  async getHourly(): Promise<ProviderResult<NormalizedWeatherHour[]>> { return this.fail(); }
  async getDaily(): Promise<ProviderResult<NormalizedWeatherDay[]>> { return this.fail(); }
}

export class QWeatherProvider implements QWeatherProviderLike {
  private readonly host: URL;
  private readonly tokens: QWeatherTokenManager;
  private readonly timeoutMs: number;
  private readonly fetchImpl: Fetch;

  constructor(options: QWeatherProviderOptions) {
    if (!options.enabled) throw new QWeatherProviderError("disabled");
    this.host = validateDedicatedHost(options.apiHost);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30_000) throw new QWeatherProviderError("unconfigured");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokens = new QWeatherTokenManager({ credentialId: options.credentialId, projectId: options.projectId, privateKeyPem: options.privateKeyPem, privateKeyFile: options.privateKeyFile, clock: options.clock });
  }

  async searchLocations(query: string, signal?: AbortSignal) {
    return (await this.geo(query, signal)).locations;
  }
  async getLocationById(locationId: string, signal?: AbortSignal) {
    const matches = (await this.geo(locationId, signal)).locations.filter((item) => item.locationId === locationId);
    if (matches.length !== 1) throw new QWeatherProviderError("invalid_response");
    return matches[0]!;
  }
  async resolveCoordinates(longitude: number, latitude: number, signal?: AbortSignal) {
    const coordinate = `${longitude.toFixed(2)},${latitude.toFixed(2)}`;
    return (await this.geo(coordinate, signal)).locations;
  }
  async getNow(locationId: string, lang: WeatherLanguage, unit: WeatherUnit, signal?: AbortSignal) {
    return parseQWeatherNow(await this.request("/v7/weather/now", { location: locationId, lang, unit }, signal));
  }
  async getHourly(locationId: string, lang: WeatherLanguage, unit: WeatherUnit, signal?: AbortSignal) {
    return parseQWeatherHourly(await this.request("/v7/weather/72h", { location: locationId, lang, unit }, signal));
  }
  async getDaily(locationId: string, lang: WeatherLanguage, unit: WeatherUnit, signal?: AbortSignal) {
    return parseQWeatherDaily(await this.request("/v7/weather/7d", { location: locationId, lang, unit }, signal));
  }

  private async geo(location: string, signal?: AbortSignal) {
    return parseQWeatherGeo(await this.request("/geo/v2/city/lookup", { location, number: "10", lang: "zh" }, signal));
  }

  private async request(path: string, query: Record<string, string>, callerSignal?: AbortSignal): Promise<unknown> {
    const url = new URL(path, this.host);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${await this.tokens.getToken()}`, accept: "application/json", "accept-encoding": "gzip" },
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new QWeatherProviderError("auth_failed");
      if (response.status === 429) throw new QWeatherProviderError("rate_limited", parseRetryAfter(response.headers.get("retry-after")));
      if (response.status >= 500) throw new QWeatherProviderError("upstream_unavailable");
      if (!response.ok) throw new QWeatherProviderError("invalid_response");
      try { return await response.json(); } catch { throw new QWeatherProviderError("invalid_response"); }
    } catch (error) {
      if (error instanceof QWeatherProviderError) throw error;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new QWeatherProviderError("timeout");
      throw new QWeatherProviderError("upstream_unavailable");
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", onAbort);
    }
  }
}

const ReferSchema = z.object({ sources: z.array(z.string().trim().min(1).max(160)).max(16).nullable(), license: z.array(z.string().trim().min(1).max(160)).max(16).nullable() }).strict();
const UpstreamDateTimeSchema = z.string().datetime({ offset: true });
const GeoLocationSchema = z.object({ name: z.string().trim().min(1).max(120), id: z.string().trim().min(1).max(80), lat: z.string(), lon: z.string(), adm2: z.string().trim().max(80), adm1: z.string().trim().max(80), country: z.string().trim().max(80), tz: z.string(), utcOffset: z.string(), isDst: z.string(), type: z.string(), rank: z.string(), fxLink: z.string().url() }).strict();
const GeoSchema = z.object({ code: z.string(), location: z.array(GeoLocationSchema).max(20), refer: ReferSchema }).strict();

const NowItemSchema = z.object({ obsTime: UpstreamDateTimeSchema, temp: z.string(), feelsLike: z.string().nullable().optional(), icon: z.string(), text: z.string(), wind360: z.string().nullable().optional(), windDir: z.string().nullable().optional(), windScale: z.string().nullable().optional(), windSpeed: z.string().nullable().optional(), humidity: z.string().nullable().optional(), precip: z.string().nullable().optional(), pressure: z.string().nullable().optional(), vis: z.string().nullable().optional(), cloud: z.string().nullable().optional(), dew: z.string().nullable().optional() }).strict();
const NowSchema = z.object({ code: z.string(), updateTime: UpstreamDateTimeSchema, fxLink: z.string().url(), now: NowItemSchema, refer: ReferSchema }).strict();
const HourItemSchema = z.object({ fxTime: UpstreamDateTimeSchema, temp: z.string(), icon: z.string(), text: z.string(), wind360: z.string().nullable().optional(), windDir: z.string().nullable().optional(), windScale: z.string().nullable().optional(), windSpeed: z.string().nullable().optional(), humidity: z.string().nullable().optional(), pop: z.string().nullable().optional(), precip: z.string().nullable().optional(), pressure: z.string().nullable().optional(), cloud: z.string().nullable().optional(), dew: z.string().nullable().optional(), uvIndex: z.string().nullable().optional() }).strict();
const HourlySchema = z.object({ code: z.string(), updateTime: UpstreamDateTimeSchema, fxLink: z.string().url(), hourly: z.array(HourItemSchema).max(168), refer: ReferSchema }).strict();
const DayItemSchema = z.object({ fxDate: z.string(), sunrise: z.string().nullable(), sunset: z.string().nullable(), moonrise: z.string().nullable(), moonset: z.string().nullable(), moonPhase: z.string(), moonPhaseIcon: z.string(), tempMax: z.string(), tempMin: z.string(), iconDay: z.string(), textDay: z.string(), iconNight: z.string(), textNight: z.string(), wind360Day: z.string().nullable(), windDirDay: z.string().nullable(), windScaleDay: z.string().nullable(), windSpeedDay: z.string().nullable(), wind360Night: z.string().nullable(), windDirNight: z.string().nullable(), windScaleNight: z.string().nullable(), windSpeedNight: z.string().nullable(), humidity: z.string().nullable(), precip: z.string().nullable(), pressure: z.string().nullable(), vis: z.string().nullable(), cloud: z.string().nullable(), uvIndex: z.string().nullable() }).strict();
const DailySchema = z.object({ code: z.string(), updateTime: UpstreamDateTimeSchema, fxLink: z.string().url(), daily: z.array(DayItemSchema).max(30), refer: ReferSchema }).strict();

export function parseQWeatherGeo(input: unknown): GeoResult {
  try {
    const raw = GeoSchema.parse(input); assertSuccessCode(raw.code);
    return { locations: raw.location.map((item) => WeatherLocationCandidateSchema.parse({ locationId: item.id, displayName: item.name, timezone: item.tz, centroidLatitude: numeric(item.lat, -90, 90), centroidLongitude: numeric(item.lon, -180, 180), country: optionalText(item.country), adminArea: optionalText(item.adm1), parentCity: optionalText(item.adm2) })), ...attribution(raw.refer) };
  } catch (error) { throw normalizeParseError(error); }
}

export function parseQWeatherNow(input: unknown): ProviderResult<NormalizedWeatherNow> {
  try {
    const raw = NowSchema.parse(input); assertSuccessCode(raw.code); assertWeatherCode(raw.now.icon);
    return { data: NormalizedWeatherNowSchema.parse({ observedAt: raw.now.obsTime, temperatureC: numeric(raw.now.temp, -80, 80), feelsLikeC: optionalNumeric(raw.now.feelsLike, -100, 100), weatherCode: raw.now.icon, weatherText: raw.now.text, windDirectionDeg: optionalNumeric(raw.now.wind360, 0, 360), windScale: optionalText(raw.now.windScale), windSpeedKph: optionalNumeric(raw.now.windSpeed, 0, 500), humidity: optionalNumeric(raw.now.humidity, 0, 100), precipitationMm: optionalNumeric(raw.now.precip, 0, 2000), pressureHpa: optionalNumeric(raw.now.pressure, 500, 1200), visibilityKm: optionalNumeric(raw.now.vis, 0, 1000), cloudCover: optionalNumeric(raw.now.cloud, 0, 100) }), updatedAt: raw.updateTime, ...attribution(raw.refer) };
  } catch (error) { throw normalizeParseError(error); }
}

export function parseQWeatherHourly(input: unknown): ProviderResult<NormalizedWeatherHour[]> {
  try {
    const raw = HourlySchema.parse(input); assertSuccessCode(raw.code);
    const data = raw.hourly.map((item) => { assertWeatherCode(item.icon); return NormalizedWeatherHourSchema.parse({ time: item.fxTime, temperatureC: numeric(item.temp, -80, 80), weatherCode: item.icon, weatherText: item.text, rainProbability: optionalNumeric(item.pop, 0, 100), precipitationMm: optionalNumeric(item.precip, 0, 2000), humidity: optionalNumeric(item.humidity, 0, 100), windSpeedKph: optionalNumeric(item.windSpeed, 0, 500), windScale: optionalText(item.windScale), cloudCover: optionalNumeric(item.cloud, 0, 100) }); });
    return { data, updatedAt: raw.updateTime, ...attribution(raw.refer) };
  } catch (error) { throw normalizeParseError(error); }
}

export function parseQWeatherDaily(input: unknown): ProviderResult<NormalizedWeatherDay[]> {
  try {
    const raw = DailySchema.parse(input); assertSuccessCode(raw.code);
    const data = raw.daily.map((item) => { assertWeatherCode(item.iconDay); assertWeatherCode(item.iconNight); return NormalizedWeatherDaySchema.parse({ date: item.fxDate, temperatureMinC: numeric(item.tempMin, -80, 80), temperatureMaxC: numeric(item.tempMax, -80, 80), dayWeatherCode: item.iconDay, dayWeatherText: item.textDay, nightWeatherCode: item.iconNight, nightWeatherText: item.textNight, precipitationMm: optionalNumeric(item.precip, 0, 2000), humidity: optionalNumeric(item.humidity, 0, 100), uvIndex: optionalNumeric(item.uvIndex, 0, 30), cloudCover: optionalNumeric(item.cloud, 0, 100), sunrise: item.sunrise ?? undefined, sunset: item.sunset ?? undefined }); });
    return { data, updatedAt: raw.updateTime, ...attribution(raw.refer) };
  } catch (error) { throw normalizeParseError(error); }
}

function validateDedicatedHost(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new QWeatherProviderError("unconfigured"); }
  const forbidden = new Set(["devapi.qweather.com", "geoapi.qweather.com"]);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !url.hostname.endsWith(".qweatherapi.com") || forbidden.has(url.hostname)) throw new QWeatherProviderError("unconfigured");
  return url;
}
function encode(value: object) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function numeric(value: string, min: number, max: number) { if (!/^-?(?:\d+|\d+\.\d+)$/.test(value)) throw new QWeatherProviderError("invalid_response"); const number = Number(value); if (!Number.isFinite(number) || number < min || number > max) throw new QWeatherProviderError("invalid_response"); return number; }
function optionalNumeric(value: string | null | undefined, min: number, max: number) { return value === null || value === undefined || value === "" ? undefined : numeric(value, min, max); }
function optionalText(value: string | null | undefined) { const trimmed = value?.trim(); return trimmed ? trimmed : undefined; }
const KNOWN_WEATHER_CODES = new Set([
  100, 101, 102, 103, 104, 150, 151, 152, 153,
  300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 350, 351, 399,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 456, 457, 499,
  500, 501, 502, 503, 504, 507, 508, 509, 510, 511, 512, 513, 514, 515,
  900, 901,
]);
function assertWeatherCode(code: string) { if (!/^\d{3}$/.test(code) || !KNOWN_WEATHER_CODES.has(Number(code))) throw new QWeatherProviderError("invalid_response"); }
function assertSuccessCode(code: string) { if (code === "200") return; if (code === "401" || code === "403") throw new QWeatherProviderError("auth_failed"); if (code === "429") throw new QWeatherProviderError("rate_limited"); if (/^5\d\d$/.test(code)) throw new QWeatherProviderError("upstream_unavailable"); throw new QWeatherProviderError("invalid_response"); }
function attribution(refer: z.infer<typeof ReferSchema>) { return { sources: refer.sources ?? [], license: refer.license ?? [] }; }
function normalizeParseError(error: unknown) { return error instanceof QWeatherProviderError ? error : new QWeatherProviderError("invalid_response"); }
function parseRetryAfter(value: string | null) { if (!value) return 60; const seconds = Number(value); if (Number.isFinite(seconds)) return Math.min(300, Math.max(30, Math.ceil(seconds))); const date = Date.parse(value); if (!Number.isFinite(date)) return 60; return Math.min(300, Math.max(30, Math.ceil((date - Date.now()) / 1000))); }

type WeatherEnvironment = Record<string, string | undefined>;

export function qweatherOptionsFromEnv(env: WeatherEnvironment = process.env): QWeatherProviderOptions {
  const enabled = env.QWEATHER_ENABLED === "true";
  if (!enabled) throw new QWeatherProviderError("disabled");
  const apiHost = env.QWEATHER_API_HOST;
  const projectId = env.QWEATHER_PROJECT_ID;
  const credentialId = env.QWEATHER_CREDENTIAL_ID;
  const privateKeyFile = env.QWEATHER_PRIVATE_KEY_FILE;
  if (!apiHost || !projectId || !credentialId || !privateKeyFile) throw new QWeatherProviderError("unconfigured");
  return { enabled, apiHost, projectId, credentialId, privateKeyFile, timeoutMs: Number(env.QWEATHER_TIMEOUT_MS ?? 5000) };
}

export function createQWeatherProviderFromEnv(env: WeatherEnvironment = process.env): QWeatherProviderLike {
  try { return new QWeatherProvider(qweatherOptionsFromEnv(env)); }
  catch (error) { return new UnavailableQWeatherProvider(error instanceof QWeatherProviderError && error.code === "disabled" ? "disabled" : "unconfigured"); }
}
