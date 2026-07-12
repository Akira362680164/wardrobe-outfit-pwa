import type { MiniGarment, MiniOutfit, MiniWishlistItem } from "../services/workspace";

export type StatisticsRow = { id: string; name: string; subtitle: string; badge: string; value: string; imageUrl: string };

export interface MiniWearStatistics {
  loading: false;
  error: "";
  monthLabel: string;
  itemCount: number;
  outfitCount: number;
  monthlyOutfitCount: number;
  monthlyOutfitEvents: number;
  monthlyItemCount: number;
  monthlyItemEvents: number;
  idleCount: number;
  recentRows: StatisticsRow[];
  idleRows: StatisticsRow[];
  purchaseRows: StatisticsRow[];
}

type Frequency = { month: number; recent: number; total: number; last: string };
type RankedRow = StatisticsRow & { kind: "item" | "outfit"; frequency: Frequency };

export function buildStatistics(
  items: MiniGarment[],
  outfits: MiniOutfit[],
  wishlist: MiniWishlistItem[],
  today = localDateKey(),
): MiniWearStatistics {
  const month = today.slice(0, 7);
  const itemFrequencies = items.map((item) => frequency(item.wornDates, month, today));
  const outfitFrequencies = outfits.map((outfit) => frequency(outfit.wornDates, month, today));
  const rankedItems = items.map((item, index) => ({
    kind: "item" as const,
    id: item.id,
    name: item.name,
    subtitle: `${item.categoryLabel} · ${lastWornText(item.wornDates)}`,
    badge: "衣物",
    value: wearCountText(itemFrequencies[index]),
    imageUrl: item.imageUrl,
    frequency: itemFrequencies[index],
  } satisfies RankedRow)).filter((row) => row.frequency.total > 0).sort(compareRankedRows);
  const rankedOutfits = outfits.map((outfit, index) => ({
    kind: "outfit" as const,
    id: outfit.id,
    name: outfit.name,
    subtitle: `${outfit.itemCount} 件 · ${lastWornText(outfit.wornDates)}`,
    badge: "套装",
    value: wearCountText(outfitFrequencies[index]),
    imageUrl: outfit.imageUrl,
    frequency: outfitFrequencies[index],
  } satisfies RankedRow)).filter((row) => row.frequency.total > 0).sort(compareRankedRows);
  const recentRows = [...rankedItems.slice(0, 4), ...rankedOutfits.slice(0, 2)]
    .sort(compareRankedRows)
    .slice(0, 6)
    .map(stripRankedFields);

  const allIdleRows = items.map((item) => {
    const wornDates = normalizeWornDates(item.wornDates, today);
    const last = wornDates.at(-1) ?? "";
    const referenceDate = last || dateKeyFromTimestamp(item.createdAt) || today;
    return { item, last, days: daysBetween(referenceDate, today) };
  }).filter((entry) => entry.item.status !== "archived" && entry.days >= 45)
    .sort((a, b) => b.days - a.days || a.item.name.localeCompare(b.item.name, "zh-CN"));
  const idleRows = allIdleRows.slice(0, 6).map(({ item, last, days }) => ({
    id: item.id,
    name: item.name,
    subtitle: `${item.categoryLabel} · ${last ? lastWornText([last]) : "从未记录"}`,
    badge: last ? "闲置" : "未穿",
    value: `${days} 天`,
    imageUrl: item.imageUrl,
  }));

  const itemById = new Map(items.map((item) => [item.id, item]));
  const purchaseRows = wishlist.flatMap((wish) => {
    const item = wish.convertedGarmentId ? itemById.get(wish.convertedGarmentId) : undefined;
    if (!item || !wish.convertedAt) return [];
    const date = dateKeyFromTimestamp(wish.convertedAt);
    if (!date) return [];
    const uses = normalizeWornDates(item.wornDates, today).filter((worn) => worn >= date).length;
    const days = Math.max(0, daysBetween(date, today));
    const per30 = uses ? (uses / Math.max(1, days + 1) * 30).toFixed(1) : "0";
    return [{
      id: wish.id,
      name: item.name,
      subtitle: `转入 ${date.replace(/-/g, "/")} · 每30天 ${per30} 次`,
      badge: uses ? "已使用" : "提醒",
      value: `买后 ${uses} 次`,
      imageUrl: item.imageUrl,
      zero: uses === 0,
    }];
  }).sort((a, b) => Number(b.zero) - Number(a.zero)).slice(0, 6).map(({ zero: _zero, ...row }) => row);

  return {
    loading: false,
    error: "",
    monthLabel: `${Number(month.slice(5))}月`,
    itemCount: items.length,
    outfitCount: outfits.length,
    monthlyOutfitCount: outfitFrequencies.filter((frequency) => frequency.month > 0).length,
    monthlyOutfitEvents: outfitFrequencies.reduce((sum, frequency) => sum + frequency.month, 0),
    monthlyItemCount: itemFrequencies.filter((frequency) => frequency.month > 0).length,
    monthlyItemEvents: itemFrequencies.reduce((sum, frequency) => sum + frequency.month, 0),
    idleCount: allIdleRows.length,
    recentRows,
    idleRows,
    purchaseRows,
  };
}

function frequency(dates: string[], month: string, today: string): Frequency {
  const wornDates = normalizeWornDates(dates, today);
  return {
    month: wornDates.filter((date) => date.startsWith(month)).length,
    recent: wornDates.filter((date) => {
      const distance = daysBetween(date, today);
      return distance >= 0 && distance <= 90;
    }).length,
    total: wornDates.length,
    last: wornDates.at(-1) ?? "",
  };
}

function compareRankedRows(a: RankedRow, b: RankedRow): number {
  return b.frequency.month - a.frequency.month
    || b.frequency.recent - a.frequency.recent
    || b.frequency.total - a.frequency.total
    || b.frequency.last.localeCompare(a.frequency.last)
    || a.name.localeCompare(b.name, "zh-CN");
}

function stripRankedFields(row: RankedRow): StatisticsRow {
  const { kind: _kind, frequency: _frequency, ...result } = row;
  return result;
}

function wearCountText(frequencyValue: Frequency): string {
  return frequencyValue.month ? `本月 ${frequencyValue.month} 次` : `累计 ${frequencyValue.total} 次`;
}

function lastWornText(dates: string[]): string {
  const last = dates.at(-1);
  return last ? `上次 ${last.replace(/-/g, "/")}` : "从未记录";
}

function normalizeWornDates(dates: string[] | undefined, today: string): string[] {
  return (dates ?? []).filter((date) => isDateKey(date) && date <= today).sort();
}

function dateKeyFromTimestamp(value: string | undefined): string {
  const date = value?.slice(0, 10) ?? "";
  return isDateKey(date) ? date : "";
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function localDateKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysBetween(start: string, end: string): number {
  const startTimestamp = Date.parse(`${start}T00:00:00Z`);
  const endTimestamp = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) return 0;
  return Math.max(0, Math.floor((endTimestamp - startTimestamp) / 86_400_000));
}
