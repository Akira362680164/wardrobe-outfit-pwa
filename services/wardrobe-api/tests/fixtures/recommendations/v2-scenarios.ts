import type {
  RecommendationEngineInputV2,
  RecommendationGarment,
  ResolvedRecommendationContext,
} from "@wardrobe/cloud-contracts";

import { buildFixtureGarment, buildFixtureInput, IDS } from "./scenarios.js";

export const CONTEXT_RESOLVED_AT = "2026-07-14T00:30:00.000Z";
export const LOCATIONLESS_SUMMARY = "未设置城市，采用通用分层推荐";
export const WEATHER_FALLBACK_SUMMARY = "天气暂不可用，采用通用分层推荐";

export function locationlessContext(targetDate = "2026-07-14"): ResolvedRecommendationContext {
  return {
    targetDate,
    targetTimezone: "Asia/Shanghai",
    contextResolvedAt: CONTEXT_RESOLVED_AT,
    contextMode: "locationless",
  };
}

export function fallbackContext(targetDate = "2026-07-14"): ResolvedRecommendationContext {
  return {
    targetDate,
    targetTimezone: "Asia/Shanghai",
    contextResolvedAt: CONTEXT_RESOLVED_AT,
    contextMode: "weather_fallback",
    resolvedLocation: {
      locationId: "101020100",
      displayName: "上海",
      timezone: "Asia/Shanghai",
    },
    locationSource: "home_city",
  };
}

export function forecastContext(targetDate = "2026-07-14"): ResolvedRecommendationContext {
  return {
    targetDate,
    targetTimezone: "Asia/Shanghai",
    contextResolvedAt: CONTEXT_RESOLVED_AT,
    contextMode: "forecast",
    resolvedLocation: {
      locationId: "101020100",
      displayName: "上海",
      timezone: "Asia/Shanghai",
    },
    locationSource: "home_city",
  };
}

export function buildLocationlessInput(
  overrides: Partial<RecommendationEngineInputV2> = {},
): RecommendationEngineInputV2 {
  const base = buildFixtureInput();
  return {
    ...base,
    ruleVersion: "wardora-rules-locationless-1",
    resolvedContext: locationlessContext(),
    dateContextInput: {
      ...base.dateContextInput,
      timezone: "Asia/Shanghai",
      weatherEvidence: {
        weatherSource: "layering_default",
        weatherConfidence: 0,
        weatherUpdatedAt: CONTEXT_RESOLVED_AT,
        summary: LOCATIONLESS_SUMMARY,
      },
    },
    pawCandidateEvaluatorEnabled: false,
    ...overrides,
  };
}

export function buildFallbackInput(): RecommendationEngineInputV2 {
  const input = buildLocationlessInput();
  return {
    ...input,
    resolvedContext: fallbackContext(),
    dateContextInput: {
      ...input.dateContextInput,
      weatherEvidence: {
        weatherSource: "layering_default",
        weatherConfidence: 0,
        weatherUpdatedAt: CONTEXT_RESOLVED_AT,
        summary: WEATHER_FALLBACK_SUMMARY,
      },
    },
  };
}

export function buildForecastInput(): RecommendationEngineInputV2 {
  const base = buildFixtureInput();
  return {
    ...base,
    ruleVersion: "wardora-rules-1a",
    resolvedContext: forecastContext(),
  };
}

const vectorGarment = (
  id: string,
  category: RecommendationGarment["category"],
  overrides: Partial<RecommendationGarment>,
) => buildFixtureGarment(id, category, overrides);

export const itemAdaptabilityVectors = [
  {
    id: "explicit-wide-balanced",
    garment: vectorGarment("91000000-0000-4000-8000-000000000001", "tops", {
      temperatureMinC: 10, temperatureMaxC: 30, warmth: 3, seasons: ["all"],
    }),
    expected: 100,
  },
  {
    id: "warmth-derived-two-seasons",
    garment: vectorGarment("91000000-0000-4000-8000-000000000002", "tops", {
      temperatureMinC: undefined, temperatureMaxC: undefined, warmth: 2, seasons: ["spring", "autumn"],
    }),
    expected: 67,
  },
  {
    id: "season-only",
    garment: vectorGarment("91000000-0000-4000-8000-000000000003", "tops", {
      temperatureMinC: undefined, temperatureMaxC: undefined, warmth: undefined, seasons: ["all"],
    }),
    expected: 40,
  },
  {
    id: "neutral-accessory",
    garment: vectorGarment("91000000-0000-4000-8000-000000000004", "bags", {
      temperatureMinC: -30, temperatureMaxC: 45, warmth: 5, seasons: ["winter"],
    }),
    expected: 50,
  },
] as const;

const baseWearable = (id: string, category: RecommendationGarment["category"]) =>
  vectorGarment(id, category, {
    temperatureMinC: 12, temperatureMaxC: 28, warmth: 2, seasons: ["all"],
  });

export const candidateAdaptabilityVectors = [
  {
    id: "t1-balanced-base",
    template: "T1" as const,
    garments: [
      baseWearable("92000000-0000-4000-8000-000000000001", "tops"),
      baseWearable("92000000-0000-4000-8000-000000000002", "pants"),
      baseWearable("92000000-0000-4000-8000-000000000003", "shoes"),
    ],
    expected: 64.67,
  },
  {
    id: "t2-removable-layer",
    template: "T2" as const,
    garments: [
      baseWearable("92000000-0000-4000-8000-000000000011", "tops"),
      baseWearable("92000000-0000-4000-8000-000000000012", "pants"),
      baseWearable("92000000-0000-4000-8000-000000000013", "shoes"),
      vectorGarment("92000000-0000-4000-8000-000000000014", "tops", {
        subcategory: "jacket", temperatureMinC: 0, temperatureMaxC: 15, warmth: 4, seasons: ["all"],
      }),
    ],
    expected: 95.67,
  },
  {
    id: "t1-single-hot-extreme",
    template: "T1" as const,
    garments: [
      vectorGarment("92000000-0000-4000-8000-000000000021", "tops", { temperatureMinC: 25, temperatureMaxC: 45, warmth: 1, seasons: ["all"] }),
      vectorGarment("92000000-0000-4000-8000-000000000022", "pants", { temperatureMinC: 25, temperatureMaxC: 45, warmth: 1, seasons: ["all"] }),
      vectorGarment("92000000-0000-4000-8000-000000000023", "shoes", { temperatureMinC: 25, temperatureMaxC: 45, warmth: 1, seasons: ["all"] }),
    ],
    expected: 43.33,
  },
] as const;

export const v2ScenarioFixtures = [
  { id: "locationless-normal", input: buildLocationlessInput(), expectedStatus: "ready" },
  { id: "weather-fallback-normal", input: buildFallbackInput(), expectedStatus: "ready" },
  { id: "forecast-delegation", input: buildForecastInput(), expectedStatus: "ready" },
  { id: "dress-and-shoes-ready", input: buildLocationlessInput({ garments: buildFixtureInput().garments.filter((item) => item.id === IDS.dress || item.id === IDS.loafers) }), expectedStatus: "limited" },
  { id: "empty-wardrobe-normal", input: buildLocationlessInput({ garments: [] }), expectedStatus: "not_ready" },
] as const;
