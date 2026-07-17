import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createQWeatherProviderFromEnv, QWeatherProvider, QWeatherProviderError, QWeatherTokenManager, UnavailableQWeatherProvider, parseQWeatherDaily, parseQWeatherGeo, parseQWeatherHourly, parseQWeatherNow } from "../src/weather/qweather-provider.js";
import { DAILY_SUCCESS, GEO_SUCCESS, HOURLY_SUCCESS, NOW_SUCCESS } from "./fixtures/weather/qweather.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

describe("QWeather Ed25519 JWT", () => {
  it("uses only alg/kid and sub/iat/exp and verifies Ed25519", async () => {
    const clock = () => new Date("2026-07-14T12:00:30.000Z");
    const tokens = new QWeatherTokenManager({ credentialId: "credential-1", projectId: "project-1", privateKeyPem, clock, ttlSeconds: 900, refreshBeforeSeconds: 120 });
    const token = await tokens.getToken();
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "EdDSA", kid: "credential-1" });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({ sub: "project-1", iat: 1784030400, exp: 1784031330 });
    expect((await import("node:crypto")).verify(null, Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
  });

  it("caches before the boundary and rotates early", async () => {
    let now = new Date("2026-07-14T12:00:00.000Z");
    const tokens = new QWeatherTokenManager({ credentialId: "credential-1", projectId: "project-1", privateKeyPem, clock: () => now, ttlSeconds: 900, refreshBeforeSeconds: 120 });
    const first = await tokens.getToken();
    now = new Date("2026-07-14T12:12:59.000Z"); expect(await tokens.getToken()).toBe(first);
    now = new Date("2026-07-14T12:13:00.000Z"); expect(await tokens.getToken()).not.toBe(first);
  });
});

describe("QWeather strict upstream parsing", () => {
  it("parses fuzzy GeoAPI and authoritative LocationID data", () => expect(parseQWeatherGeo(GEO_SUCCESS).locations[0]).toMatchObject({ locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" }));
  it("parses now, 72h and 7d normalized DTOs", () => {
    expect(parseQWeatherNow(NOW_SUCCESS).data.temperatureC).toBe(31);
    expect(parseQWeatherHourly(HOURLY_SUCCESS).data).toHaveLength(2);
    expect(parseQWeatherDaily(DAILY_SUCCESS).data).toHaveLength(2);
    expect(parseQWeatherDaily(DAILY_SUCCESS).data[1]).toMatchObject({ sunrise: undefined, sunset: undefined });
  });
  it("keeps official 999 and future three-digit codes as neutral downstream evidence", () => {
    expect(parseQWeatherNow({ ...NOW_SUCCESS, now: { ...NOW_SUCCESS.now, icon: "999" } }).data.weatherCode).toBe("999");
    expect(parseQWeatherNow({ ...NOW_SUCCESS, now: { ...NOW_SUCCESS.now, icon: "916" } }).data.weatherCode).toBe("916");
  });
  it.each([
    ["malformed weather code", { ...NOW_SUCCESS, now: { ...NOW_SUCCESS.now, icon: "future" } }],
    ["empty required value", { ...NOW_SUCCESS, now: { ...NOW_SUCCESS.now, text: "" } }],
    ["illegal numeric string", { ...NOW_SUCCESS, now: { ...NOW_SUCCESS.now, temp: "31C" } }],
    ["malformed shape", { code: "200", now: [] }],
  ])("rejects %s", (_name, body) => expect(() => parseQWeatherNow(body)).toThrow(QWeatherProviderError));
});

describe("QWeather transport and controlled errors", () => {
  it("fails closed without production config and never falls back to a fixture", async () => {
    const disabled = createQWeatherProviderFromEnv({ QWEATHER_ENABLED: "false" });
    const unconfigured = createQWeatherProviderFromEnv({ QWEATHER_ENABLED: "true" });
    expect(disabled).toBeInstanceOf(UnavailableQWeatherProvider); expect(unconfigured).toBeInstanceOf(UnavailableQWeatherProvider);
    await expect(disabled.searchLocations("上海")).rejects.toMatchObject({ code: "disabled" });
    await expect(unconfigured.searchLocations("上海")).rejects.toMatchObject({ code: "unconfigured" });
    const missingFile = new QWeatherProvider({ enabled: true, apiHost: "https://dedicated.qweatherapi.com", projectId: "p", credentialId: "c", privateKeyFile: "/definitely/missing/qweather.pem", fetchImpl: vi.fn() });
    await expect(missingFile.searchLocations("上海")).rejects.toMatchObject({ code: "unconfigured" });
  });
  it.each([[401, "auth_failed"], [403, "auth_failed"], [429, "rate_limited"], [500, "upstream_unavailable"]] as const)("maps HTTP %s", async (status, code) => {
    const provider = new QWeatherProvider({ enabled: true, apiHost: "https://dedicated.qweatherapi.com", projectId: "p", credentialId: "c", privateKeyPem, fetchImpl: vi.fn(async () => new Response("{}", { status })) });
    await expect(provider.getNow("101020100", "zh", "m")).rejects.toMatchObject({ code });
  });
  it("maps timeout and malformed JSON without leaking secrets", async () => {
    const timeoutFetch: typeof fetch = vi.fn(async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    const timeout = new QWeatherProvider({ enabled: true, apiHost: "https://dedicated.qweatherapi.com", projectId: "p", credentialId: "c", privateKeyPem, timeoutMs: 1, fetchImpl: timeoutFetch });
    await expect(timeout.getNow("101020100", "zh", "m")).rejects.toMatchObject({ code: "timeout" });
    const malformed = new QWeatherProvider({ enabled: true, apiHost: "https://dedicated.qweatherapi.com", projectId: "p", credentialId: "c", privateKeyPem, fetchImpl: vi.fn(async () => new Response("not-json", { status: 200 })) });
    await expect(malformed.getNow("101020100", "zh", "m")).rejects.toMatchObject({ code: "invalid_response" });
    await expect(malformed.getNow("101020100", "zh", "m")).rejects.not.toThrow(privateKeyPem);
  });
  it.each(["http://dedicated.qweatherapi.com", "https://devapi.qweather.com", "https://geoapi.qweather.com", "https://dedicated.qweatherapi.com/path"])("rejects unsafe host %s", (apiHost) => expect(() => new QWeatherProvider({ enabled: true, apiHost, projectId: "p", credentialId: "c", privateKeyPem })).toThrow());
});
