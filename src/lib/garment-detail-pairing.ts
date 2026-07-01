// src/lib/garment-detail-pairing.ts
// v0.9.47-dev 单品详情页 3.0: 搭配推荐规则算法 — 纯函数, 不调 AI。

import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { getAllColors } from "@/lib/color-fields";

/* ------------------------------------------------------------------ */
/*  RecommendedPairingItem — 推荐结果                                   */
/* ------------------------------------------------------------------ */

export interface RecommendedPairingItem {
  item: WardrobeItem;
  score: number;
  reasons: string[];
  relatedOutfitIds: string[];
  outfitCount: number;
  wornTogetherCount: number;
  confidence: "high" | "medium" | "low";
  availabilityHint?: string;
}

/* ------------------------------------------------------------------ */
/*  CoOccurrenceStat — 共现统计                                        */
/* ------------------------------------------------------------------ */

interface CoOccurrenceStat {
  itemId: number;
  outfitCount: number;
  wornTogetherCount: number;
  latestOutfitWornDate?: string;
  latestOutfitUpdatedAt?: string;
  relatedOutfitIds: string[];
}

function emptyCoOccurrenceStat(itemId: number): CoOccurrenceStat {
  return { itemId, outfitCount: 0, wornTogetherCount: 0, relatedOutfitIds: [] };
}

/* ------------------------------------------------------------------ */
/*  分类归一化                                                          */
/* ------------------------------------------------------------------ */

type NormalizedCategory =
  | "tops" | "pants" | "skirts" | "one_piece" | "outerwear"
  | "shoes" | "bags" | "hats" | "jewelry" | "accessories" | "unknown";

function normalizeCategory(item: WardrobeItem): NormalizedCategory {
  const category = item.category as string;
  const subcategory = item.subcategory;

  switch (category) {
    case "top": return "tops";
    case "bottom": return "pants";
    case "dress": return "one_piece";
    case "outerwear": return "outerwear";
    case "shoes": return "shoes";
    case "bag": return "bags";
    case "hat": return "hats";
    case "necklace":
    case "bracelet":
    case "bangle": return "jewelry";
  }

  switch (category) {
    case "tops": case "pants": case "skirts": case "one_piece":
    case "outerwear": case "shoes": case "bags": case "hats":
    case "jewelry": case "accessories":
      return category as NormalizedCategory;
  }

  if (subcategory?.includes("skirt")) return "skirts";
  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  品类互补矩阵                                                        */
/* ------------------------------------------------------------------ */

const CATEGORY_COMPATIBILITY: Record<NormalizedCategory, Partial<Record<NormalizedCategory, number>>> = {
  tops: { pants: 35, skirts: 35, outerwear: 28, shoes: 18, bags: 16, accessories: 10, jewelry: 8, hats: 6 },
  pants: { tops: 35, outerwear: 22, shoes: 22, bags: 16, accessories: 8 },
  skirts: { tops: 35, outerwear: 22, shoes: 22, bags: 16, accessories: 8 },
  one_piece: { outerwear: 28, shoes: 25, bags: 20, hats: 10, jewelry: 10, accessories: 10 },
  outerwear: { tops: 28, pants: 22, skirts: 22, one_piece: 28, shoes: 12, bags: 12 },
  shoes: { pants: 22, skirts: 22, one_piece: 25, tops: 18, bags: 14 },
  bags: { tops: 16, pants: 16, skirts: 16, one_piece: 20, outerwear: 12, shoes: 14 },
  hats: { tops: 6, one_piece: 10, outerwear: 8, accessories: 6 },
  jewelry: { tops: 8, one_piece: 10, outerwear: 6 },
  accessories: { tops: 10, pants: 8, skirts: 8, one_piece: 10, outerwear: 8 },
  unknown: {},
};

/* ------------------------------------------------------------------ */
/*  中性色集合                                                          */
/* ------------------------------------------------------------------ */

const NEUTRAL_COLORS = new Set(["黑", "白", "灰", "米", "米白", "卡其", "棕", "牛仔蓝", "藏青"]);

/* ------------------------------------------------------------------ */
/*  辅助函数                                                            */
/* ------------------------------------------------------------------ */

function getItemColors(item: WardrobeItem): string[] {
  return getAllColors(item.colors);
}

function getSceneTags(item: WardrobeItem): string[] {
  return [...(item.styles ?? [])].filter(Boolean);
}

function getDateKeyMax(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function getIsoMax(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function isRecentDateKey(key: string | undefined, days: number): boolean {
  if (!key) return false;
  const d = new Date(key + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function isRecentIso(iso: string, days: number): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

/* ------------------------------------------------------------------ */
/*  ScorePart                                                          */
/* ------------------------------------------------------------------ */

interface ScorePart {
  score: number;
  reason?: string;
  hardCompatible?: boolean;
}

interface ScoreBreakdown {
  total: number;
  category: ScorePart;
  coOccurrence: ScorePart;
  season: ScorePart;
  scene: ScorePart;
  temperature: ScorePart;
  color: ScorePart;
  style: ScorePart;
  status: ScorePart;
  recency: ScorePart;
}

/* ------------------------------------------------------------------ */
/*  共现统计                                                            */
/* ------------------------------------------------------------------ */

function getCoOccurrenceStats(
  currentItemId: number,
  outfits: SavedOutfit[],
): Map<number, CoOccurrenceStat> {
  const stats = new Map<number, CoOccurrenceStat>();

  for (const outfit of outfits) {
    if (!Array.isArray(outfit.itemIds)) continue;
    const uniqueIds = Array.from(new Set(outfit.itemIds));
    if (!uniqueIds.includes(currentItemId)) continue;
    const otherIds = uniqueIds.filter((id) => id !== currentItemId);

    for (const itemId of otherIds) {
      const prev = stats.get(itemId) ?? emptyCoOccurrenceStat(itemId);
      prev.outfitCount += 1;
      prev.wornTogetherCount += Array.isArray(outfit.wornDates) ? outfit.wornDates.length : 0;
      if (outfit.id) prev.relatedOutfitIds.push(outfit.id);
      const latestWorn = Array.isArray(outfit.wornDates) && outfit.wornDates.length > 0
        ? outfit.wornDates.reduce((max, d) => (d > max ? d : max), outfit.wornDates[0]!)
        : undefined;
      prev.latestOutfitWornDate = getDateKeyMax(prev.latestOutfitWornDate, latestWorn);
      prev.latestOutfitUpdatedAt = getIsoMax(prev.latestOutfitUpdatedAt, outfit.updatedAt);
      stats.set(itemId, prev);
    }
  }

  return stats;
}

/* ------------------------------------------------------------------ */
/*  各维度评分                                                          */
/* ------------------------------------------------------------------ */

function scoreCategoryCompatibility(
  current: WardrobeItem,
  candidate: WardrobeItem,
  coStat: CoOccurrenceStat,
): ScorePart {
  const catA = normalizeCategory(current);
  const catB = normalizeCategory(candidate);
  const matrixScore = CATEGORY_COMPATIBILITY[catA]?.[catB] ?? 0;

  if (matrixScore === 0 && coStat.outfitCount > 0) {
    return { score: 10, reason: "历史搭配出现过", hardCompatible: true };
  }

  return {
    score: matrixScore,
    reason: matrixScore >= 25 ? "品类互补" : matrixScore > 0 ? "可作为搭配补充" : "",
    hardCompatible: matrixScore > 0,
  };
}

function scoreCoOccurrence(stat: CoOccurrenceStat): ScorePart {
  const outfitScore = Math.min(stat.outfitCount * 10, 40);
  const wornScore = Math.min(stat.wornTogetherCount * 2, 12);
  const score = outfitScore + wornScore;
  const reason = stat.outfitCount > 0 ? `同套出现 ${stat.outfitCount} 次` : "";
  return { score, reason };
}

function scoreSeasonCompatibility(current: WardrobeItem, candidate: WardrobeItem): ScorePart {
  const a = current.seasons ?? [];
  const b = candidate.seasons ?? [];
  if (a.length === 0 || b.length === 0) return { score: 0, reason: "" };
  const overlap = a.filter((s) => b.includes(s));
  if (overlap.length > 0) {
    return { score: 8, reason: `${overlap.join("/")}适穿` };
  }
  return { score: -5, reason: "" };
}

function scoreSceneCompatibility(current: WardrobeItem, candidate: WardrobeItem): ScorePart {
  const a = getSceneTags(current);
  const b = getSceneTags(candidate);
  if (a.length === 0 || b.length === 0) return { score: 0, reason: "" };
  const overlap = a.filter((tag) => b.includes(tag));
  if (overlap.length > 0) {
    return { score: 6, reason: `${overlap.slice(0, 2).join("/")}场景匹配` };
  }
  return { score: 0, reason: "" };
}

function scoreTemperatureCompatibility(current: WardrobeItem, candidate: WardrobeItem): ScorePart {
  const a = current.temperatureRange;
  const b = candidate.temperatureRange;
  if (!a || !b) return { score: 0, reason: "" };
  const aMin = typeof a.minC === "number" ? a.minC : -Infinity;
  const aMax = typeof a.maxC === "number" ? a.maxC : Infinity;
  const bMin = typeof b.minC === "number" ? b.minC : -Infinity;
  const bMax = typeof b.maxC === "number" ? b.maxC : Infinity;
  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  if (overlap >= 0) return { score: 8, reason: "适穿温度重合" };
  if (overlap >= -3) return { score: 2, reason: "适穿温度接近" };
  return { score: -6, reason: "" };
}

function scoreColorCompatibility(current: WardrobeItem, candidate: WardrobeItem): ScorePart {
  const a = getItemColors(current);
  const b = getItemColors(candidate);
  if (a.length === 0 || b.length === 0) return { score: 0, reason: "" };
  const aHasNeutral = a.some((c) => NEUTRAL_COLORS.has(c));
  const bHasNeutral = b.some((c) => NEUTRAL_COLORS.has(c));
  const sameColor = a.some((c) => b.includes(c));
  if (aHasNeutral || bHasNeutral) return { score: 8, reason: "基础色好搭" };
  if (sameColor) return { score: 4, reason: "颜色呼应" };
  return { score: 0, reason: "" };
}

function scoreStyleCompatibility(current: WardrobeItem, candidate: WardrobeItem): ScorePart {
  const a = current.styles ?? [];
  const b = candidate.styles ?? [];
  const overlap = a.filter((s) => b.includes(s));
  if (overlap.length > 0) {
    return { score: 4, reason: `${overlap.slice(0, 2).join("/")}风格接近` };
  }
  let score = 0;
  const reasons: string[] = [];
  if (typeof current.formality === "number" && typeof candidate.formality === "number" && Math.abs(current.formality - candidate.formality) <= 2) {
    score += 2;
    reasons.push("正式度接近");
  }
  if (typeof current.warmth === "number" && typeof candidate.warmth === "number" && Math.abs(current.warmth - candidate.warmth) <= 2) {
    score += 2;
    reasons.push("厚薄接近");
  }
  return { score, reason: reasons[0] ?? "" };
}

function scoreStatus(candidate: WardrobeItem): ScorePart {
  switch (candidate.status) {
    case "laundry": return { score: -8, reason: "当前洗涤中" };
    case "repair": return { score: -16, reason: "当前维修中" };
    case "archived": return { score: -999, reason: "" };
    default: return { score: 0, reason: "" };
  }
}

function scoreRecency(stat: CoOccurrenceStat, candidate: WardrobeItem): ScorePart {
  if (isRecentDateKey(stat.latestOutfitWornDate, 30)) {
    return { score: 4, reason: "最近搭过" };
  }
  if (isRecentIso(candidate.updatedAt, 30)) {
    return { score: 2, reason: "" };
  }
  return { score: 0, reason: "" };
}

function scorePairingCandidate(input: {
  currentItem: WardrobeItem;
  candidate: WardrobeItem;
  coStat: CoOccurrenceStat;
}): ScoreBreakdown {
  const { currentItem, candidate, coStat } = input;
  const category = scoreCategoryCompatibility(currentItem, candidate, coStat);
  const coOccurrence = scoreCoOccurrence(coStat);
  const season = scoreSeasonCompatibility(currentItem, candidate);
  const scene = scoreSceneCompatibility(currentItem, candidate);
  const temperature = scoreTemperatureCompatibility(currentItem, candidate);
  const color = scoreColorCompatibility(currentItem, candidate);
  const style = scoreStyleCompatibility(currentItem, candidate);
  const status = scoreStatus(candidate);
  const recency = scoreRecency(coStat, candidate);

  const total = category.score + coOccurrence.score + season.score + scene.score + temperature.score + color.score + style.score + status.score + recency.score;

  return { total, category, coOccurrence, season, scene, temperature, color, style, status, recency };
}

/* ------------------------------------------------------------------ */
/*  候选过滤                                                            */
/* ------------------------------------------------------------------ */

function isValidCandidate(
  currentItem: WardrobeItem,
  candidate: WardrobeItem,
  _options?: { includeUnavailable?: boolean },
): boolean {
  if (!currentItem.id || !candidate.id) return false;
  if (candidate.id === currentItem.id) return false;
  if (candidate.status === "archived") return false;
  // v0.9.49-dev auto-fix: 防御性读取可能未声明的 assetStatus 字段 (v0.9.50 计划中)。
  // 用 in 操作符替代 (candidate as any) 绕过类型检查,避免 lint 错误。
  if ("assetStatus" in candidate && (candidate as { assetStatus?: string }).assetStatus === "discarded") return false;
  if (!candidate.mainImage) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  结果保留与排序                                                       */
/* ------------------------------------------------------------------ */

function shouldKeepRecommendation(result: RecommendedPairingItem): boolean {
  if (result.score < 18) return false;
  const hasHistory = result.outfitCount > 0;
  const hasCategoryReason = result.reasons.some((r) => r.includes("品类") || r.includes("搭配补充"));
  if (!hasHistory && !hasCategoryReason) return false;
  return true;
}

function compareRecommendedPairingItems(a: RecommendedPairingItem, b: RecommendedPairingItem): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.outfitCount !== a.outfitCount) return b.outfitCount - a.outfitCount;
  return new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime();
}

function getConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 55) return "high";
  if (score >= 32) return "medium";
  return "low";
}

function getAvailabilityHint(item: WardrobeItem): string | undefined {
  if (item.status === "laundry") return "洗涤中";
  if (item.status === "repair") return "维修中";
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  推荐理由生成                                                        */
/* ------------------------------------------------------------------ */

function buildRecommendationReasons(
  breakdown: ScoreBreakdown,
  _stat: CoOccurrenceStat,
): string[] {
  const candidates = [
    breakdown.category.reason,
    breakdown.coOccurrence.reason,
    breakdown.season.reason,
    breakdown.temperature.reason,
    breakdown.scene.reason,
    breakdown.color.reason,
    breakdown.style.reason,
    breakdown.recency.reason,
  ].filter(Boolean) as string[];

  const unique = Array.from(new Set(candidates));
  return unique.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  公开 API                                                           */
/* ------------------------------------------------------------------ */

export function getRelatedOutfitsForItem(
  itemId: number,
  outfits: SavedOutfit[],
): SavedOutfit[] {
  return outfits.filter((o) => Array.isArray(o.itemIds) && o.itemIds.includes(itemId));
}

export function getRecommendedPairingItemsForItem(
  currentItem: WardrobeItem,
  allItems: WardrobeItem[],
  outfits: SavedOutfit[],
  options?: { limit?: number; includeUnavailable?: boolean },
): RecommendedPairingItem[] {
  if (!currentItem.id) return [];

  const limit = options?.limit ?? 8;
  const coStats = getCoOccurrenceStats(currentItem.id, outfits);

  return allItems
    .filter((candidate) => isValidCandidate(currentItem, candidate, options))
    .map((candidate) => {
      const coStat = coStats.get(candidate.id!) ?? emptyCoOccurrenceStat(candidate.id!);
      const breakdown = scorePairingCandidate({ currentItem, candidate, coStat });
      const categoryOk = breakdown.category.hardCompatible || coStat.outfitCount > 0;
      const reasons = buildRecommendationReasons(breakdown, coStat);
      if (reasons.length === 0 && categoryOk) {
        reasons.push("适合作为搭配补充");
      }
      return {
        item: candidate,
        score: breakdown.total,
        reasons,
        relatedOutfitIds: coStat.relatedOutfitIds,
        outfitCount: coStat.outfitCount,
        wornTogetherCount: coStat.wornTogetherCount,
        confidence: getConfidence(breakdown.total),
        availabilityHint: getAvailabilityHint(candidate),
      };
    })
    .filter(shouldKeepRecommendation)
    .sort(compareRecommendedPairingItems)
    .slice(0, limit);
}
