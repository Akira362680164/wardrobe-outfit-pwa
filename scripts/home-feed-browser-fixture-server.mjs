import http from "node:http";

const PORT = Number(process.env.HOME_FEED_FIXTURE_PORT ?? 4174);
const HOST = process.env.HOME_FEED_FIXTURE_HOST ?? "127.0.0.1";
const APP_ORIGIN = process.env.HOME_FEED_APP_ORIGIN ?? "http://127.0.0.1:4173";
const city = { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" };
let profile = { homeCity: null, revision: 0, updatedAt: null };
let overrideState = { override: null, revision: 0, updatedAt: null };

const now = () => new Date().toISOString();
const businessDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const addDay = (date, count) => {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + count);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(value);
};

function send(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,DELETE,OPTIONS",
  });
  response.end(JSON.stringify(data));
}

http.createServer((request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const url = new URL(request.url ?? "/", "http://fixture.invalid");
    const path = url.pathname;
    if (path === "/api/auth/login" && request.method === "POST") {
      let account = "";
      try { account = JSON.parse(body).account ?? ""; } catch { /* malformed login stays on fixture account A */ }
      return send(response, 200, {
      accessToken: "browser-fixture-access-token",
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshToken: "browser-fixture-refresh-token",
      refreshTokenExpiresAt: "2099-02-01T00:00:00.000Z",
      user: { id: account.includes("222") ? "90000000-0000-4000-8000-000000000002" : "90000000-0000-4000-8000-000000000001", maskedPhone: "***0000", displayName: "浏览器验收账号" },
    });
    }
    if (path === "/api/workspace/overview") return send(response, 200, {
      garments: [], outfits: [], wishlistItems: [], locations: [], tripPlans: [], outfitPlans: [], wearEvents: [], profiles: [],
      serverRevision: 1, requestId: "home-feed-browser-fixture",
    });
    if (path === "/api/settings/location-profile" && request.method === "GET") return send(response, 200, profile);
    if (path === "/api/settings/location-override" && request.method === "GET") return send(response, 200, overrideState);
    if (path === "/api/weather/locations/search") return send(response, 200, { candidates: [city] });
    if (path === "/api/settings/location-profile" && request.method === "PUT") {
      profile = { homeCity: city, revision: profile.revision + 1, updatedAt: now() };
      return send(response, 200, profile);
    }
    if (path === "/api/settings/location-profile" && request.method === "DELETE") {
      profile = { homeCity: null, revision: profile.revision + 1, updatedAt: now() };
      return send(response, 200, profile);
    }
    if (path === "/api/settings/location-override" && request.method === "PUT") {
      const revision = overrideState.revision + 1;
      overrideState = {
        override: {
          id: "70000000-0000-4000-8000-000000000001", location: city,
          effectiveFrom: businessDate(), effectiveThrough: addDay(businessDate(), 1),
          source: "device_location", confirmedAt: now(), revision,
        },
        revision, updatedAt: now(),
      };
      return send(response, 200, overrideState);
    }
    if (path === "/api/settings/location-override" && request.method === "DELETE") {
      overrideState = { override: null, revision: overrideState.revision + 1, updatedAt: now() };
      return send(response, 200, overrideState);
    }
    if (path === "/api/weather/overview") {
      const targetDate = url.searchParams.get("date");
      if (!profile.homeCity && !overrideState.override) return send(response, 200, {
        targetDate, contextMode: "locationless", targetTimezone: "Asia/Shanghai", contextResolvedAt: now(),
        weatherEvidence: { weatherSource: "layering_default", weatherConfidence: 0, weatherUpdatedAt: now(), summary: "未设置城市" },
        endpointFreshness: [], availabilityReason: "locationless",
      });
      const today = businessDate();
      return send(response, 200, {
        targetDate, contextMode: "forecast", resolvedLocation: city,
        locationSource: overrideState.override ? "temporary_override" : "home_city",
        targetTimezone: "Asia/Shanghai", contextResolvedAt: now(),
        weatherEvidence: {
          weatherSource: "forecast", weatherConfidence: 1, weatherUpdatedAt: now(),
          temperatureMinC: 24, temperatureMaxC: 32,
          ...(targetDate === today ? { currentTemperatureC: 29, currentFeelsLikeC: 31, weatherCode: "101" } : {}),
          dayWeatherCode: "101", nightWeatherCode: "150", summary: "多云",
        },
        endpointFreshness: [], availabilityReason: "available",
        attribution: { label: "天气服务由 QWeather 提供", url: "https://www.qweather.com", sources: ["browser fixture"], license: ["test"] },
      });
    }
    if (path === "/api/recommendations" && request.method === "GET") return send(response, 404, { code: "not_found", message: "fixture has no current recommendation", retryable: false });
    if (path === "/api/recommendations/resolve" && request.method === "POST") {
      let dates = [];
      try { dates = JSON.parse(body).dates ?? []; } catch { /* invalid payload handled as empty */ }
      return send(response, 200, { timezone: "Asia/Shanghai", results: dates.map((targetDate) => ({ targetDate, status: "not_ready" })) });
    }
    return send(response, 404, { code: "not_found", message: "fixture route missing", retryable: false });
  });
}).listen(PORT, HOST, () => {
  console.log(`home feed browser fixture: http://${HOST}:${PORT}`);
});
