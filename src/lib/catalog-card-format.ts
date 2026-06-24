import type { WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { getAllColors, uniqueTrimmed } from "@/lib/color-fields";

const COLOR_SWATCH_MAP: Record<string, string> = {
  "黑": "#1f1f1f",
  "黑色": "#1f1f1f",
  "白": "#ffffff",
  "白色": "#ffffff",
  "米白色": "#f2ead8",
  "米": "#e8dcc2",
  "米色": "#e8dcc2",
  "灰": "#8b8b8b",
  "灰色": "#8b8b8b",
  "浅灰色": "#c8c8c8",
  "深灰色": "#4b4b4b",
  "棕": "#8b5e34",
  "棕色": "#8b5e34",
  "咖色": "#7a5230",
  "卡其色": "#b69b6d",
  "蓝": "#3f6f9f",
  "蓝色": "#3f6f9f",
  "牛仔蓝": "#3b638d",
  "绿": "#5f7f55",
  "绿色": "#5f7f55",
  "军绿色": "#55614a",
  "红": "#b64a4a",
  "红色": "#b64a4a",
  "粉": "#e7a7b1",
  "粉色": "#e7a7b1",
  "黄": "#d8b447",
  "黄色": "#d8b447",
  "橙色": "#d7863b",
  "紫": "#7d5c9b",
  "紫色": "#7d5c9b",
};

const BORDER_SWATCHES = new Set(["白", "白色", "米", "米白色", "米色", "浅灰色"]);

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
  return {
    backgroundColor: COLOR_SWATCH_MAP[colorName] ?? "rgba(31, 31, 31, 0.2)",
    needsBorder: BORDER_SWATCHES.has(colorName),
  };
}

export function formatGarmentCategoryColorLine(item: WardrobeItem): { categoryLabel: string; colors: string[] } {
  return {
    categoryLabel: CATEGORY_LABELS[item.category] ?? "未分类",
    colors: getGarmentCardColors(item),
  };
}
