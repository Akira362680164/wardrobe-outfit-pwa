import type { OutfitPlanEntry } from "@/lib/types";

type RecommendationPlanPresentation = {
  date: string;
  status: OutfitPlanEntry["status"];
  sourceType?: OutfitPlanEntry["sourceType"];
  garmentIds?: readonly string[];
  garmentSnapshots?: readonly NonNullable<OutfitPlanEntry["garmentSnapshots"]>[number][];
  actualGarmentSnapshots?: readonly NonNullable<OutfitPlanEntry["actualGarmentSnapshots"]>[number][];
  availability?: OutfitPlanEntry["availability"];
  unavailableGarmentIds?: readonly string[];
};

export function isSnapshotRecommendationPlan(entry: RecommendationPlanPresentation | undefined): boolean {
  return Boolean(entry?.sourceType === "daily_recommendation" && entry.garmentIds?.length && entry.garmentSnapshots?.length);
}

export function recommendationPlanAvailabilityMessage(entry: RecommendationPlanPresentation, todayKey: string): string | null {
  if (entry.date < todayKey) return null;
  if (entry.availability === "blocked" || (entry.unavailableGarmentIds?.length ?? 0) > 0) return "部分衣物当前不可用，请替换后再穿";
  return null;
}

export function recommendationPlanSnapshotNames(entry: RecommendationPlanPresentation): string[] {
  const snapshots = entry.status === "worn" && entry.actualGarmentSnapshots?.length ? entry.actualGarmentSnapshots : entry.garmentSnapshots;
  return (snapshots ?? []).map((item) => item.name);
}
