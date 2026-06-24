/**
 * 统一中文标签映射
 * 用于全项目替换直接展示内部枚举的 UI。
 */

import { CATEGORY_LABELS, SEASON_LABELS, STATUS_LABELS } from "@/lib/types";
import { getSubcategoryLabel } from "@/lib/garment-category-catalog";

export const COLOR_MODE_LABELS = {
  single: "单色",
  main_with_accent: "主色+点缀色",
  multicolor: "多色/拼色",
} as const;

export const STYLE_DISPLAY_LABELS = {
  casual: "休闲",
  sweet: "甜美",
  elegant: "优雅",
  commute: "通勤",
  outdoor: "户外",
  dinner: "吃饭",
  vacation: "旅行",
} as const;

export const FIT_GENDER_LABELS = {
  menswear: "男装版型",
  womenswear: "女装版型",
  unisex: "中性版型",
  unknown: "未识别",
  unspecified: "不限定",
} as const;

/** 将风格数组映射为中文标签数组 */
export function labelStyles(styles: string[]): string[] {
  return styles.map((s) => STYLE_DISPLAY_LABELS[s as keyof typeof STYLE_DISPLAY_LABELS] ?? s).filter(Boolean);
}

/** 将单个风格标签映射为中文 */
export function labelStyleTag(tag: string): string {
  return STYLE_DISPLAY_LABELS[tag as keyof typeof STYLE_DISPLAY_LABELS] ?? tag;
}

/* ------------------------------------------------------------------ */
/*  通用中文标签格式化函数                                               */
/* ------------------------------------------------------------------ */

/**
 * formatColorModeLabel
 * 颜色模式中文映射：single→单色, main_with_accent→主色+点缀色, multicolor→多色/拼色
 */
export function formatColorModeLabel(mode: string | undefined): string {
  if (!mode) return "未识别";
  return COLOR_MODE_LABELS[mode as keyof typeof COLOR_MODE_LABELS] ?? mode;
}

/**
 * formatStyleLabel
 * 风格中文映射：casual→休闲, sweet→甜美, elegant→优雅, commute→通勤, outdoor→户外, dinner→吃饭, vacation→旅行
 */
export function formatStyleLabel(style: string | undefined): string {
  if (!style) return "未识别";
  return STYLE_DISPLAY_LABELS[style as keyof typeof STYLE_DISPLAY_LABELS] ?? style;
}

/**
 * formatSeasonLabel
 * 季节中文映射
 */
export function formatSeasonLabel(season: string | undefined): string {
  if (!season) return "未识别";
  return SEASON_LABELS[season as keyof typeof SEASON_LABELS] ?? season;
}

/**
 * formatCategoryLabel
 * 分类中文映射
 */
export function formatCategoryLabel(category: string | undefined): string {
  if (!category) return "未识别";
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
}

/**
 * formatStatusLabel
 * 状态中文映射
 */
export function formatStatusLabel(status: string | undefined): string {
  if (!status) return "未识别";
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

/**
 * formatFieldValue
 * 空字段展示：字符串为空显示"未识别"，数组为空显示"未识别"，数值为空显示"未识别"
 */
export function formatFieldValue(value: string | number | string[] | null | undefined): string {
  if (value == null) return "未识别";
  if (typeof value === "string") return value.trim() === "" ? "未识别" : value;
  if (Array.isArray(value)) return value.length === 0 ? "未识别" : value.join("、");
  if (typeof value === "number") return isNaN(value) ? "未识别" : String(value);
  return "未识别";
}

/* ------------------------------------------------------------------ */
/*  衣物版型 / 细分 中文 formatter（v2 §4.3-4.4）                          */
/* ------------------------------------------------------------------ */

/**
 * formatGarmentFitGender
 * 单件衣物版型倾向中文映射：
 *   menswear   → 男装版型
 *   womenswear → 女装版型
 *   unisex     → 中性版型
 *   unknown    → 未识别
 *   空 / 其它  → 未识别
 */
export function formatGarmentFitGender(value: string | null | undefined): string {
  if (!value) return "未识别";
  const label = FIT_GENDER_LABELS[value as keyof typeof FIT_GENDER_LABELS];
  if (label) return label;
  if (value === "unspecified") return "不限定";
  return "未识别";
}

/**
 * formatSubcategoryLabel
 * 细分中文映射：给定 categoryId + subcategoryId，反查 catalog；反查失败时
 *  返回温和 fallback（占位 "其他"），避免直接展示 catalog id 字符串。
 *
 * 注意：当 categoryId 为空/unknown 时，单独的反查会失败，此时也会 fallback。
 */
export function formatSubcategoryLabel(
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): string {
  if (!subcategoryId) return "未填写";
  // 优先复用 catalog 的反查能力；没有 categoryId 时只接受裸 id 命中。
  const looked = getSubcategoryLabelSafe(categoryId, subcategoryId);
  if (looked) return looked;
  // 兜底：避免直接展示 id 字符串。
  return "其他细分";
}

/**
 * 内层包装：catalog getSubcategoryLabel 内部用 ?? 兜底到 id；我们不希望
 * 详情页直接展示 catalog id（例如 "vest" / "denim_jacket"），所以只在
 * 真正反查成功时返回 label，否则返回空串由 formatSubcategoryLabel 兜底。
 */
function getSubcategoryLabelSafe(categoryId: string | null | undefined, subcategoryId: string): string {
  if (!categoryId) return "";
  // 复用已有 export，但只接受"找到 label 且与 id 不一致"作为成功标志。
  const label = getSubcategoryLabel(categoryId, subcategoryId);
  if (label && label !== subcategoryId) return label;
  return "";
}
