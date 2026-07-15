import { createHash } from "node:crypto";
import {
  RECOMMENDATION_ALGORITHM_VERSION_V3,
  RECOMMENDATION_REALTIME_RULE_VERSION,
  type RecommendationEngineInputV2,
} from "@wardrobe/cloud-contracts";

type FingerprintInput = RecommendationEngineInputV2 & {
  algorithmVersion?: string;
  planProtectionState?: { planEntryId: string; revision: number } | null;
};

export function recommendationInputFingerprint(input: FingerprintInput): string {
  const generic = input.resolvedContext.contextMode !== "forecast";
  const weather = { ...input.dateContextInput.weatherEvidence } as Record<string, unknown>;
  if (generic) delete weather.weatherUpdatedAt;
  const normalized = {
    algorithmVersion: input.algorithmVersion ?? RECOMMENDATION_ALGORITHM_VERSION_V3,
    ruleVersion: RECOMMENDATION_REALTIME_RULE_VERSION,
    targetDate: input.dateContextInput.date,
    asOfDate: input.asOfDate,
    resolvedContext: {
      contextMode: input.resolvedContext.contextMode,
      targetTimezone: input.resolvedContext.targetTimezone,
      resolvedLocation: input.resolvedContext.resolvedLocation,
      locationSource: input.resolvedContext.locationSource,
    },
    weather,
    dateContext: {
      weekday: input.dateContextInput.weekday,
      dayType: input.dateContextInput.dayType,
      timezone: input.dateContextInput.timezone,
      travelPlan: input.dateContextInput.travelPlan,
      userProfile: input.dateContextInput.userProfile,
    },
    garments: sortBy(input.garments, (item) => item.id),
    savedOutfits: sortBy(input.savedOutfits.map((item) => ({ ...item, garmentIds: [...item.garmentIds].sort() })), (item) => item.id),
    wearHistory: sortBy(input.wearHistory.map((item) => ({ ...item, garmentIds: [...item.garmentIds].sort() })), (item) => `${item.wornDate}:${item.sceneType}:${item.garmentIds.join(",")}`),
    feedback: sortBy(input.feedback.map((item) => ({ ...item, garmentIds: [...item.garmentIds].sort() })), (item) => `${item.sceneType}:${item.sentiment}:${item.garmentIds.join(",")}`),
    anchorGarmentIds: [...input.anchorGarmentIds].sort(),
    planProtectionState: input.planProtectionState ?? null,
  };
  return createHash("sha256").update(canonicalJson(normalized)).digest("hex");
}

function sortBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
