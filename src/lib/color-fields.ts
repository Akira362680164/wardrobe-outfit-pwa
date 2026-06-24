/**
 * v2 (2026-06-23): 颜色工具，围绕 ColorInfo discriminated union。
 * v1.1.27: 统一改用 @/lib/color-catalog，删除本地 SYSTEM_COLOR_SET / 别名表。
 * 替换 v1.1.5-followup 的 ColorMode + 五字段拼装逻辑。
 */
import type { ColorInfo } from "@/lib/types";
import {
  COLOR_OPTIONS,
  type SystemColor,
  isSystemColor as isSystemColorFromCatalog,
  normalizeSystemColorValue,
  normalizeSystemColorList,
} from "@/lib/color-catalog";

export type { SystemColor } from "@/lib/color-catalog";

/** 26 个标准色顺序（保留导出供旧调用方使用）。 */
export { COLOR_OPTIONS };

/** 标准色判定（再导出，保证旧 import path 仍可用）。 */
export function isSystemColor(value: unknown): value is SystemColor {
  return isSystemColorFromCatalog(value);
}

/** 单值归一（再导出）。 */
export { normalizeSystemColorValue, normalizeSystemColorList };

/** 字符串数组去重 + 去空白 + 过滤空串, 保留原始顺序 */
export function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  return result;
}

// ============================================================
// ColorInfo 工具
// ============================================================

/** 取主色：single/main_with_accent → primary；multicolor → primaries[0] */
export function getPrimaryColor(colors: ColorInfo | undefined): string {
  if (!colors) return "";
  if (colors.mode === "multicolor") return colors.primaries[0] ?? "";
  return colors.primary ?? "";
}

/** 取所有主色：multicolor → primaries；其他 → [primary] */
export function getPrimaryColors(colors: ColorInfo | undefined): string[] {
  if (!colors) return [];
  if (colors.mode === "multicolor") return colors.primaries.filter(Boolean);
  return colors.primary ? [colors.primary] : [];
}

/** 取辅助色：main_with_accent → accents；其他 → [] */
export function getAccentColors(colors: ColorInfo | undefined): string[] {
  if (!colors) return [];
  if (colors.mode === "main_with_accent") return colors.accents.filter(Boolean);
  return [];
}

/** 全部颜色：主色 + 辅助色去重 */
export function getAllColors(colors: ColorInfo | undefined): string[] {
  return uniqueTrimmed([...getPrimaryColors(colors), ...getAccentColors(colors)]);
}

/** 是否未识别到任何颜色 */
export function isColorInfoEmpty(colors: ColorInfo | undefined): boolean {
  if (!colors) return true;
  return getAllColors(colors).length === 0;
}

/** 默认空 ColorInfo（用于新建草稿初值） */
export function emptyColorInfo(): ColorInfo {
  return { mode: "single", primary: "" };
}

/**
 * 构造一个 ColorInfo，给定 mode + 候选主色 + 候选辅助色。
 * 输入清洗 + 去重；非法时回退 single 模式。
 */
export function buildColorInfo(
  mode: ColorInfo["mode"],
  primaries: string[],
  accents: string[] = [],
): ColorInfo {
  const primaryList = uniqueTrimmed(primaries);
  const accentList = uniqueTrimmed(accents).filter((c) => !primaryList.includes(c));
  if (mode === "multicolor") {
    if (primaryList.length === 0) return { mode: "single", primary: "" };
    return { mode: "multicolor", primaries: primaryList.slice(0, 5) };
  }
  if (mode === "main_with_accent") {
    const primary = primaryList[0] ?? "";
    return { mode: "main_with_accent", primary, accents: accentList.slice(0, 5) };
  }
  return { mode: "single", primary: primaryList[0] ?? "" };
}

/**
 * v1.1.27: 严格校验 AI 返回的颜色，禁止非法原值进入 ColorInfo。
 *
 * 规则：
 * - 标准色或别名命中时使用归一结果；
 * - 未命中时记录非法原值；
 * - 非法值不得进入 ColorInfo；
 * - 出现任意非法值时 needsReview 必须为 true；
 * - reviewReason 必须说明 "AI 返回了非标准颜色：xxx"。
 */
export function normalizeAiColorInfo(input: unknown): {
  colors: ColorInfo;
  needsReview: boolean;
  reviewReason?: string;
} {
  const empty: ColorInfo = { mode: "single", primary: "" };
  if (!input || typeof input !== "object") {
    return { colors: empty, needsReview: true, reviewReason: "AI 未输出颜色信息" };
  }
  const o = input as Record<string, unknown>;
  const mode = o.mode === "main_with_accent" || o.mode === "multicolor" || o.mode === "single" ? o.mode : "single";

  type ConvertResult = { value: SystemColor | null; illegalRaw?: string };
  const convert = (raw: unknown): ConvertResult => {
    if (typeof raw !== "string") return { value: null };
    const trimmed = raw.trim();
    if (!trimmed) return { value: null };
    const normalized = normalizeSystemColorValue(trimmed);
    if (normalized) return { value: normalized };
    return { value: null, illegalRaw: trimmed };
  };

  if (mode === "multicolor") {
    const rawList: unknown[] = Array.isArray(o.primaries) ? o.primaries : [];
    const illegals: string[] = [];
    const cleaned: SystemColor[] = [];
    for (const raw of rawList) {
      const r = convert(raw);
      if (r.value) {
        if (!cleaned.includes(r.value)) cleaned.push(r.value);
        if (cleaned.length >= 5) break;
      } else if (r.illegalRaw) {
        illegals.push(r.illegalRaw);
      }
    }
    if (cleaned.length === 0) {
      return {
        colors: empty,
        needsReview: true,
        reviewReason: illegals.length > 0
          ? `AI 返回了非标准颜色：${illegals.join("、")}`
          : "AI 未输出主色",
      };
    }
    if (cleaned.length === 1) {
      return {
        colors: { mode: "single", primary: cleaned[0] },
        needsReview: illegals.length > 0,
        reviewReason: illegals.length > 0
          ? `AI 返回了非标准颜色：${illegals.join("、")}`
          : undefined,
      };
    }
    return {
      colors: { mode: "multicolor", primaries: cleaned },
      needsReview: illegals.length > 0,
      reviewReason: illegals.length > 0
        ? `AI 返回了非标准颜色：${illegals.join("、")}`
        : undefined,
    };
  }

  if (mode === "main_with_accent") {
    const primaryResult = convert(o.primary);
    const rawAccents: unknown[] = Array.isArray(o.accents) ? o.accents : [];
    const illegals: string[] = [];
    if (primaryResult.illegalRaw) illegals.push(primaryResult.illegalRaw);
    const cleanedAccents: SystemColor[] = [];
    for (const raw of rawAccents) {
      const r = convert(raw);
      if (r.value) {
        if (r.value !== primaryResult.value && !cleanedAccents.includes(r.value)) {
          cleanedAccents.push(r.value);
          if (cleanedAccents.length >= 5) break;
        }
      } else if (r.illegalRaw) {
        illegals.push(r.illegalRaw);
      }
    }
    if (!primaryResult.value) {
      return {
        colors: empty,
        needsReview: true,
        reviewReason: illegals.length > 0
          ? `AI 返回了非标准颜色：${illegals.join("、")}`
          : "AI 未输出主色",
      };
    }
    if (cleanedAccents.length === 0) {
      return {
        colors: { mode: "single", primary: primaryResult.value },
        needsReview: true,
        reviewReason: illegals.length > 0
          ? `AI 返回了非标准颜色：${illegals.join("、")}`
          : "AI 未输出辅助色",
      };
    }
    return {
      colors: { mode: "main_with_accent", primary: primaryResult.value, accents: cleanedAccents },
      needsReview: illegals.length > 0,
      reviewReason: illegals.length > 0
        ? `AI 返回了非标准颜色：${illegals.join("、")}`
        : undefined,
    };
  }

  // single
  const primaryResult = convert(o.primary);
  if (!primaryResult.value) {
    return {
      colors: empty,
      needsReview: true,
      reviewReason: primaryResult.illegalRaw
        ? `AI 返回了非标准颜色：${primaryResult.illegalRaw}`
        : "AI 未输出主色",
    };
  }
  return {
    colors: { mode: "single", primary: primaryResult.value },
    needsReview: Boolean(primaryResult.illegalRaw),
    reviewReason: primaryResult.illegalRaw
      ? `AI 返回了非标准颜色：${primaryResult.illegalRaw}`
      : undefined,
  };
}

/**
 * v2 兼容迁移：从老 5 字段拼出 ColorInfo。
 * 老字段 colorMode / mainColor / accentColors / primaryColors / secondaryColors / colors。
 */
export function migrateLegacyColorFields(input: {
  colorMode?: unknown;
  mainColor?: unknown;
  accentColors?: unknown;
  primaryColors?: unknown;
  secondaryColors?: unknown;
  colors?: unknown;
}): ColorInfo {
  const legacyMain = typeof input.mainColor === "string" ? input.mainColor.trim() : "";
  const legacyPrimary = Array.isArray(input.primaryColors)
    ? uniqueTrimmed(input.primaryColors.filter((v): v is string => typeof v === "string"))
    : [];
  const legacySecondary = Array.isArray(input.secondaryColors)
    ? uniqueTrimmed(input.secondaryColors.filter((v): v is string => typeof v === "string"))
    : [];
  const legacyAccent = Array.isArray(input.accentColors)
    ? uniqueTrimmed(input.accentColors.filter((v): v is string => typeof v === "string"))
    : [];
  const legacyColors = Array.isArray(input.colors)
    ? uniqueTrimmed(input.colors.filter((v): v is string => typeof v === "string"))
    : [];

  const mode = input.colorMode === "main_with_accent" || input.colorMode === "multicolor" || input.colorMode === "single"
    ? input.colorMode
    : undefined;

  if (mode === "main_with_accent") {
    const primary = legacyMain || legacyPrimary[0] || legacyColors[0] || "";
    const accents = uniqueTrimmed([...legacyAccent, ...legacySecondary]).filter((c) => c !== primary).slice(0, 5);
    return { mode: "main_with_accent", primary, accents };
  }

  if (mode === "multicolor") {
    const primaries = uniqueTrimmed([...legacyPrimary, ...legacyColors]).slice(0, 5);
    return { mode: "multicolor", primaries };
  }

  // single 或未指定 mode
  const primary = legacyMain || legacyPrimary[0] || legacyColors[0] || "";
  return { mode: "single", primary };
}
