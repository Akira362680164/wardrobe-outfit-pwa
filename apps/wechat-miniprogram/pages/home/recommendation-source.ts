import type {
  RecommendationDisplayItemV3,
  WeatherOverview,
} from "../../generated/wardora-home-contracts";

import { buildHomeLocationLabel } from "./model";

type RecommendationSourceSnapshot = Pick<
  RecommendationDisplayItemV3,
  "contextMode" | "resolvedLocation" | "locationSource"
>;

export function recommendationSourceSummary(item: RecommendationSourceSnapshot | undefined): string {
  if (
    item?.contextMode !== "forecast"
    || !item.resolvedLocation
    || !item.locationSource
  ) {
    return "通用建议";
  }
  return buildHomeLocationLabel({
    displayName: item.resolvedLocation.displayName,
    source: item.locationSource,
  });
}

export function shouldResolveRecommendationForWeather(
  item: RecommendationSourceSnapshot | undefined,
  weather: Pick<WeatherOverview, "contextMode" | "resolvedLocation" | "locationSource"> | undefined,
): boolean {
  if (
    item?.contextMode !== "forecast"
    || weather?.contextMode !== "forecast"
    || !item.resolvedLocation
    || !item.locationSource
    || !weather.resolvedLocation
    || !weather.locationSource
  ) {
    return false;
  }
  return item.resolvedLocation.locationId !== weather.resolvedLocation.locationId
    || item.locationSource !== weather.locationSource;
}
