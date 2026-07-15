import { buildFallbackInput, buildForecastInput, buildLocationlessInput } from "./v2-scenarios.js";

export const V3_ALGORITHM_VERSION = "wardora-recommendation-realtime-v1";
export const V3_RULE_VERSION = "wardora-rules-realtime-1";

export const v3ContextFixtures = [
  { id: "forecast", input: buildForecastInput(), expectedMode: "forecast" as const },
  { id: "locationless", input: buildLocationlessInput(), expectedMode: "locationless" as const },
  { id: "weather-fallback", input: buildFallbackInput(), expectedMode: "weather_fallback" as const },
] as const;
export const rotationVectors = [
  { days: 0, expected: { rotationValue: 0, repeatPenalty: 15, label: null } },
  { days: 2, expected: { rotationValue: 0, repeatPenalty: 15, label: null } },
  { days: 3, expected: { rotationValue: 0, repeatPenalty: 8, label: null } },
  { days: 6, expected: { rotationValue: 0, repeatPenalty: 8, label: null } },
  { days: 7, expected: { rotationValue: 20, repeatPenalty: 0, label: null } },
  { days: 29, expected: { rotationValue: 20, repeatPenalty: 0, label: null } },
  { days: 30, expected: { rotationValue: 40, repeatPenalty: 0, label: null } },
  { days: 89, expected: { rotationValue: 40, repeatPenalty: 0, label: null } },
  { days: 90, expected: { rotationValue: 60, repeatPenalty: 0, label: null } },
  { days: 179, expected: { rotationValue: 60, repeatPenalty: 0, label: null } },
  { days: 180, expected: { rotationValue: 80, repeatPenalty: 0, label: null } },
  { days: 364, expected: { rotationValue: 80, repeatPenalty: 0, label: null } },
  { days: 365, expected: { rotationValue: 100, repeatPenalty: 0, label: "long_unworn" } },
  { days: undefined, expected: { rotationValue: 100, repeatPenalty: 0, label: "never_worn" } },
] as const;

export const objectiveVectors = [
  {
    id: "weighted-vector",
    input: {
      ruleScore: 80,
      savedOrHistoricalSuccess: 50,
      informationCompleteness: 90,
      rotationValue: 40,
      combinationNovelty: 75,
      styleVariation: 60,
      weatherAndActivityFit: 70,
      historicalThermalAndDiscomfortFit: 50,
      shoeAndOuterwearRationality: 80,
    },
    expected: { safe: 74.67, fresh: 62.13, comfort: 65.63 },
  },
  {
    id: "neutral-history-only",
    input: {
      ruleScore: 100,
      savedOrHistoricalSuccess: 0,
      informationCompleteness: 0,
      rotationValue: 100,
      combinationNovelty: 100,
      styleVariation: 100,
      weatherAndActivityFit: 100,
      historicalThermalAndDiscomfortFit: 50,
      shoeAndOuterwearRationality: 100,
    },
    expected: { safe: 73.33, fresh: 100, comfort: 84.38 },
  },
] as const;
