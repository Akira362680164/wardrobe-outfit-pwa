import http from "node:http";
import { createHash } from "node:crypto";
import { WeatherOverviewSchema } from "@wardrobe/cloud-contracts";

const PORT = Number(process.env.HOME_FEED_FIXTURE_PORT ?? 4174);
const HOST = process.env.HOME_FEED_FIXTURE_HOST ?? "127.0.0.1";
const APP_ORIGIN = process.env.HOME_FEED_APP_ORIGIN ?? "http://127.0.0.1:4173";
const MUTATION_DELAY_MS = Number(process.env.HOME_FEED_MUTATION_DELAY_MS ?? 0);
const SCENARIO = process.env.HOME_FEED_FIXTURE_SCENARIO ?? "default";
const P13_FAILURE_DELAY_MS = Number(process.env.HOME_FEED_P13_FAILURE_DELAY_MS ?? 2200);

const city = { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai", centroidLatitude: 31.2304, centroidLongitude: 121.4737 };
const ANON_TOKEN = "browser-fixture-anon-token";
const GARMENT_IDS = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004", "10000000-0000-4000-8000-000000000005"];
const ASSET_IDS = ["11000000-0000-4000-8000-000000000001", "11000000-0000-4000-8000-000000000002", "11000000-0000-4000-8000-000000000003", "11000000-0000-4000-8000-000000000004", "11000000-0000-4000-8000-000000000005"];
const garmentVisuals = [
  ["#d8e1e2", "#738b91", "浅灰短袖"], ["#d8c8ac", "#9c805d", "卡其长裤"], ["#333b43", "#171b20", "黑色乐福鞋"], ["#b8cad6", "#66829a", "雾蓝衬衫"], ["#e5ddd0", "#a99d8b", "米色半裙"],
].map(([background, ink, label]) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><rect width="240" height="320" rx="24" fill="${background}"/><path d="M72 72l35-22h26l35 22 30 46-32 20-16-24v142H90V114l-16 24-32-20z" fill="${ink}" opacity=".9"/><text x="120" y="290" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#1d2228">${label}</text></svg>`);
const garmentAssetSha = garmentVisuals.map((value) => createHash("sha256").update(value).digest("hex"));
const requestTrace = [];
let traceSequence = 0;
let forcedProfileReadFailures = 0;
let p14Mode = "ready";
let partialWeatherFailuresRemaining = 0;
let weatherVisualCode = "304";

function makeDefaultState() {
  return {
    profile: { homeCity: null, revision: 0, updatedAt: null },
    overrideState: { override: null, revision: 0, updatedAt: null },
    p13: {
      clearHomeAttempts: 0,
      hasProfileLoadedAfterFailure: false,
    },
  };
}

const now = () => new Date().toISOString();
const businessDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const addDay = (date, count) => {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + count);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);
};

const tokenStates = new Map();

function getSessionState(token = ANON_TOKEN) {
  const existing = tokenStates.get(token);
  if (existing) return existing;
  const state = makeDefaultState();
  state.profile = { homeCity: null, revision: 1, updatedAt: now() };
  if (SCENARIO === "p13" || SCENARIO === "p14") {
    state.profile = { homeCity: city, revision: 4, updatedAt: now() };
  }
  tokenStates.set(token, state);
  return state;
}

function getToken(req) {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7);
  return ANON_TOKEN;
}

function send(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
  });
  response.end(JSON.stringify(data));
}

function record(request, status) {
  requestTrace.push({
    sequence: ++traceSequence,
    method: request.method ?? "UNKNOWN",
    path: new URL(request.url ?? "/", "http://fixture.invalid").pathname,
    status,
  });
}

function sendTraced(request, response, status, data) {
  record(request, status);
  send(response, status, data);
}

function sendMutation(request, response, data, delayMs = MUTATION_DELAY_MS) {
  if (delayMs > 0) {
    setTimeout(() => sendTraced(request, response, 200, data), delayMs);
  } else {
    sendTraced(request, response, 200, data);
  }
}

function sendP13Failure(request, response, status, data) {
  setTimeout(() => sendTraced(request, response, status, data), P13_FAILURE_DELAY_MS);
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});

  const url = new URL(request.url ?? "/", "http://fixture.invalid");
  const path = url.pathname;

  if (path === "/api/health" || path === "/api/ready") return send(response, 200, { status: "ok", fixture: SCENARIO });

  if (path === "/__fixture/trace" && request.method === "GET") {
    return send(response, 200, { scenario: SCENARIO, entries: requestTrace });
  }

  if (path === "/__fixture/control" && request.method === "POST") {
    const body = await readBody(request);
    if (SCENARIO === "p14" && body.action === "set-weather-code" && /^\d{3}$/.test(String(body.code))) {
      weatherVisualCode = String(body.code);
      return send(response, 200, { weatherVisualCode });
    }
    if (SCENARIO === "p14" && body.action === "set-p14-mode" && ["ready", "locationless", "fallback", "protected", "actual", "travel", "stale", "protected-plan-with-date-strip", "partial-weather-error"].includes(body.mode)) {
      p14Mode = body.mode;
      partialWeatherFailuresRemaining = body.mode === "partial-weather-error" ? 1 : 0;
      for (const state of tokenStates.values()) state.profile = { homeCity: body.mode === "locationless" || body.mode === "travel" ? null : city, revision: state.profile.revision + 1, updatedAt: now() };
      return send(response, 200, { mode: p14Mode });
    }
    if (body.action !== "fail-next-profile-get") {
      return send(response, 400, { error: "unsupported fixture control action" });
    }
    const count = Number.isInteger(body.count) && body.count > 0 && body.count <= 4 ? body.count : 1;
    forcedProfileReadFailures += count;
    return send(response, 200, { armed: "fail-next-profile-get", count: forcedProfileReadFailures });
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const body = await readBody(request);
    const account = typeof body.account === "string" ? body.account : "";
    const token = `browser-fixture-${account || "anon"}-${Math.floor(Math.random() * 1000000)}`;
    const state = getSessionState(token);
    if (SCENARIO === "p13" || SCENARIO === "p14") {
      state.profile = account.includes("222") ? { homeCity: null, revision: 0, updatedAt: now() } : { homeCity: city, revision: 4, updatedAt: now() };
      state.overrideState = { override: null, revision: 0, updatedAt: null };
      state.p13.clearHomeAttempts = 0;
      state.p13.hasProfileLoadedAfterFailure = false;
    }
    send(response, 200, {
      accessToken: token,
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "browser-fixture-refresh-token",
      refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
      user: {
        id: account.includes("222") ? "90000000-0000-4000-8000-000000000002" : "90000000-0000-4000-8000-000000000001",
        maskedPhone: "***0000",
        displayName: "浏览器验收账号",
      },
    });
    return;
  }

  const token = getToken(request);
  const state = getSessionState(token);

  if (path === "/api/workspace/overview") {
    if (SCENARIO === "p14" && p14Mode !== "locationless") {
      const names = ["浅灰通勤短袖", "卡其直筒长裤", "黑色乐福鞋", "雾蓝轻薄衬衫", "米色半裙"];
      const categories = ["tops", "pants", "shoes", "tops", "skirts"];
      const garments = GARMENT_IDS.map((id, index) => ({
        id, revision: 1, createdAt: now(), updatedAt: now(),
        payload: { legacyItemId: index + 1, locationId: "home", name: names[index], status: "active", category: categories[index], colors: { mode: "single", primary: "#808080" }, seasons: ["spring_autumn"], styles: ["commute"] },
        assetRefs: { imageDataUrl: { assetId: ASSET_IDS[index], variants: ["original", "thumbnail"], sha256: garmentAssetSha[index], mimeType: "image/svg+xml", width: 240, height: 320, variantSha256: { original: garmentAssetSha[index], thumbnail: garmentAssetSha[index] } } },
      }));
      const planMode = p14Mode === "protected" || p14Mode === "actual" || p14Mode === "protected-plan-with-date-strip";
      const blocked = p14Mode === "protected-plan-with-date-strip";
      const outfitPlans = planMode ? [{ id: "40000000-0000-4000-8000-000000000001", revision: 2, createdAt: now(), updatedAt: now(), payload: { date: businessDate(), status: p14Mode === "actual" ? "worn" : "planned", role: "primary", isPrimary: true, garmentIds: blocked ? ["10000000-0000-4000-8000-000000000099", ...GARMENT_IDS.slice(1, 3)] : GARMENT_IDS.slice(0, 3), garmentSnapshots: blocked ? [{ garmentId: "10000000-0000-4000-8000-000000000099", name: "已删除的旅行外套", role: "outerwear", category: "tops" }, { garmentId: GARMENT_IDS[1], name: "卡其直筒长裤", role: "bottoms", category: "pants" }, { garmentId: GARMENT_IDS[2], name: "黑色乐福鞋", role: "shoes", category: "shoes" }] : undefined, actualGarmentIds: p14Mode === "actual" ? GARMENT_IDS.slice(0, 3) : undefined, unavailableGarmentIds: blocked ? ["10000000-0000-4000-8000-000000000099"] : [], availability: blocked ? "blocked" : "available" } }] : [];
      return send(response, 200, { garments: p14Mode === "locationless" ? [] : garments, outfits: [], wishlistItems: [], locations: [], tripPlans: [], outfitPlans, wearEvents: [], profiles: [], serverRevision: 8, requestId: "home-feed-p14-fixture" });
    }
    return send(response, 200, {
      garments: [], outfits: [], wishlistItems: [], locations: [], tripPlans: [], outfitPlans: [], wearEvents: [], profiles: [],
      serverRevision: 1, requestId: "home-feed-browser-fixture",
    });
  }

  const assetMatch = path.match(/^\/api\/assets\/([^/]+)\/(original|thumbnail)\/content$/);
  if (SCENARIO === "p14" && assetMatch) {
    const index = ASSET_IDS.indexOf(assetMatch[1]);
    if (index < 0) return send(response, 404, { code: "not_found", message: "asset missing", retryable: false });
    response.writeHead(200, { "Content-Type": "image/svg+xml", "X-Asset-Sha256": garmentAssetSha[index], "Access-Control-Allow-Origin": APP_ORIGIN, "Access-Control-Expose-Headers": "X-Asset-Sha256" });
    response.end(garmentVisuals[index]);
    return;
  }

  if (path === "/api/settings/location-profile" && request.method === "GET") {
    if (SCENARIO === "p13" && forcedProfileReadFailures > 0) {
      forcedProfileReadFailures -= 1;
      return sendP13Failure(request, response, 503, {
        code: "network",
        message: "地点服务暂时不可用，请点击重试。",
        retryable: true,
      });
    }
    state.p13.hasProfileLoadedAfterFailure = true;
    return sendTraced(request, response, 200, state.profile);
  }

  if (path === "/api/settings/location-override" && request.method === "GET") {
    return send(response, 200, state.overrideState);
  }

  if (path === "/api/weather/locations/search") {
    return send(response, 200, { candidates: [city] });
  }

  if (path === "/api/weather/locations/resolve-device" && request.method === "POST") {
    return sendTraced(request, response, 200, { candidates: [city] });
  }

  if (path === "/api/settings/location-profile" && request.method === "PUT") {
    state.profile = {
      homeCity: city,
      revision: state.profile.revision + 1,
      updatedAt: now(),
    };
    return sendMutation(request, response, state.profile);
  }

  if (path === "/api/settings/location-profile" && request.method === "DELETE") {
    state.p13.clearHomeAttempts += 1;
    const attempt = state.p13.clearHomeAttempts;

    if (SCENARIO === "p13" && attempt === 1) {
      return sendP13Failure(request, response, 503, {
        code: "network",
        message: "网络暂时不可用，城市未清除，请重试。",
        retryable: true,
      });
    }

    if (SCENARIO === "p13" && attempt === 2) {
      return sendP13Failure(request, response, 409, {
        code: "conflict",
        message: "城市设置已在其他设备更新，请确认后重试。",
        retryable: true,
        details: { reasonCode: "out_of_date_revision" },
      });
    }

    if (!state.p13.hasProfileLoadedAfterFailure || state.profile.homeCity === null) {
      return sendMutation(request, response, { homeCity: null, revision: state.profile.revision, updatedAt: now() });
    }

    state.profile = { homeCity: null, revision: state.profile.revision + 1, updatedAt: now() };
    return sendMutation(request, response, state.profile);
  }

  if (path === "/api/settings/location-override" && request.method === "PUT") {
    const revision = state.overrideState.revision + 1;
    state.overrideState = {
      override: {
        id: "70000000-0000-4000-8000-000000000001",
        location: city,
        effectiveFrom: businessDate(),
        effectiveThrough: addDay(businessDate(), 1),
        source: "device_location",
        confirmedAt: now(),
        revision,
      },
      revision,
      updatedAt: now(),
    };
    return sendMutation(request, response, state.overrideState);
  }

  if (path === "/api/settings/location-override" && request.method === "DELETE") {
    state.overrideState = { override: null, revision: state.overrideState.revision + 1, updatedAt: now() };
    return sendMutation(request, response, state.overrideState);
  }

  if (path === "/api/weather/overview") {
    const targetDate = url.searchParams.get("date");
    const profile = state.profile;
    const today = businessDate();

    const travelMode = SCENARIO === "p14" && p14Mode === "travel";
    if (!profile.homeCity && !travelMode) {
      const overview = WeatherOverviewSchema.parse({
        targetDate,
        contextMode: "locationless",
        targetTimezone: "Asia/Shanghai",
        contextResolvedAt: now(),
        weatherEvidence: {
          weatherSource: "layering_default",
          weatherConfidence: 0,
          weatherUpdatedAt: now(),
          summary: "未设置城市，采用通用分层推荐",
        },
        endpointFreshness: [],
        availabilityReason: "locationless",
      });
      return sendTraced(request, response, 200, overview);
    }

    if (SCENARIO === "p14" && p14Mode === "partial-weather-error" && targetDate === addDay(today, 1) && partialWeatherFailuresRemaining > 0) {
      partialWeatherFailuresRemaining -= 1;
      return sendTraced(request, response, 503, { code: "provider_unavailable", message: "明日天气暂时不可用", retryable: true });
    }
    const fallback = SCENARIO === "p14" && p14Mode === "fallback";
    const stale = SCENARIO === "p14" && p14Mode === "stale";
    const resolvedCity = travelMode ? { ...city, locationId: "101010100", displayName: "北京" } : city;
    const overview = WeatherOverviewSchema.parse({
      targetDate,
      contextMode: fallback ? "weather_fallback" : "forecast",
      resolvedLocation: resolvedCity,
      locationSource: travelMode ? "travel" : state.overrideState.override ? "temporary_override" : "home_city",
      targetTimezone: "Asia/Shanghai",
      contextResolvedAt: now(),
      weatherEvidence: fallback ? {
        weatherSource: "layering_default",
        weatherConfidence: 0,
        weatherUpdatedAt: now(),
        summary: "天气暂不可用，采用通用分层推荐",
      } : {
        weatherSource: "forecast",
        weatherConfidence: 1,
        weatherUpdatedAt: now(),
        temperatureMinC: targetDate === today ? 24 : 22,
        temperatureMaxC: targetDate === today ? 32 : 30,
        currentTemperatureC: targetDate === today ? 31 : undefined,
        currentFeelsLikeC: targetDate === today ? 34 : undefined,
        windLevel: targetDate === today ? 3 : undefined,
        weatherCode: targetDate === today ? weatherVisualCode : undefined,
        dayWeatherCode: targetDate === today ? weatherVisualCode : "103",
        nightWeatherCode: targetDate === today ? "305" : "150",
        summary: targetDate === today ? "雷阵雨伴有冰雹，注意避险" : "云量变化，间有阳光",
      },
      endpointFreshness: stale ? [{ endpoint: targetDate === today ? "now" : "daily", freshness: "stale", providerUpdatedAt: "2026-07-18T00:00:00.000Z", fetchedAt: "2026-07-18T00:05:00.000Z", expiresAt: "2026-07-18T00:35:00.000Z", staleUntil: "2099-01-01T00:00:00.000Z" }] : [],
      availabilityReason: fallback ? "provider_unavailable" : "available",
      ...(fallback ? {} : { attribution: { label: "天气服务由 QWeather 提供", url: "https://www.qweather.com", sources: ["browser fixture"], license: ["test"] } }),
    });
    return sendTraced(request, response, 200, overview);
  }

  if (path === "/api/recommendations" && request.method === "GET") {
    if (SCENARIO === "p14" && p14Mode === "locationless") return send(response, 200, { timezone: "Asia/Shanghai", pairConsistent: false, items: [] });
    if (SCENARIO === "p14" && p14Mode !== "locationless") {
      const start = url.searchParams.get("startDate") ?? businessDate();
      const end = url.searchParams.get("endDate") ?? start;
      const dates = start === end ? [start] : [start, end];
      const objectives = ["safe", "fresh", "comfort"];
      const candidates = objectives.map((objective, index) => ({ candidateId: `30000000-0000-4000-8000-00000000000${index + 1}`, objective, garmentIds: index === 1 ? [GARMENT_IDS[3], GARMENT_IDS[4], GARMENT_IDS[2]] : [GARMENT_IDS[0], GARMENT_IDS[1], GARMENT_IDS[2]], source: "generated", reasonCodes: [index === 1 ? "new_combination" : index === 2 ? "activity_comfort" : "rain_ready"], riskCodes: [index === 0 ? "outerwear_recommended" : index === 1 ? "evening_layer_recommended" : "wind_rain_exposure"], finalScore: 90 - index }));
      const contextMode = p14Mode === "locationless" ? "locationless" : p14Mode === "fallback" ? "weather_fallback" : "forecast";
      const located = contextMode !== "locationless";
      const hasForecast = contextMode === "forecast";
      const travel = p14Mode === "travel";
      const stale = p14Mode === "stale";
      const resolvedCity = travel ? { ...city, locationId: "101010100", displayName: "北京" } : city;
      return send(response, 200, { timezone: "Asia/Shanghai", pairConsistent: dates.length === 2, items: dates.map((targetDate) => ({ recommendationId: targetDate === businessDate() ? "20000000-0000-4000-8000-000000000001" : "20000000-0000-4000-8000-000000000002", recommendationRevision: 1, inputFingerprint: "a".repeat(64), targetDate, generationBatchId: "21000000-0000-4000-8000-000000000001", readiness: "ready", generationMode: "rule_only", generatedAt: now(), expiresAt: "2099-01-01T00:00:00.000Z", weatherEvidence: hasForecast ? { weatherSource: "forecast", weatherConfidence: 1, weatherUpdatedAt: stale ? "2026-07-18T00:00:00.000Z" : now(), temperatureMinC: 22, temperatureMaxC: 32, rainProbability: 70, windLevel: 3, weatherCode: "304", summary: "雷阵雨" } : { weatherSource: "layering_default", weatherConfidence: 0, weatherUpdatedAt: now(), summary: "通用分层推荐" }, recommendations: candidates, contextMode, targetTimezone: "Asia/Shanghai", contextResolvedAt: now(), ...(located ? { resolvedLocation: resolvedCity, locationSource: travel ? "travel" : "home_city" } : {}), algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1", availabilityReason: contextMode === "locationless" ? "locationless" : contextMode === "weather_fallback" ? "provider_unavailable" : "available", endpointFreshness: stale ? [{ endpoint: "daily", freshness: "stale", providerUpdatedAt: "2026-07-18T00:00:00.000Z", fetchedAt: "2026-07-18T00:05:00.000Z", expiresAt: "2026-07-18T00:35:00.000Z", staleUntil: "2099-01-01T00:00:00.000Z" }] : [], ...(hasForecast ? { attribution: { label: "天气服务由 QWeather 提供", url: "https://www.qweather.com", sources: ["browser fixture"], license: ["test"] } } : {}) })) });
    }
    return send(response, 404, { code: "not_found", message: "fixture has no current recommendation", retryable: false });
  }

  if (path === "/api/recommendations/resolve" && request.method === "POST") {
    let dates = [];
    try {
      const body = await readBody(request);
      dates = body.dates ?? [];
    } catch {
      dates = [];
    }
    return send(response, 200, {
      timezone: "Asia/Shanghai",
      results: dates.map((targetDate) => ({ targetDate, status: "not_ready" })),
    });
  }

  return send(response, 404, { code: "not_found", message: "fixture route missing", retryable: false });
}).listen(PORT, HOST, () => {
  console.log(`home feed browser fixture: http://${HOST}:${PORT}`);
});
