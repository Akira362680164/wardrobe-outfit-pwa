import type { WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { getAllColors, uniqueTrimmed } from "@/lib/color-fields";
import { COLOR_SWATCHES, normalizeSystemColorValue } from "@/lib/color-catalog";

const DEFAULT_SWATCH = "rgba(31, 31, 31, 0.2)";

export function formatLocalMonthDay(dateLike?: string): string {
  if (!dateLike) return "";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(dateLike);
    if (!match) return "";
    return `${Number(match[2])}/${Number(match[3])}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatGarmentWearLine(item: WardrobeItem): string {
  const legacy = item as WardrobeItem & { lastWorn?: string; wearCount?: number };
  const wornDates = Array.isArray(item.wornDates) ? uniqueTrimmed(item.wornDates) : [];
  const wearCount = Math.max(0, legacy.wearCount ?? wornDates.length ?? 0);
  const lastWorn = legacy.lastWorn || wornDates[wornDates.length - 1] || "";
  if (wearCount <= 0) return "未穿过";
  const dateText = formatLocalMonthDay(lastWorn);
  return dateText ? `最近 ${dateText} · 穿过 ${wearCount} 次` : `穿过 ${wearCount} 次`;
}

export function getGarmentCardColors(item: WardrobeItem): string[] {
  return getAllColors(item.colors);
}

export function getColorSwatchStyle(colorName: string): { backgroundColor: string; needsBorder: boolean } {
  const systemColor = normalizeSystemColorValue(colorName);
  const swatch = systemColor ? COLOR_SWATCHES[systemColor] : null;
  return {
    backgroundColor: swatch?.bg ?? DEFAULT_SWATCH,
    needsBorder: Boolean(swatch?.border),
  };
}

export function formatGarmentCategoryColorLine(item: WardrobeItem | { category: string; colors: WardrobeItem["colors"] }): { categoryLabel: string; colors: string[] } {
  return {
    categoryLabel: CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? "未分类",
    colors: getGarmentCardColors(item as WardrobeItem),
  };
}
