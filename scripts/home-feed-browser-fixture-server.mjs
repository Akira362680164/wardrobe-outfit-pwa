import http from "node:http";
import { WeatherOverviewSchema } from "@wardrobe/cloud-contracts";

const PORT = Number(process.env.HOME_FEED_FIXTURE_PORT ?? 4174);
const HOST = process.env.HOME_FEED_FIXTURE_HOST ?? "127.0.0.1";
const APP_ORIGIN = process.env.HOME_FEED_APP_ORIGIN ?? "http://127.0.0.1:4173";
const MUTATION_DELAY_MS = Number(process.env.HOME_FEED_MUTATION_DELAY_MS ?? 0);
const SCENARIO = process.env.HOME_FEED_FIXTURE_SCENARIO ?? "default";
const P13_FAILURE_DELAY_MS = Number(process.env.HOME_FEED_P13_FAILURE_DELAY_MS ?? 2200);

const city = { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai", centroidLatitude: 31.2304, centroidLongitude: 121.4737 };
const ANON_TOKEN = "browser-fixture-anon-token";
const requestTrace = [];
let traceSequence = 0;
let forcedProfileReadFailures = 0;

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
  if (SCENARIO === "p13") {
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

  if (path === "/__fixture/trace" && request.method === "GET") {
    return send(response, 200, { scenario: SCENARIO, entries: requestTrace });
  }

  if (path === "/__fixture/control" && request.method === "POST") {
    const body = await readBody(request);
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
    if (SCENARIO === "p13") {
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
    return send(response, 200, {
      garments: [], outfits: [], wishlistItems: [], locations: [], tripPlans: [], outfitPlans: [], wearEvents: [], profiles: [],
      serverRevision: 1, requestId: "home-feed-browser-fixture",
    });
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

    if (!profile.homeCity) {
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

    const overview = WeatherOverviewSchema.parse({
      targetDate,
      contextMode: "forecast",
      resolvedLocation: city,
      locationSource: state.overrideState.override ? "temporary_override" : "home_city",
      targetTimezone: "Asia/Shanghai",
      contextResolvedAt: now(),
      weatherEvidence: {
        weatherSource: "forecast",
        weatherConfidence: 1,
        weatherUpdatedAt: now(),
        temperatureMinC: 24,
        temperatureMaxC: 32,
        weatherCode: "101",
        summary: "多云",
      },
      endpointFreshness: [],
      availabilityReason: "available",
      attribution: { label: "天气服务由 QWeather 提供", url: "https://www.qweather.com", sources: ["browser fixture"], license: ["test"] },
    });
    return sendTraced(request, response, 200, overview);
  }

  if (path === "/api/recommendations" && request.method === "GET") {
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
