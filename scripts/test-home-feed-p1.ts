import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WeatherOverview } from "@wardrobe/cloud-contracts";
import {
  HomeRequestGate,
  buildHomeFeedViewModel,
  homeBusinessWindow,
  type HomeFeedInput,
} from "../src/lib/home/home-feed-model";

const date = "2026-07-17";
const location = { kind: "home_city" as const, displayName: "上海", revision: 2 };
const readyGarments = [
  { id: "10000000-0000-4000-8000-000000000001", name: "衬衫", category: "tops", status: "active", hasImage: true },
  { id: "10000000-0000-4000-8000-000000000002", name: "长裤", category: "pants", status: "active", hasImage: true },
  { id: "10000000-0000-4000-8000-000000000003", name: "乐福鞋", category: "shoes", status: "active", hasImage: true },
] as const;
const forecast: WeatherOverview = {
  targetDate: date,
  contextMode: "forecast",
  resolvedLocation: { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" },
  locationSource: "home_city",
  targetTimezone: "Asia/Shanghai",
  contextResolvedAt: "2026-07-17T00:00:00.000Z",
  weatherEvidence: {
    weatherSource: "forecast", weatherConfidence: 1, weatherUpdatedAt: "2026-07-17T00:00:00.000Z",
    currentTemperatureC: 30, currentFeelsLikeC: 32, weatherCode: "101", dayWeatherCode: "101", nightWeatherCode: "150", summary: "多云",
  },
  endpointFreshness: [], availabilityReason: "available",
};
const recommendation = {
  status: "reused" as const,
  recommendation: {
    recommendationId: "20000000-0000-4000-8000-000000000001",
    recommendationRevision: 3,
    targetDate: date,
    contextMode: "forecast" as const,
    recommendations: [{
      candidateId: "30000000-0000-4000-8000-000000000001",
      objective: "safe" as const,
      garmentIds: readyGarments.map((item) => item.id),
      reasonCodes: ["template_complete"], riskCodes: [], finalScore: 88,
    }],
  },
};

function input(overrides: Partial<HomeFeedInput> = {}): HomeFeedInput {
  return {
    businessDate: date,
    selectedDate: date,
    workspace: { status: "ready", revision: 8 },
    garments: [],
    location: { kind: "none", revision: 0 },
    weather: { status: "idle" },
    recommendation: { status: "idle" },
    plans: [],
    ...overrides,
  };
}

const normalStates = [
  [input(), "home-empty-locationless"],
  [input({ location, weather: { status: "ready", data: forecast } }), "home-empty-forecast"],
  [input({ garments: [...readyGarments], recommendation: { status: "ready", data: { ...recommendation, recommendation: { ...recommendation.recommendation, contextMode: "locationless" } } } }), "home-ready-locationless"],
  [input({ garments: [...readyGarments], location, weather: { status: "ready", data: forecast }, recommendation: { status: "ready", data: recommendation } }), "home-ready-forecast"],
] as const;
for (const [fixture, expected] of normalStates) assert.equal(buildHomeFeedViewModel(fixture).normalState, expected);

const workspaceError = buildHomeFeedViewModel(input({ workspace: { status: "error", message: "工作区读取失败" } }));
assert.equal(workspaceError.workspace.status, "error");
assert.equal(workspaceError.normalState, null);

const independentErrors = buildHomeFeedViewModel(input({
  garments: [...readyGarments], location,
  weather: { status: "error", message: "天气失败" },
  recommendation: { status: "error", message: "推荐失败" },
}));
assert.equal(independentErrors.weather.status, "error");
assert.equal(independentErrors.recommendation.status, "error");

const protectedPlan = buildHomeFeedViewModel(input({
  garments: [...readyGarments], location,
  recommendation: { status: "ready", data: { status: "protected_plan", protectedPlanEntryId: "40000000-0000-4000-8000-000000000001" } },
  plans: [{ id: "40000000-0000-4000-8000-000000000001", date, status: "planned", role: "primary", revision: 4, garmentIds: readyGarments.map((item) => item.id) }],
}));
assert.equal(protectedPlan.plan?.kind, "protected_plan");
assert.equal(protectedPlan.recommendation.status, "protected");

const actualWear = buildHomeFeedViewModel(input({
  garments: [...readyGarments], location,
  recommendation: { status: "ready", data: { status: "actual_wear", protectedPlanEntryId: "40000000-0000-4000-8000-000000000001" } },
  plans: [{ id: "40000000-0000-4000-8000-000000000001", date, status: "worn", role: "primary", revision: 5, garmentIds: readyGarments.map((item) => item.id) }],
}));
assert.equal(actualWear.plan?.kind, "actual_wear");

const partialWeather = buildHomeFeedViewModel(input({
  garments: [...readyGarments], location,
  weather: { status: "ready", data: { ...forecast, weatherEvidence: { ...forecast.weatherEvidence, dayWeatherCode: undefined, nightWeatherCode: undefined } } },
}));
assert.equal(partialWeather.weather.status, "ready");
assert.equal(partialWeather.weather.temperatureC, 30);
assert.equal(partialWeather.weather.visual?.code, "101");

const unknownWeather = buildHomeFeedViewModel(input({
  garments: [...readyGarments], location,
  weather: { status: "ready", data: { ...forecast, weatherEvidence: { ...forecast.weatherEvidence, weatherCode: "916" } } },
}));
assert.equal(unknownWeather.weather.visual?.static, true);
assert.equal(unknownWeather.weather.visual?.family, "unknown");

const locationlessWeather = buildHomeFeedViewModel(input({
  garments: [...readyGarments],
  weather: { status: "ready", data: { ...forecast, contextMode: "locationless", availabilityReason: "locationless" } },
}));
assert.equal(locationlessWeather.weather.status, "ready");
assert.equal(locationlessWeather.weather.status === "ready" ? locationlessWeather.weather.temperatureC : -1, undefined);

const tomorrowWeather = buildHomeFeedViewModel(input({
  businessDate: date,
  selectedDate: "2026-07-18",
  garments: [...readyGarments], location,
  weather: { status: "ready", data: { ...forecast, targetDate: "2026-07-18", weatherEvidence: { ...forecast.weatherEvidence, weatherCode: "101", dayWeatherCode: "305", currentTemperatureC: 35 } } },
}));
assert.equal(tomorrowWeather.weather.status === "ready" ? tomorrowWeather.weather.temperatureC : -1, undefined);
assert.equal(tomorrowWeather.weather.status === "ready" ? tomorrowWeather.weather.visual?.code : null, "305");

const gate = new HomeRequestGate();
const first = gate.begin("account-a", date);
const second = gate.begin("account-a", "2026-07-18");
assert.equal(first.signal.aborted, true);
assert.equal(gate.isCurrent(first), false);
assert.equal(gate.isCurrent(second), true);
const third = gate.begin("account-b", "2026-07-18");
assert.equal(second.signal.aborted, true);
assert.equal(gate.isCurrent(second), false);
assert.equal(gate.isCurrent(third), true);
gate.cancel();
assert.equal(third.signal.aborted, true);

assert.deepEqual(homeBusinessWindow(new Date("2026-07-16T15:59:59.999Z")), { today: "2026-07-16", tomorrow: "2026-07-17" });
assert.deepEqual(homeBusinessWindow(new Date("2026-07-16T16:00:00.000Z")), { today: "2026-07-17", tomorrow: "2026-07-18" });

const root = join(import.meta.dirname, "..");
const controllerSource = readFileSync(join(root, "src/components/home/use-home-feed-controller.ts"), "utf8");
const clientSource = readFileSync(join(root, "src/lib/online/online-home-client.ts"), "utf8");
const pageSource = readFileSync(join(root, "src/components/home/wardora-home-view.tsx"), "utf8");
assert.match(controllerSource, /readHomeRecommendations[\s\S]*resolveHomeRecommendations/, "current read must precede resolve");
assert.match(controllerSource, /loadHomeWeatherDates\(\s*missingDates/, "today and tomorrow weather must settle independently");
assert.match(controllerSource, /useLayoutEffect[\s\S]*setLocationSnapshot\(null\)/, "account changes must clear previous account data before paint");
assert.match(clientSource, /await onlineRequest[\s\S]*return readHomeLocation\(session, signal\)/, "city mutations must commit then read back");
assert.doesNotMatch(controllerSource + clientSource, /localStorage|indexedDB|Outbox|optimistic/i, "home feed must not add local business persistence");
assert.doesNotMatch(pageSource, /设为今日穿搭|替换计划|取消计划|确认已穿/, "P1 recommendation card must remain read-only");
assert.doesNotMatch(pageSource, /navigator\.geolocation|getCurrentPosition|watchPosition|<canvas/i, "P1 must not request location or add Canvas runtime");

console.log("home feed P1 fixtures: passed");
