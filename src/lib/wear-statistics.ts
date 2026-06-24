import { getLocalDateKey, sanitizeWornDates } from "@/lib/wear-records";
import type { SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";

const DEFAULT_IDLE_THRESHOLD_DAYS = 45;
const DEFAULT_LIST_LIMIT = 6;
const RECENT_WINDOW_DAYS = 90;

export interface WearStatisticsInput {
  items: readonly WardrobeItem[];
  outfits: readonly SavedOutfit[];
  wishlistItems?: readonly WishlistItem[];
}

export interface WearStatisticsOptions {
  todayKey?: string;
  idleThresholdDays?: number;
  listLimit?: number;
}

export interface WearFrequencyItem {
  kind: "item";
  item: WardrobeItem;
  wornDates: string[];
  totalWearCount: number;
  currentMonthWearCount: number;
  recentWearCount: number;
  lastWornDate?: string;
}

export interface WearFrequencyOutfit {
  kind: "outfit";
  outfit: SavedOutfit;
  wornDates: string[];
  totalWearCount: number;
  currentMonthWearCount: number;
  recentWearCount: number;
  lastWornDate?: string;
}

export interface IdleWardrobeItem {
  item: WardrobeItem;
  idleDays: number;
  lastWornDate?: string;
  referenceDate: string;
  neverWorn: boolean;
}

export interface PurchaseUsageStatistic {
  wishlistItem: WishlistItem;
  item: WardrobeItem;
  convertedAtKey: string;
  daysSincePurchase: number;
  usesAfterPurchase: number;
  usesPer30Days: number;
  isZeroUse: boolean;
}

export interface WearDistributionEntry {
  label: string;
  count: number;
}

export interface WearStatistics {
  todayKey: string;
  monthPrefix: string;
  monthLabel: string;
  overview: {
    monthlyOutfitCount: number;
    monthlyOutfitWearEvents: number;
    monthlyItemCount: number;
    monthlyItemWearEvents: number;
    idleItemCount: number;
    purchasedItemCount: number;
    zeroUsePurchaseCount: number;
  };
  frequentItems: WearFrequencyItem[];
  frequentOutfits: WearFrequencyOutfit[];
  idleItems: IdleWardrobeItem[];
  purchaseUsage: PurchaseUsageStatistic[];
  zeroUsePurchases: PurchaseUsageStatistic[];
  seasonDistribution: WearDistributionEntry[];
  sceneDistribution: WearDistributionEntry[];
}

export function calculateWearStatistics(
  input: WearStatisticsInput,
  options: WearStatisticsOptions = {},
): WearStatistics {
  const todayKey = normalizeDateKey(options.todayKey) ?? getLocalDateKey();
  const monthPrefix = todayKey.slice(0, 7);
  const idleThresholdDays = Math.max(0, options.idleThresholdDays ?? DEFAULT_IDLE_THRESHOLD_DAYS);
  const listLimit = Math.max(1, options.listLimit ?? DEFAULT_LIST_LIMIT);

  const itemById = new Map<number, WardrobeItem>();
  const frequentItems: WearFrequencyItem[] = [];
  const idleItems: IdleWardrobeItem[] = [];
  const seasonCounts = new Map<string, number>();
  const sceneCounts = new Map<string, number>();

  let monthlyItemCount = 0;
  let monthlyItemWearEvents = 0;

  for (const item of input.items) {
    if (typeof item.id === "number") itemById.set(item.id, item);
    const wornDates = readWornDates(item, todayKey);
    const currentMonthWearCount = countDatesInMonth(wornDates, monthPrefix);
    const totalWearCount = wornDates.length;
    const lastWornDate = wornDates[wornDates.length - 1];
    const recentWearCount = countDatesInRecentWindow(wornDates, todayKey, RECENT_WINDOW_DAYS);

    if (currentMonthWearCount > 0) {
      monthlyItemCount += 1;
      monthlyItemWearEvents += currentMonthWearCount;
      for (const season of item.seasons ?? []) incrementMap(seasonCounts, season);
      for (const scene of item.styles ?? []) incrementMap(sceneCounts, scene);
    }

    if (totalWearCount > 0) {
      frequentItems.push({
        kind: "item",
        item,
        wornDates,
        totalWearCount,
        currentMonthWearCount,
        recentWearCount,
        lastWornDate,
      });
    }

    if (item.status !== "archived") {
      const createdAtKey = toLocalDateKey(item.createdAt) ?? todayKey;
      const referenceDate = lastWornDate ?? createdAtKey;
      const idleDays = Math.max(0, daysBetweenDateKeys(referenceDate, todayKey));
      if (idleDays >= idleThresholdDays) {
        idleItems.push({
          item,
          idleDays,
          lastWornDate,
          referenceDate,
          neverWorn: totalWearCount === 0,
        });
      }
    }
  }

  frequentItems.sort(compareWearFrequency);
  idleItems.sort((a, b) => (
    b.idleDays - a.idleDays
    || compareDateKeysDesc(a.lastWornDate, b.lastWornDate)
    || compareNames(a.item.name, b.item.name)
  ));

  const frequentOutfits: WearFrequencyOutfit[] = [];
  let monthlyOutfitCount = 0;
  let monthlyOutfitWearEvents = 0;

  for (const outfit of input.outfits) {
    const wornDates = readWornDates(outfit, todayKey);
    const currentMonthWearCount = countDatesInMonth(wornDates, monthPrefix);
    const totalWearCount = wornDates.length;
    const lastWornDate = wornDates[wornDates.length - 1];
    const recentWearCount = countDatesInRecentWindow(wornDates, todayKey, RECENT_WINDOW_DAYS);

    if (currentMonthWearCount > 0) {
      monthlyOutfitCount += 1;
      monthlyOutfitWearEvents += currentMonthWearCount;
      for (const season of outfit.seasons ?? []) incrementMap(seasonCounts, season);
      for (const scene of outfit.sceneTags ?? outfit.styleTags ?? []) incrementMap(sceneCounts, scene);
    }

    if (totalWearCount > 0) {
      frequentOutfits.push({
        kind: "outfit",
        outfit,
        wornDates,
        totalWearCount,
        currentMonthWearCount,
        recentWearCount,
        lastWornDate,
      });
    }
  }

  frequentOutfits.sort(compareWearFrequency);

  const purchaseUsage = buildPurchaseUsageStatistics(
    input.wishlistItems ?? [],
    itemById,
    todayKey,
  );
  const zeroUsePurchases = purchaseUsage.filter((entry) => entry.isZeroUse);

  return {
    todayKey,
    monthPrefix,
    monthLabel: formatMonthLabel(monthPrefix),
    overview: {
      monthlyOutfitCount,
      monthlyOutfitWearEvents,
      monthlyItemCount,
      monthlyItemWearEvents,
      idleItemCount: idleItems.length,
      purchasedItemCount: purchaseUsage.length,
      zeroUsePurchaseCount: zeroUsePurchases.length,
    },
    frequentItems: frequentItems.slice(0, listLimit),
    frequentOutfits: frequentOutfits.slice(0, listLimit),
    idleItems: idleItems.slice(0, listLimit),
    purchaseUsage: purchaseUsage.slice(0, listLimit),
    zeroUsePurchases: zeroUsePurchases.slice(0, listLimit),
    seasonDistribution: toDistributionEntries(seasonCounts),
    sceneDistribution: toDistributionEntries(sceneCounts),
  };
}

export function daysBetweenDateKeys(startKey: string, endKey: string): number {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return 0;
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.floor((endUtc - startUtc) / 86_400_000);
}

function buildPurchaseUsageStatistics(
  wishlistItems: readonly WishlistItem[],
  itemById: ReadonlyMap<number, WardrobeItem>,
  todayKey: string,
): PurchaseUsageStatistic[] {
  const results: PurchaseUsageStatistic[] = [];

  for (const wishlistItem of wishlistItems) {
    if (typeof wishlistItem.convertedItemId !== "number") continue;
    if (!wishlistItem.convertedAt) continue;
    const item = itemById.get(wishlistItem.convertedItemId);
    if (!item) continue;
    const convertedAtKey = toLocalDateKey(wishlistItem.convertedAt);
    if (!convertedAtKey || convertedAtKey > todayKey) continue;
    const wornDates = readWornDates(item, todayKey);
    const usesAfterPurchase = wornDates.filter((date) => date >= convertedAtKey).length;
    const daysSincePurchase = Math.max(0, daysBetweenDateKeys(convertedAtKey, todayKey));
    const usesPer30Days = usesAfterPurchase === 0
      ? 0
      : (usesAfterPurchase / Math.max(1, daysSincePurchase + 1)) * 30;

    results.push({
      wishlistItem,
      item,
      convertedAtKey,
      daysSincePurchase,
      usesAfterPurchase,
      usesPer30Days,
      isZeroUse: usesAfterPurchase === 0,
    });
  }

  results.sort((a, b) => {
    if (a.isZeroUse !== b.isZeroUse) return a.isZeroUse ? -1 : 1;
    return b.usesAfterPurchase - a.usesAfterPurchase
      || compareDateKeysDesc(a.convertedAtKey, b.convertedAtKey)
      || compareNames(a.item.name, b.item.name);
  });

  return results;
}

function readWornDates(entity: { wornDates?: unknown }, todayKey: string): string[] {
  return sanitizeWornDates(entity.wornDates, todayKey);
}

function countDatesInMonth(dates: readonly string[], monthPrefix: string): number {
  let count = 0;
  for (const date of dates) {
    if (date.startsWith(monthPrefix)) count += 1;
  }
  return count;
}

function countDatesInRecentWindow(dates: readonly string[], todayKey: string, days: number): number {
  let count = 0;
  for (const date of dates) {
    const distance = daysBetweenDateKeys(date, todayKey);
    if (distance >= 0 && distance <= days) count += 1;
  }
  return count;
}

function compareWearFrequency(
  a: WearFrequencyItem | WearFrequencyOutfit,
  b: WearFrequencyItem | WearFrequencyOutfit,
): number {
  return b.currentMonthWearCount - a.currentMonthWearCount
    || b.recentWearCount - a.recentWearCount
    || b.totalWearCount - a.totalWearCount
    || compareDateKeysDesc(a.lastWornDate, b.lastWornDate)
    || compareNames(getFrequencyName(a), getFrequencyName(b));
}

function getFrequencyName(entry: WearFrequencyItem | WearFrequencyOutfit): string {
  return entry.kind === "item" ? entry.item.name : entry.outfit.name;
}

function compareDateKeysDesc(a?: string, b?: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "zh-Hans-CN");
}

function toDistributionEntries(map: ReadonlyMap<string, number>): WearDistributionEntry[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || compareNames(a.label, b.label))
    .slice(0, 6);
}

function incrementMap(map: Map<string, number>, key: string): void {
  const normalized = key.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function formatMonthLabel(monthPrefix: string): string {
  const month = Number(monthPrefix.slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? `${month}月` : "本月";
}

function toLocalDateKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (normalizeDateKey(trimmed)) return trimmed.slice(0, 10);
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return getLocalDateKey(date);
}

function normalizeDateKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return parseDateKey(trimmed) ? trimmed : undefined;
}

function parseDateKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return { year, month, day };
}
