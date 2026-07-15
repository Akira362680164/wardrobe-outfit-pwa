import type { OutfitPlanEntry } from "@/lib/types";

export function isSnapshotRecommendationPlan(entry: OutfitPlanEntry | undefined): boolean {
  return Boolean(entry?.sourceType === "daily_recommendation" && entry.garmentIds?.length && entry.garmentSnapshots?.length);
}

export function recommendationPlanAvailabilityMessage(entry: OutfitPlanEntry, todayKey: string): string | null {
  if (entry.date < todayKey) return null;
  if (entry.availability === "blocked" || (entry.unavailableGarmentIds?.length ?? 0) > 0) return "部分衣物当前不可用，请替换后再穿";
  return null;
}

export function recommendationPlanSnapshotNames(entry: OutfitPlanEntry): string[] {
  const snapshots = entry.status === "worn" && entry.actualGarmentSnapshots?.length ? entry.actualGarmentSnapshots : entry.garmentSnapshots;
  return (snapshots ?? []).map((item) => item.name);
}
