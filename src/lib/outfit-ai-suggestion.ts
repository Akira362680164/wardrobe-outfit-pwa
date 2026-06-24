// src/lib/outfit-ai-suggestion.ts
// v0.9.50-dev 套装 AI 化: 套装建议本地规则兜底与 AI 输出清洗。
// v1.1.27: 移除本地 normalizeColorName（含 卡其->米 bug），改用 @/lib/color-catalog 唯一目录。

import type { OutfitAiSuggestion, OutfitAiReplacementSuggestion, SavedOutfit, Season, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS, SEASON_LABELS } from "@/lib/types";
import { getAllColors } from "@/lib/color-fields";
import { normalizeSystemColorValue } from "@/lib/color-catalog";

const MAX_SUMMARY_LEN = 90;
const MAX_SCENE_ITEMS = 5;
const MAX_LIST_ITEMS = 5;
const MAX_LIST_TEXT_LEN = 42;
const MAX_MISSING_ITEMS = 5;
const MAX_REPLACEMENTS = 8;
const MAX_SUGGESTED_IDS = 4;
const MAX_REASON_LEN = 70;

const CORE_CATEGORY_LABELS = {
  top: "上装",
  bottom: "下装",
  dress: "连衣裙",
  outerwear: "外套",
  shoes: "鞋",
  bag: "包",
} as const;

const NEUTRAL_COLORS = new Set(["黑", "白", "灰", "米", "米白", "卡其", "棕", "咖啡", "牛仔蓝", "藏青"]);

export interface OutfitReplacementCandidate {
  item: WardrobeItem;
  score: number;
  reasons: string[];
}

export function sanitizeOutfitAiSuggestion(input: {
  raw: unknown;
  validItemIds: Set<number>;
  outfitItemIds: Set<number>;
  allowedReplacementItemIdsByOriginal?: Map<number, Set<number>>;
  source?: "ai" | "local";
  generatedAt?: string;
  fallbackSummary?: string;
}): OutfitAiSuggestion {
  const obj = input.raw && typeof input.raw === "object" ? input.raw as Record<string, unknown> : {};
  const summary = sanitizeString(obj.summary, input.fallbackSummary ?? "已按当前套装信息生成基础建议。", MAX_SUMMARY_LEN);
  const generatedAt = typeof obj.generatedAt === "string" && obj.generatedAt ? obj.generatedAt : input.generatedAt ?? new Date().toISOString();
  const source = obj.source === "local" || obj.source === "ai" ? obj.source : input.source;

  const replacementSuggestions = sanitizeReplacementSuggestions(
    obj.replacementSuggestions,
    input.validItemIds,
    input.outfitItemIds,
    input.allowedReplacementItemIdsByOriginal,
  );

  return {
    summary,
    suitableScenes: sanitizeStringArray(obj.suitableScenes, MAX_SCENE_ITEMS, MAX_LIST_TEXT_LEN),
    unsuitableScenes: sanitizeStringArray(obj.unsuitableScenes, MAX_SCENE_ITEMS, MAX_LIST_TEXT_LEN),
    strengths: sanitizeStringArray(obj.strengths, MAX_LIST_ITEMS, MAX_LIST_TEXT_LEN),
    risks: sanitizeStringArray(obj.risks, MAX_LIST_ITEMS, MAX_LIST_TEXT_LEN),
    replacementSuggestions,
    missingItems: sanitizeStringArray(obj.missingItems, MAX_MISSING_ITEMS, MAX_LIST_TEXT_LEN),
    generatedAt,
    ...(source ? { source } : {}),
  };
}

export function buildLocalOutfitAiSuggestion(input: {
  outfit: SavedOutfit;
  outfitItems: WardrobeItem[];
  allItems: WardrobeItem[];
  generatedAt?: string;
}): OutfitAiSuggestion {
  const { outfit, outfitItems, allItems } = input;
  const validIds = new Set(allItems.map((item) => item.id).filter((id): id is number => typeof id === "number"));
  const outfitIds = new Set(outfitItems.map((item) => item.id).filter((id): id is number => typeof id === "number"));
  const replacementSuggestions = outfitItems
    .flatMap((item) => {
      if (item.id == null) return [];
      const candidates = getReplacementCandidatesForOutfitItem({
        originalItem: item,
        outfit,
        allItems,
        limit: 3,
      });
      if (candidates.length === 0) return [];
      return [{
        originalItemId: item.id,
        suggestedItemIds: candidates.map((candidate) => candidate.item.id).filter((id): id is number => typeof id === "number"),
        reason: candidates[0]?.reasons.join("，") || "同类替换候选",
      }];
    })
    .slice(0, MAX_REPLACEMENTS);

  const raw = {
    summary: buildLocalSummary(outfit, outfitItems),
    suitableScenes: deriveSuitableScenes(outfit, outfitItems),
    unsuitableScenes: deriveUnsuitableScenes(outfit, outfitItems),
    strengths: deriveStrengths(outfit, outfitItems),
    risks: deriveRisks(outfit, outfitItems),
    replacementSuggestions,
    missingItems: deriveMissingItems(outfit, outfitItems),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: "local" as const,
  };

  return sanitizeOutfitAiSuggestion({
    raw,
    validItemIds: validIds,
    outfitItemIds: outfitIds,
    source: "local",
    fallbackSummary: "这套装信息较少，先按本地规则给出基础建议。",
  });
}

export function getReplacementCandidatesForOutfitItem(input: {
  originalItem: WardrobeItem;
  outfit: SavedOutfit;
  allItems: WardrobeItem[];
  limit?: number;
}): OutfitReplacementCandidate[] {
  const originalId = input.originalItem.id;
  if (originalId == null) return [];
  const outfitIds = new Set(input.outfit.itemIds);
  const limit = input.limit ?? 4;

  return input.allItems
    .filter((candidate) => isReplacementCandidate(input.originalItem, candidate, outfitIds))
    .map((candidate) => scoreReplacementCandidate(input.originalItem, candidate))
    .filter((candidate) => candidate.score >= 38)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime();
    })
    .slice(0, limit);
}

export function getCachedReplacementSuggestionForItem(
  suggestion: OutfitAiSuggestion | undefined,
  originalItemId: number,
): OutfitAiReplacementSuggestion | undefined {
  return suggestion?.replacementSuggestions.find((entry) => entry.originalItemId === originalItemId);
}

function sanitizeReplacementSuggestions(
  value: unknown,
  validItemIds: Set<number>,
  outfitItemIds: Set<number>,
  allowedReplacementItemIdsByOriginal?: Map<number, Set<number>>,
): OutfitAiReplacementSuggestion[] {
  if (!Array.isArray(value)) return [];
  const result: OutfitAiReplacementSuggestion[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const originalItemId = typeof obj.originalItemId === "number" && outfitItemIds.has(obj.originalItemId)
      ? obj.originalItemId
      : undefined;
    if (originalItemId == null) continue;

    const allowedIds = allowedReplacementItemIdsByOriginal?.get(originalItemId);
    const suggestedItemIds = Array.isArray(obj.suggestedItemIds)
      ? Array.from(new Set(obj.suggestedItemIds.filter((id): id is number =>
          typeof id === "number" &&
          validItemIds.has(id) &&
          id !== originalItemId &&
          !outfitItemIds.has(id) &&
          (!allowedReplacementItemIdsByOriginal || Boolean(allowedIds?.has(id))),
        ))).slice(0, MAX_SUGGESTED_IDS)
      : [];
    if (suggestedItemIds.length === 0) continue;

    result.push({
      originalItemId,
      suggestedItemIds,
      reason: sanitizeString(obj.reason, "可作为同类替换候选。", MAX_REASON_LEN),
    });
    if (result.length >= MAX_REPLACEMENTS) break;
  }

  return result;
}

function isReplacementCandidate(original: WardrobeItem, candidate: WardrobeItem, outfitIds: Set<number>): boolean {
  if (candidate.id == null || original.id == null) return false;
  if (candidate.id === original.id) return false;
  if (outfitIds.has(candidate.id)) return false;
  if (candidate.status === "archived") return false;
  if (!candidate.imageDataUrl && !candidate.thumbnailDataUrl) return false;
  return true;
}

function scoreReplacementCandidate(original: WardrobeItem, candidate: WardrobeItem): OutfitReplacementCandidate {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.category === original.category) {
    score += 45;
    reasons.push(`同为${CATEGORY_LABELS[original.category] ?? "同类单品"}`);
  }
  if (candidate.subcategory && candidate.subcategory === original.subcategory) {
    score += 14;
    reasons.push("细分类接近");
  }
  const seasonOverlap = overlap(original.seasons, candidate.seasons);
  if (seasonOverlap.length > 0) {
    score += 12;
    reasons.push(`${seasonOverlap.map(formatSeason).slice(0, 2).join("/")}适穿`);
  }
  const styleOverlap = overlap(original.styles, candidate.styles);
  if (styleOverlap.length > 0) {
    score += 8;
    reasons.push("风格接近");
  }
  const sceneOverlap = overlap(original.styles ?? [], candidate.styles ?? []);
  if (sceneOverlap.length > 0) {
    score += 8;
    reasons.push("场景相近");
  }
  if (Math.abs((original.formality ?? 3) - (candidate.formality ?? 3)) <= 1) {
    score += 6;
    reasons.push("正式度接近");
  }
  if (Math.abs((original.warmth ?? 3) - (candidate.warmth ?? 3)) <= 1) {
    score += 6;
    reasons.push("厚薄接近");
  }
  if (hasColorCompatibility(original, candidate)) {
    score += 5;
    reasons.push("颜色容易衔接");
  }
  if (candidate.status === "laundry") {
    score -= 8;
    reasons.push("洗涤中");
  }
  if (candidate.status === "repair") {
    score -= 16;
    reasons.push("维修中");
  }

  return {
    item: candidate,
    score,
    reasons: reasons.length > 0 ? Array.from(new Set(reasons)).slice(0, 3) : ["同类替换候选"],
  };
}

function buildLocalSummary(outfit: SavedOutfit, outfitItems: WardrobeItem[]): string {
  if (outfitItems.length === 0) return "这套装没有可用衣物，建议先补齐组成单品后再判断。";
  const scenes = deriveSuitableScenes(outfit, outfitItems);
  const palette = getPaletteLabel(outfitItems);
  const temp = getTemperatureLabel(outfit);
  const sceneText = scenes.length > 0 ? scenes.slice(0, 2).join("、") : "日常场景";
  const tempText = temp ? `${temp} ` : "";
  return `适合${tempText}${sceneText}，${palette}，可按场景用鞋包或外套微调。`;
}

function deriveSuitableScenes(outfit: SavedOutfit, outfitItems: WardrobeItem[]): string[] {
  const explicit = [...(outfit.sceneTags ?? []), ...(outfit.styleTags ?? [])].filter(Boolean);
  if (explicit.length > 0) return uniqueStrings(explicit).slice(0, MAX_SCENE_ITEMS);
  const fromItems = outfitItems.flatMap((item) => item.styles);
  if (fromItems.length > 0) return uniqueStrings(fromItems).slice(0, MAX_SCENE_ITEMS);
  return outfitItems.length > 0 ? ["日常出门"] : [];
}

function deriveUnsuitableScenes(outfit: SavedOutfit, outfitItems: WardrobeItem[]): string[] {
  if (outfitItems.length === 0) return ["需要完整衣物后再判断"];
  const result: string[] = [];
  const avgFormality = average(outfitItems.map((item) => item.formality ?? 3));
  const avgWarmth = average(outfitItems.map((item) => item.warmth ?? 3));
  const hasShoes = outfitItems.some((item) => item.category === "shoes");
  const hasOutdoor = [...(outfit.sceneTags ?? []), ...outfitItems.flatMap((item) => item.styles)].includes("outdoor");
  if (!hasShoes) result.push("长时间步行");
  if (avgFormality < 3) result.push("很正式的商务会议");
  if (avgWarmth >= 4) result.push("炎热户外");
  if (!hasOutdoor && avgWarmth <= 2) result.push("低温户外");
  return uniqueStrings(result).slice(0, MAX_SCENE_ITEMS);
}

function deriveStrengths(outfit: SavedOutfit, outfitItems: WardrobeItem[]): string[] {
  if (outfitItems.length === 0) return [];
  const result = [`已包含 ${outfitItems.length} 件真实衣物，方便直接复用`];
  const palette = getPaletteLabel(outfitItems);
  if (palette) result.push(palette);
  if ((outfit.seasons ?? []).length > 0) result.push("套装季节标签明确");
  if ((outfit.sceneTags ?? []).length > 0) result.push("适用场景已经标注");
  if (deriveMissingItems(outfit, outfitItems).length === 0) result.push("基础组成较完整");
  return uniqueStrings(result).slice(0, MAX_LIST_ITEMS);
}

function deriveRisks(outfit: SavedOutfit, outfitItems: WardrobeItem[]): string[] {
  const result: string[] = [];
  if (outfitItems.length === 0) result.push("套装内没有可用衣物");
  if ((outfit.sceneTags ?? []).length === 0) result.push("缺少场景标签，适用边界需要人工确认");
  if (!outfit.temperatureRange) result.push("缺少适穿温度，冷热判断偏保守");
  const unavailable = outfitItems.filter((item) => item.status === "laundry" || item.status === "repair");
  if (unavailable.length > 0) result.push(`${unavailable.length} 件衣物当前不可直接穿`);
  const missing = deriveMissingItems(outfit, outfitItems);
  if (missing.length > 0) result.push(`可能还缺 ${missing.slice(0, 2).join("、")}`);
  return uniqueStrings(result).slice(0, MAX_LIST_ITEMS);
}

function deriveMissingItems(outfit: SavedOutfit, outfitItems: WardrobeItem[]): string[] {
  if (outfitItems.length === 0) return ["上装", "下装或连衣裙", "鞋"];
  const categories = new Set(outfitItems.map((item) => item.category));
  const missing: string[] = [];
  const hasOnePiece = categories.has("one_piece");
  if (!categories.has("tops") && !hasOnePiece) missing.push(CORE_CATEGORY_LABELS.top);
  if (!categories.has("pants") && !categories.has("skirts") && !hasOnePiece) missing.push(CORE_CATEGORY_LABELS.bottom);
  if (!categories.has("shoes")) missing.push(CORE_CATEGORY_LABELS.shoes);
  if (!categories.has("bags")) missing.push(CORE_CATEGORY_LABELS.bag);
  if (needsOuterwear(outfit, outfitItems) && !outfitItems.some(isOuterwearLike)) missing.push(CORE_CATEGORY_LABELS.outerwear);
  return uniqueStrings(missing).slice(0, MAX_MISSING_ITEMS);
}

function needsOuterwear(outfit: SavedOutfit, outfitItems: WardrobeItem[]): boolean {
  if ((outfit.seasons ?? []).includes("winter")) return true;
  if (typeof outfit.temperatureRange?.maxC === "number" && outfit.temperatureRange.maxC <= 16) return true;
  return outfitItems.some((item) => item.seasons.includes("winter") || (item.warmth ?? 3) >= 4);
}

function getPaletteLabel(items: WardrobeItem[]): string {
  const colors = items.flatMap(getItemColors);
  if (colors.length === 0) return "配色信息较少";
  const normalized = colors.map((c) => normalizeSystemColorValue(c) ?? c);
  const neutralCount = normalized.filter((color) => NEUTRAL_COLORS.has(color)).length;
  if (neutralCount >= Math.max(2, Math.ceil(normalized.length / 2))) return "基础色占比高，整体容易搭配";
  const unique = uniqueStrings(normalized);
  if (unique.length <= 3) return "色系统一，视觉比较干净";
  return "颜色层次较多，需要控制鞋包和配饰";
}

function getTemperatureLabel(outfit: SavedOutfit): string {
  if (!outfit.temperatureRange) return "";
  const min = outfit.temperatureRange.minC;
  const max = outfit.temperatureRange.maxC;
  if (typeof min === "number" && typeof max === "number") return `${min}-${max}℃`;
  if (typeof min === "number") return `${min}℃以上`;
  if (typeof max === "number") return `${max}℃以下`;
  return "";
}

function getItemColors(item: WardrobeItem): string[] {
  return getAllColors(item.colors);
}

function isOuterwearLike(item: WardrobeItem): boolean {
  return item.category === "tops" && Boolean(item.subcategory?.includes("jacket") || item.subcategory?.includes("coat"));
}

function hasColorCompatibility(a: WardrobeItem, b: WardrobeItem): boolean {
  const colorsA = getItemColors(a).map((c) => normalizeSystemColorValue(c) ?? c);
  const colorsB = getItemColors(b).map((c) => normalizeSystemColorValue(c) ?? c);
  if (colorsA.length === 0 || colorsB.length === 0) return false;
  if (colorsA.some((color) => colorsB.includes(color))) return true;
  return colorsA.some((color) => NEUTRAL_COLORS.has(color)) || colorsB.some((color) => NEUTRAL_COLORS.has(color));
}

function overlap<T extends string>(a: T[] | undefined, b: T[] | undefined): T[] {
  if (!a || !b) return [];
  return a.filter((value) => b.includes(value));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function average(values: number[]): number {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatSeason(season: Season): string {
  return SEASON_LABELS[season] ?? season;
}

function sanitizeString(value: unknown, fallback: string, maxLen: number): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, maxLen);
  }
  return fallback;
}

function sanitizeStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.slice(0, maxLen)),
  ).slice(0, maxItems);
}
