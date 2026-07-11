import type { MiniOutfitPlanEntry } from "../services/workspace";

export type OutfitPlanDateRelation = "past" | "today" | "future";
export type OutfitPlanSelectionMode = "worn" | "primary" | "backup" | "replace";

export function getOutfitPlanDateRelation(dateKey: string, todayKey: string): OutfitPlanDateRelation {
  if (dateKey < todayKey) return "past";
  if (dateKey > todayKey) return "future";
  return "today";
}

export function getDisplayOutfitId(entry: MiniOutfitPlanEntry): string {
  return entry.status === "worn" ? entry.actualOutfitId || entry.outfitId : entry.outfitId;
}

export function resolvePrimaryOutfitPlanEntry(entries: MiniOutfitPlanEntry[]): MiniOutfitPlanEntry | undefined {
  const active = entries.filter((entry) => entry.status !== "skipped");
  const worn = active.filter((entry) => entry.status === "worn").sort(compareWornEntries);
  if (worn.length) return worn[0];

  const planned = active.filter((entry) => entry.status === "planned").sort(comparePlannedEntries);
  if (planned.length) return planned[0];

  return active.filter((entry) => entry.status === "changed").sort(comparePlannedEntries)[0];
}

export function getBackupOutfitPlanEntries(entries: MiniOutfitPlanEntry[], primary?: MiniOutfitPlanEntry): MiniOutfitPlanEntry[] {
  return entries
    .filter((entry) => entry.status === "planned" && !entry.isPrimary && entry.id !== primary?.id)
    .sort(comparePlannedEntries);
}

export function hasDuplicatePlannedOutfit(
  entries: MiniOutfitPlanEntry[],
  dateKey: string,
  outfitId: string,
  mode: OutfitPlanSelectionMode,
  primary?: MiniOutfitPlanEntry,
): boolean {
  if (mode === "worn") return false;
  return entries.some((entry) =>
    entry.date === dateKey
      && entry.outfitId === outfitId
      && entry.status === "planned"
      && (mode !== "replace" || entry.id !== primary?.id)
  );
}

function compareWornEntries(a: MiniOutfitPlanEntry, b: MiniOutfitPlanEntry): number {
  if (a.isPrimaryActual !== b.isPrimaryActual) return a.isPrimaryActual ? -1 : 1;
  return comparePlanOrder(a, b);
}

function comparePlannedEntries(a: MiniOutfitPlanEntry, b: MiniOutfitPlanEntry): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return comparePlanOrder(a, b);
}

function comparePlanOrder(a: MiniOutfitPlanEntry, b: MiniOutfitPlanEntry): number {
  const roleRank = (entry: MiniOutfitPlanEntry): number => {
    if (entry.role === "primary") return 0;
    if (entry.role === "backup") return 1;
    return 2;
  };
  const roleDelta = roleRank(a) - roleRank(b);
  if (roleDelta !== 0) return roleDelta;
  const orderDelta = a.sortOrder - b.sortOrder;
  if (orderDelta !== 0) return orderDelta;
  return b.updatedAt.localeCompare(a.updatedAt);
}
