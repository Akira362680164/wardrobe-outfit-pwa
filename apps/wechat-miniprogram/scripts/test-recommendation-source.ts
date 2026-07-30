import assert from "node:assert/strict";

import type { RecommendationDisplayItemV3 } from "../generated/wardora-home-contracts";
import {
  recommendationSourceSummary,
  shouldResolveRecommendationForWeather,
} from "../pages/home/recommendation-source";

type SourceSnapshot = Pick<
  RecommendationDisplayItemV3,
  "contextMode" | "resolvedLocation" | "locationSource"
>;

const shanghaiRecommendation: SourceSnapshot = {
  contextMode: "forecast",
  resolvedLocation: {
    locationId: "101020100",
    displayName: "上海",
    timezone: "Asia/Shanghai",
  },
  locationSource: "home_city",
};
const beijingWeather = {
  contextMode: "forecast",
  resolvedLocation: {
    locationId: "101010100",
    displayName: "北京",
    timezone: "Asia/Shanghai",
  },
  locationSource: "home_city",
} as const;
const beijingRecommendation: SourceSnapshot = {
  ...beijingWeather,
};

let displayedRecommendation: SourceSnapshot | undefined = shanghaiRecommendation;
assert.equal(
  shouldResolveRecommendationForWeather(displayedRecommendation, beijingWeather),
  true,
  "a current recommendation whose location snapshot differs from current forecast must be resolved again",
);
assert.equal(
  recommendationSourceSummary(displayedRecommendation),
  "上海 · 常驻",
  "a Beijing weather response must not relabel the still-displayed Shanghai recommendation",
);
assert.equal(
  beijingWeather.resolvedLocation.displayName,
  "北京",
  "the fixture must prove that weather and the displayed recommendation disagree",
);

displayedRecommendation = beijingRecommendation;
assert.equal(
  shouldResolveRecommendationForWeather(displayedRecommendation, beijingWeather),
  false,
  "a recommendation matching the current forecast location must not trigger redundant resolution",
);
assert.equal(
  recommendationSourceSummary(displayedRecommendation),
  "北京 · 常驻",
  "a newly resolved Beijing recommendation must display its own Beijing source",
);

displayedRecommendation = undefined;
assert.equal(
  shouldResolveRecommendationForWeather(shanghaiRecommendation, undefined),
  false,
  "failed weather on another date must not compare against or inherit an earlier weather location",
);
assert.equal(
  recommendationSourceSummary(displayedRecommendation),
  "通用建议",
  "a new date with failed weather and no recommendation must not inherit the previous date city",
);
assert.equal(
  recommendationSourceSummary({ contextMode: "locationless" }),
  "通用建议",
);
assert.equal(
  recommendationSourceSummary({
    contextMode: "weather_fallback",
    resolvedLocation: shanghaiRecommendation.resolvedLocation,
    locationSource: "home_city",
  }),
  "通用建议",
);

console.log("mini-program recommendation source behavior passed");
