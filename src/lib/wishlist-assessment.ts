// src/lib/wishlist-assessment.ts
// v0.9.49-dev 种草 2.0: 买前规则预评估引擎 — 纯函数，不调 AI，不写数据库。

import type {
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
  WishlistPairingMatch,
  WishlistRuleAssessment,
  SimilarOwnedWishlistMatch,
} from "@/lib/types";
import { wishlistToVirtualWardrobeItem, type WardrobeItemLike } from "@/lib/wishlist-conversion";
import { findSimilarWardrobeItems } from "@/lib/similarity";
import { getAllColors, emptyColorInfo } from "@/lib/color-fields";

/* ------------------------------------------------------------------ */
/*  品类归一化 (复用 garment-detail-pairing 的矩阵)                      */
/* ------------------------------------------------------------------ */

type NormalizedCategory =
  | "tops" | "pants" | "skirts" | "one_piece" | "outerwear"
  | "shoes" | "bags" | "hats" | "jewelry" | "accessories" | "unknown";

function normalizeCategory(item: WardrobeItemLike): NormalizedCategory {
  const category = item.category as string;
  const subcategory = item.subcategory as string | undefined;

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

const NEUTRAL_COLORS = new Set(["黑", "白", "灰", "米", "米白", "卡其", "棕", "牛仔蓝", "藏青"]);

/* ------------------------------------------------------------------ */
/*  辅助函数                                                            */
/* ------------------------------------------------------------------ */

function getItemColors(item: WardrobeItemLike | WardrobeItem): string[] {
  return getAllColors(item.colors);
}

function getSceneTags(item: WardrobeItemLike | WardrobeItem): string[] {
  return (item.styles ?? []).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  各维度评分（适配 WardrobeItemLike）                                   */
/* ------------------------------------------------------------------ */

function scoreCategoryCompatibility(
  current: WardrobeItemLike,
  candidate: WardrobeItem,
): { score: number; reason: string; hardCompatible: boolean } {
  const catA = normalizeCategory(current);
  const catB = normalizeCategory(candidate);
  const matrixScore = CATEGORY_COMPATIBILITY[catA]?.[catB] ?? 0;

  return {
    score: matrixScore,
    reason: matrixScore >= 25 ? "品类互补" : matrixScore > 0 ? "可作为搭配补充" : "",
    hardCompatible: matrixScore > 0,
  };
}

function scoreSeasonCompatibility(current: WardrobeItemLike, candidate: WardrobeItem): { score: number; reason: string } {
  const a = current.seasons ?? [];
  const b = candidate.seasons ?? [];
  if (a.length === 0 || b.length === 0) return { score: 0, reason: "" };
  const overlap = a.filter((s) => b.includes(s));
  if (overlap.length > 0) return { score: 8, reason: `${overlap.join("/")}适穿` };
  return { score: -5, reason: "" };
}

function scoreSceneCompatibility(current: WardrobeItemLike, candidate: WardrobeItem): { score: number; reason: string } {
  const a = getSceneTags(current);
  const b = getSceneTags(candidate);
  if (a.length === 0 || b.length === 0) return { score: 0, reason: "" };
  const overlap = a.filter((tag) => b.includes(tag));
  if (overlap.length > 0) return { score: 6, reason: `${overlap.slice(0, 2).join("/")}场景匹配` };
  return { score: 0, reason: "" };
}

function scoreTemperatureCompatibility(current: WardrobeItemLike, candidate: WardrobeItem): { score: number; reason: string } {
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

function scoreColorCompatibility(current: WardrobeItemLike, candidate: WardrobeItem): { score: number; reason: string } {
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

function scoreStyleCompatibility(current: WardrobeItemLike, candidate: WardrobeItem): { score: number; reason: string } {
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

function scoreStatus(candidate: WardrobeItem): { score: number; reason: string } {
  switch (candidate.status) {
    case "laundry": return { score: -8, reason: "当前洗涤中" };
    case "repair": return { score: -16, reason: "当前维修中" };
    case "archived": return { score: -999, reason: "" };
    default: return { score: 0, reason: "" };
  }
}

function getAvailabilityHint(item: WardrobeItem): string | undefined {
  if (item.status === "laundry") return "洗涤中";
  if (item.status === "repair") return "维修中";
  return undefined;
}

function getConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 55) return "high";
  if (score >= 32) return "medium";
  return "low";
}

/* ------------------------------------------------------------------ */
/*  种草搭配计算                                                         */
/* ------------------------------------------------------------------ */

export function getRecommendedPairingsForWishlistItem(input: {
  wishlistItem: WishlistItem;
  wardrobeItems: WardrobeItem[];
  outfits: SavedOutfit[];
  fallbackLocationId: string;
  limit?: number;
}): WishlistPairingMatch[] {
  const {
    wishlistItem,
    wardrobeItems,
    outfits,
    fallbackLocationId,
    limit = 8,
  } = input;

  const virtualItem = wishlistToVirtualWardrobeItem(wishlistItem, fallbackLocationId);

  const activeWardrobeItems = wardrobeItems.filter((item) => {
    if (!item.id) return false;
    if (item.status === "archived") return false;
    if (!item.mainImage) return false;
    return true;
  });

  // v0.9.49-dev auto-fix: 种草没有历史 outfit, 但 candidate 衣橱衣物如果已参与 N 个套装,
  // 说明它"活跃", 与新种草组成新套装时也存在隐性共现。复用 garment-detail-pairing 的
  // scoreCoOccurrence 公式 (outfitCount * 2, 上限 12), 与衣橱推荐口径对齐。
  const outfitCountByItem = new Map<number, number>();
  for (const outfit of outfits) {
    if (!Array.isArray(outfit.itemIds)) continue;
    for (const itemId of outfit.itemIds) {
      if (typeof itemId !== "number") continue;
      outfitCountByItem.set(itemId, (outfitCountByItem.get(itemId) ?? 0) + 1);
    }
  }

  return activeWardrobeItems
    .map((candidate) => {
      const cat = scoreCategoryCompatibility(virtualItem, candidate);
      const season = scoreSeasonCompatibility(virtualItem, candidate);
      const scene = scoreSceneCompatibility(virtualItem, candidate);
      const temperature = scoreTemperatureCompatibility(virtualItem, candidate);
      const color = scoreColorCompatibility(virtualItem, candidate);
      const style = scoreStyleCompatibility(virtualItem, candidate);
      const status = scoreStatus(candidate);

      // v0.9.49-dev auto-fix: 把 candidate 的 outfitCount 折成隐性共现加分 (与 scoreCoOccurrence 同公式)。
      const candidateOutfitCount = typeof candidate.id === "number" ? (outfitCountByItem.get(candidate.id) ?? 0) : 0;
      const coOccurrence = Math.min(candidateOutfitCount * 2, 12);
      const coReason = coOccurrence > 0 ? `你已有 ${candidateOutfitCount} 套常用搭配` : "";

      const total = cat.score + season.score + scene.score + temperature.score + color.score + style.score + status.score + coOccurrence;

      const reasons: string[] = [];
      if (cat.reason) reasons.push(cat.reason);
      if (season.reason) reasons.push(season.reason);
      if (temperature.reason) reasons.push(temperature.reason);
      if (scene.reason) reasons.push(scene.reason);
      if (color.reason) reasons.push(color.reason);
      if (style.reason) reasons.push(style.reason);
      if (coReason) reasons.push(coReason);
      const uniqueReasons = Array.from(new Set(reasons));
      if (uniqueReasons.length === 0 && cat.hardCompatible) {
        uniqueReasons.push("适合作为搭配补充");
      }

      return {
        item: candidate,
        score: total,
        reasons: uniqueReasons.slice(0, 3),
        confidence: getConfidence(total),
        availabilityHint: getAvailabilityHint(candidate),
      };
    })
    .filter((result) => result.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  相似已有单品                                                         */
/* ------------------------------------------------------------------ */

export function findSimilarWardrobeItemsForWishlistItem(input: {
  wishlistItem: WishlistItem;
  wardrobeItems: WardrobeItem[];
  fallbackLocationId: string;
  limit?: number;
  minSimilarity?: number;
}): SimilarOwnedWishlistMatch[] {
  const {
    wishlistItem,
    wardrobeItems,
    fallbackLocationId,
    limit = 5,
    minSimilarity = 70,
  } = input;

  const virtualItem = wishlistToVirtualWardrobeItem(wishlistItem, fallbackLocationId);

  const draft = {
    category: virtualItem.category,
    colors: virtualItem.colors ?? emptyColorInfo(),
    seasons: virtualItem.seasons ?? [],
    styles: virtualItem.styles ?? [],
    formality: virtualItem.formality ?? 3,
    warmth: virtualItem.warmth ?? 3,
  };

  return findSimilarWardrobeItems(draft, wardrobeItems)
    .filter((match) => match.similarity >= minSimilarity)
    .slice(0, limit)
    .map((match) => ({
      item: match.item,
      similarity: match.similarity,
      reasons: match.reasons,
    }));
}

/* ------------------------------------------------------------------ */
/*  规则子评分                                                          */
/* ------------------------------------------------------------------ */

function calculateDuplicateRisk(matches: SimilarOwnedWishlistMatch[]): "low" | "medium" | "high" {
  const highest = matches[0]?.similarity ?? 0;
  const highCount = matches.filter((m) => m.similarity >= 85).length;
  const clearCount = matches.filter((m) => m.similarity >= 70).length;

  if (highest >= 88 || highCount >= 2) return "high";
  if (highest >= 78 || clearCount >= 2) return "medium";
  return "low";
}

function calculatePairingCoverage(matchCount: number): "low" | "medium" | "high" {
  if (matchCount >= 6) return "high";
  if (matchCount >= 3) return "medium";
  return "low";
}

function calculateWishlistInformationCompleteness(item: WishlistItem): "low" | "medium" | "high" {
  let score = 0;

  if (item.name?.trim()) score += 2;
  if (item.category) score += 2;
  if (item.subcategory) score += 1;
  const colorsList = getAllColors(item.colors);
  if (colorsList.length > 0) score += 2;
  if (colorsList.length > 1) score += 1;
  if (item.seasons?.length) score += 1;
  if (item.styles?.length) score += 1;
  if (item.temperatureRange) score += 1;
  if (typeof item.formality === "number") score += 1;
  if (typeof item.warmth === "number") score += 1;
  if (item.price) score += 1;
  if (item.mainImage) score += 1;

  if (score >= 12) return "high";
  if (score >= 7) return "medium";
  return "low";
}

function calculatePriceLevel(item: WishlistItem): "low" | "medium" | "high" | "unknown" {
  const price = item.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return "unknown";
  }
  if (price >= 1000) return "high";
  if (price >= 300) return "medium";
  return "low";
}

function getWishlistMissingInfoHints(item: WishlistItem): string[] {
  const hints: string[] = [];

  if (!item.category) hints.push("补充分类后，搭配和重复判断会更准确");
  if (getAllColors(item.colors).length === 0) hints.push("补充主色后，可以判断颜色适配度");
  if (!item.seasons?.length) hints.push("补充季节后，可以判断是否适合当前衣橱");
  if (!item.styles?.length) hints.push("补充风格后，可以减少误判");
  if (!item.price) hints.push("补充价格后，可以辅助判断是否值得买");

  return hints.slice(0, 3);
}

function calculateRuleAssessmentScore(input: {
  pairingCoverage: "low" | "medium" | "high";
  duplicateRisk: "low" | "medium" | "high";
  informationCompleteness: "low" | "medium" | "high";
  priceLevel: "low" | "medium" | "high" | "unknown";
  matchCount: number;
  similarCount: number;
  highSimilarityCount: number;
}): number {
  let score = 50;

  if (input.pairingCoverage === "high") score += 22;
  if (input.pairingCoverage === "medium") score += 10;
  if (input.pairingCoverage === "low") score -= 14;

  if (input.duplicateRisk === "low") score += 10;
  if (input.duplicateRisk === "medium") score -= 10;
  if (input.duplicateRisk === "high") score -= 26;

  if (input.informationCompleteness === "high") score += 8;
  if (input.informationCompleteness === "medium") score += 2;
  if (input.informationCompleteness === "low") score -= 8;

  if (input.priceLevel === "high") score -= 4;
  if (input.priceLevel === "low") score += 2;

  if (input.highSimilarityCount >= 1) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getLocalWishlistVerdict(
  score: number,
  duplicateRisk: "low" | "medium" | "high",
  pairingCoverage: "low" | "medium" | "high",
): "worth_buying" | "consider" | "not_recommended" {
  if (score >= 78 && duplicateRisk !== "high" && pairingCoverage !== "low") {
    return "worth_buying";
  }

  if (score < 50 || (duplicateRisk === "high" && pairingCoverage === "low")) {
    return "not_recommended";
  }

  return "consider";
}

function buildLocalRuleSummary(input: {
  score: number;
  localVerdict: "worth_buying" | "consider" | "not_recommended";
  matchCount: number;
  similarCount: number;
  duplicateRisk: "low" | "medium" | "high";
  pairingCoverage: "low" | "medium" | "high";
  informationCompleteness: "low" | "medium" | "high";
}): string {
  if (input.localVerdict === "worth_buying") {
    return `可搭配 ${input.matchCount} 件已有单品，重复风险较低，值得重点考虑。`;
  }

  if (input.localVerdict === "not_recommended") {
    if (input.duplicateRisk === "high") {
      return "与现有衣橱重复度较高，可新增搭配价值有限。";
    }
    return "可搭配单品较少，买回后使用场景可能有限。";
  }

  return "有一定搭配空间，但需要结合重复度、价格和使用场景再考虑。";
}

/* ------------------------------------------------------------------ */
/*  主函数                                                              */
/* ------------------------------------------------------------------ */

export function assessWishlistItemByRules(input: {
  wishlistItem: WishlistItem;
  wardrobeItems: WardrobeItem[];
  outfits: SavedOutfit[];
  fallbackLocationId: string;
}): WishlistRuleAssessment {
  const { wishlistItem, wardrobeItems, outfits, fallbackLocationId } = input;

  const recommendedPairings = getRecommendedPairingsForWishlistItem({
    wishlistItem,
    wardrobeItems,
    outfits,
    fallbackLocationId,
    limit: 8,
  });

  const similarOwnedItems = findSimilarWardrobeItemsForWishlistItem({
    wishlistItem,
    wardrobeItems,
    fallbackLocationId,
    limit: 5,
    minSimilarity: 70,
  });

  const matchCount = recommendedPairings.length;
  const similarCount = similarOwnedItems.length;
  const highSimilarityCount = similarOwnedItems.filter((m) => m.similarity >= 85).length;

  const duplicateRisk = calculateDuplicateRisk(similarOwnedItems);
  const pairingCoverage = calculatePairingCoverage(matchCount);
  const informationCompleteness = calculateWishlistInformationCompleteness(wishlistItem);
  const priceLevel = calculatePriceLevel(wishlistItem);

  const score = calculateRuleAssessmentScore({
    pairingCoverage,
    duplicateRisk,
    informationCompleteness,
    priceLevel,
    matchCount,
    similarCount,
    highSimilarityCount,
  });

  const localVerdict = getLocalWishlistVerdict(score, duplicateRisk, pairingCoverage);

  return {
    score,
    localVerdict,
    matchCount,
    similarCount,
    highSimilarityCount,
    duplicateRisk,
    pairingCoverage,
    informationCompleteness,
    priceLevel,
    recommendedPairings,
    similarOwnedItems,
    missingInfoHints: getWishlistMissingInfoHints(wishlistItem),
    summary: buildLocalRuleSummary({
      score,
      localVerdict,
      matchCount,
      similarCount,
      duplicateRisk,
      pairingCoverage,
      informationCompleteness,
    }),
  };
}
