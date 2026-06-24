// src/lib/wishlist-ai-prompt.ts
// v0.9.49-dev 种草 2.0: AI 买前评估 prompt 构建、解析与清洗 — 纯函数。

import type { WardrobeItem, WishlistAssessment, WishlistItem } from "@/lib/types";
import type { WishlistRuleAssessment, WishlistPairingMatch, SimilarOwnedWishlistMatch } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { getPrimaryColors, getAccentColors } from "@/lib/color-fields";

/* ------------------------------------------------------------------ */
/*  System Prompt                                                      */
/* ------------------------------------------------------------------ */

export function buildWishlistAssessmentSystemPrompt(): string {
  return [
    "你是一个克制、实用的买前穿搭顾问，正在为一个本地衣橱管理 App 判断「一个想买的单品是否值得购买」。",
    "",
    "你必须只基于用户提供的种草商品信息、衣物属性、已有衣橱分析结果、可搭配单品和相似已有单品做判断。",
    "不要编造不存在的材质、价格、用户身份、职业、身材或消费水平。",
    "不要联网，不要假装知道电商价格历史，不要给出下单催促。",
    "不要输出营销话术，不要使用夸张表达。",
    "不要生成图片，不要生成 AI 试穿。",
    "可以给出「建议买 / 再考虑 / 不建议」的判断，但必须解释原因。",
    "如果信息不足，要降低置信度，并提醒补充信息，而不是胡乱判断。",
    "",
    "输出必须是严格 JSON。",
    "不要输出 Markdown。",
    "不要输出解释文字。",
    "不要在 JSON 外包裹代码块。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  User Prompt                                                        */
/* ------------------------------------------------------------------ */

export function buildWishlistAssessmentPrompt(input: {
  wishlistItem: WishlistItem;
  ruleAssessment: WishlistRuleAssessment;
  wardrobeItems: WardrobeItem[];
}): string {
  const { wishlistItem, ruleAssessment } = input;

  const categoryLabel = wishlistItem.category ? CATEGORY_LABELS[wishlistItem.category] ?? wishlistItem.category : "";
  const subcategoryLabel = wishlistItem.subcategory ?? "";
  const priceText = wishlistItem.price != null ? `¥${wishlistItem.price}` : "未填写";
  const primaryColorsText = getPrimaryColors(wishlistItem.colors).join("、") || "未填写";
  const secondaryColorsText = getAccentColors(wishlistItem.colors).join("、") || "无";
  const seasonsText = (wishlistItem.seasons ?? []).join("、") || "未填写";
  const styleTagsText = (wishlistItem.styles ?? []).join("、") || "未填写";
  const tempText = wishlistItem.temperatureRange
    ? `${wishlistItem.temperatureRange.minC ?? "?"}℃ ~ ${wishlistItem.temperatureRange.maxC ?? "?"}℃`
    : "未填写";
  const formalityText = wishlistItem.formality != null ? String(wishlistItem.formality) : "未填写";
  const warmthText = wishlistItem.warmth != null ? String(wishlistItem.warmth) : "未填写";

  const localVerdictLabel =
    ruleAssessment.localVerdict === "worth_buying" ? "建议买"
    : ruleAssessment.localVerdict === "not_recommended" ? "不建议"
    : "再考虑";

  const parts = [
    "请评估下面这个种草单品是否值得购买。",
    "",
    "【商品信息】",
    `名称：${wishlistItem.name}`,
    `价格：${priceText}`,
    wishlistItem.productUrl ? `商品链接：${wishlistItem.productUrl}` : "",
    wishlistItem.notes ? `购买备注：${wishlistItem.notes}` : "",
    "",
    "【衣物信息】",
    categoryLabel ? `一级分类：${categoryLabel}` : "",
    subcategoryLabel ? `二级分类：${subcategoryLabel}` : "",
    wishlistItem.colors?.mode ? `颜色模式：${wishlistItem.colors.mode}` : "",
    `主色：${primaryColorsText}`,
    `辅助色：${secondaryColorsText}`,
    `季节：${seasonsText}`,
    `风格：${styleTagsText}`,
    `适穿温度：${tempText}`,
    `正式度：${formalityText}`,
    `保暖度：${warmthText}`,
    wishlistItem.material ? `材质：${wishlistItem.material}` : "",
    "",
    "【本地规则预评估】",
    `本地规则分：${ruleAssessment.score} / 100`,
    `本地初步判断：${localVerdictLabel}`,
    `搭配覆盖度：${ruleAssessment.pairingCoverage}`,
    `重复风险：${ruleAssessment.duplicateRisk}`,
    `信息完整度：${ruleAssessment.informationCompleteness}`,
    `价格层级：${ruleAssessment.priceLevel}`,
    ruleAssessment.missingInfoHints.length > 0 ? `缺失信息：${ruleAssessment.missingInfoHints.join("；")}` : "",
    "",
    "【可搭配已有单品 Top 8】",
    summarizeRecommendedPairingsForWishlistPrompt(ruleAssessment.recommendedPairings),
    "",
    "【相似已有单品 Top 5】",
    summarizeSimilarOwnedItemsForWishlistPrompt(ruleAssessment.similarOwnedItems),
    "",
    `请输出以下 JSON 结构：`,
    "",
    "{",
    '  "score": 0到100之间的整数,',
    '  "verdict": "worth_buying" | "consider" | "not_recommended" | "unknown",',
    '  "summary": "一句话总结是否值得买，20-80个中文字符",',
    '  "matchReasons": ["最多4条支持购买的原因，每条不超过40个中文字符"],',
    '  "conflictReasons": ["最多4条犹豫或不建议的原因，每条不超过40个中文字符"],',
    '  "similarOwnedItemIds": [已有相似单品的数字 id，只能来自输入的相似已有单品],',
    '  "suggestedOutfits": [',
    '    {',
    '      "title": "搭配方案名称，不超过16个中文字符",',
    '      "itemIds": [已有衣橱单品数字 id，只能来自输入的可搭配已有单品],',
    '      "reason": "为什么这些单品适合搭配，不超过50个中文字符"',
    '    }',
    '  ],',
    '  "missingItems": ["最多3条可选缺失搭配对象，每条不超过30个中文字符"]',
    "}",
    "",
    "判断规则：",
    "1. 可搭配单品多、重复风险低、信息完整度高，可以倾向 worth_buying。",
    "2. 可搭配单品一般、价格或重复风险有犹豫，倾向 consider。",
    "3. 重复风险高且新增搭配价值低，倾向 not_recommended。",
    "4. 信息严重不足，倾向 unknown 或 consider，并指出需要补充信息。",
    "5. 不要因为价格低就直接建议买。",
    "6. 不要因为价格高就直接不建议买。",
    "7. 不要生成不存在的 itemIds。",
    "8. suggestedOutfits 只能使用「可搭配已有单品 Top 8」中的 itemId。",
    "9. similarOwnedItemIds 只能使用「相似已有单品 Top 5」中的 itemId。",
    "10. 输出必须是合法 JSON。",
  ].filter((s) => s !== "").join("\n");

  return parts;
}

/* ------------------------------------------------------------------ */
/*  摘要生成（给 prompt）                                                */
/* ------------------------------------------------------------------ */

function summarizeRecommendedPairingsForWishlistPrompt(
  pairings: WishlistPairingMatch[],
): string {
  if (pairings.length === 0) return "暂无明显可搭配已有单品";

  return pairings.slice(0, 8).map((entry) => {
    const item = entry.item;
    const id = item.id ?? "未知";
    const reasons = entry.reasons.slice(0, 3).join("，") || "适合作为搭配补充";
    return `- itemId=${id}，${item.name}：${reasons}，规则分 ${entry.score}`;
  }).join("\n");
}

function summarizeSimilarOwnedItemsForWishlistPrompt(
  matches: SimilarOwnedWishlistMatch[],
): string {
  if (matches.length === 0) return "暂无明显相似已有单品";

  return matches.slice(0, 5).map((match) => {
    const item = match.item;
    const id = item.id ?? "未知";
    const reasons = match.reasons.slice(0, 3).join("，") || "属性接近";
    return `- itemId=${id}，${item.name}：相似度 ${match.similarity}%，${reasons}`;
  }).join("\n");
}

/* ------------------------------------------------------------------ */
/*  JSON 解析与清洗                                                     */
/* ------------------------------------------------------------------ */

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function parseWishlistAssessmentJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const json = extractFirstJsonObject(text);
    if (!json) throw new Error("AI 返回不是合法 JSON");
    return JSON.parse(json);
  }
}

function sanitizeString(value: unknown, fallback: string, maxLen: number): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, maxLen);
  }
  return fallback;
}

function sanitizeStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, maxLen))
    .slice(0, maxItems);
}

function sanitizeWishlistVerdict(
  value: unknown,
  fallback: "worth_buying" | "consider" | "not_recommended" | "unknown",
): "worth_buying" | "consider" | "not_recommended" | "unknown" {
  if (typeof value === "string") {
    if (value === "worth_buying" || value === "consider" || value === "not_recommended" || value === "unknown") {
      return value;
    }
  }
  return fallback;
}

export function sanitizeWishlistAssessment(input: {
  raw: unknown;
  ruleAssessment: WishlistRuleAssessment;
  validWardrobeItemIds: Set<number>;
}): WishlistAssessment {
  const { raw, ruleAssessment, validWardrobeItemIds } = input;
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};

  const scoreRaw = typeof obj.score === "number" && Number.isFinite(obj.score)
    ? Math.round(obj.score)
    : ruleAssessment.score;

  const score = Math.max(0, Math.min(100, scoreRaw));

  const verdict = sanitizeWishlistVerdict(obj.verdict, ruleAssessment.localVerdict);

  const summary = sanitizeString(
    obj.summary,
    ruleAssessment.summary,
    100,
  );

  const matchReasons = sanitizeStringArray(obj.matchReasons, 4, 50);
  const conflictReasons = sanitizeStringArray(obj.conflictReasons, 4, 50);
  const allowedSimilarItemIds = new Set(
    ruleAssessment.similarOwnedItems
      .slice(0, 5)
      .map((entry) => entry.item.id)
      .filter((id): id is number => typeof id === "number" && validWardrobeItemIds.has(id)),
  );
  const allowedPairingItemIds = new Set(
    ruleAssessment.recommendedPairings
      .slice(0, 8)
      .map((entry) => entry.item.id)
      .filter((id): id is number => typeof id === "number" && validWardrobeItemIds.has(id)),
  );

  const similarOwnedItemIds = Array.isArray(obj.similarOwnedItemIds)
    ? obj.similarOwnedItemIds
        .filter((id): id is number => typeof id === "number" && allowedSimilarItemIds.has(id))
        .slice(0, 5)
    : [];

  const suggestedOutfits = sanitizeSuggestedOutfits(
    obj.suggestedOutfits,
    allowedPairingItemIds,
  );

  const missingItems = sanitizeStringArray(obj.missingItems, 3, 40);

  return {
    score,
    verdict,
    summary,
    matchReasons,
    conflictReasons,
    similarOwnedItemIds,
    suggestedOutfits,
    missingItems,
    generatedAt: new Date().toISOString(),
  };
}

function sanitizeSuggestedOutfits(
  value: unknown,
  allowedPairingItemIds: Set<number>,
): WishlistAssessment["suggestedOutfits"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => v !== null && typeof v === "object")
    .map((v) => {
      const title = typeof v.title === "string" ? v.title.trim().slice(0, 16) : "";
      const reason = typeof v.reason === "string" ? v.reason.trim().slice(0, 50) : "";
      const itemIds = Array.isArray(v.itemIds)
        ? v.itemIds.filter((id): id is number => typeof id === "number" && allowedPairingItemIds.has(id)).slice(0, 8)
        : [];
      return { title, itemIds, reason };
    })
    .filter((o) => o.itemIds.length > 0)
    .slice(0, 2);
}

/* ------------------------------------------------------------------ */
/*  本地兜底评估                                                         */
/* ------------------------------------------------------------------ */

export function buildFallbackWishlistAssessment(rule: WishlistRuleAssessment): WishlistAssessment {
  const verdict = rule.localVerdict;

  const matchReasons: string[] = [];
  const conflictReasons: string[] = [];

  if (rule.matchCount > 0) {
    matchReasons.push(`可搭配 ${rule.matchCount} 件已有单品`);
  }

  if (rule.pairingCoverage === "high") {
    matchReasons.push("搭配覆盖度较高");
  }

  if (rule.duplicateRisk === "low") {
    matchReasons.push("与现有衣橱重复风险较低");
  }

  if (rule.duplicateRisk === "medium") {
    conflictReasons.push("与部分已有单品存在相似功能");
  }

  if (rule.duplicateRisk === "high") {
    conflictReasons.push("与现有衣橱重复度较高");
  }

  if (rule.pairingCoverage === "low") {
    conflictReasons.push("可搭配已有单品较少");
  }

  if (rule.informationCompleteness === "low") {
    conflictReasons.push("商品信息不完整，评估准确度有限");
  }

  return {
    score: rule.score,
    verdict,
    summary: rule.summary,
    matchReasons: matchReasons.slice(0, 4),
    conflictReasons: conflictReasons.slice(0, 4),
    similarOwnedItemIds: rule.similarOwnedItems
      .map((m) => m.item.id)
      .filter((id): id is number => typeof id === "number")
      .slice(0, 5),
    suggestedOutfits: [],
    missingItems: rule.missingInfoHints.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
}
