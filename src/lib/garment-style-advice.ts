// src/lib/garment-style-advice.ts
// v0.9.47-dev 单品详情页 3.0: AI 穿搭建议 prompt 构建与摘要生成 — 纯函数。

import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { getAccentColors, getPrimaryColor } from "@/lib/color-fields";
import { getWearSummary } from "@/lib/wear-records";
import type { RecommendedPairingItem } from "@/lib/garment-detail-pairing";

/* ------------------------------------------------------------------ */
/*  AI Prompt 构建                                                    */
/* ------------------------------------------------------------------ */

export function buildGarmentStyleAdvicePrompt(
  item: WardrobeItem,
  context: {
    relatedOutfits?: SavedOutfit[];
    recommendedPairingItems?: RecommendedPairingItem[];
  } = {},
): string {
  const primaryColor = getPrimaryColor(item.colors) || "?";
  const accentColors = getAccentColors(item.colors).join("、") || "无";
  const subcategoryLabel = item.subcategory ?? "";
  const colorMode = item.colors.mode;
  const material = item.material ?? "";
  const status = item.status ?? "active";

  const parts = [
    "请为下面这件衣物生成单品穿搭建议。",
    "",
    "【衣物信息】",
    `名称：${item.name}`,
    `一级分类：${CATEGORY_LABELS[item.category] ?? item.category}`,
    subcategoryLabel ? `二级分类：${subcategoryLabel}` : "",
    colorMode ? `颜色模式：${colorMode}` : "",
    `主色：${primaryColor}`,
    `辅助色：${accentColors}`,
    `季节：${item.seasons.join("、")}`,
    `风格标签：${item.styles.join("、")}`,
    `正式度：${item.formality}`,
    `保暖度：${item.warmth}`,
    material ? `材质：${material}` : "",
    `状态：${status}`,
    item.notes ? `备注：${item.notes}` : "",
    "",
    `【历史套装摘要】`,
    summarizeRelatedOutfitsForPrompt(context.relatedOutfits ?? []),
    "",
    `【规则推荐搭配单品摘要】`,
    summarizeRecommendedPairingsForPrompt(context.recommendedPairingItems ?? []),
    "",
    "请返回以下 JSON 结构：",
    "",
    "{",
    '  "summary": "一句话概括这件衣物的穿搭定位，20-60个中文字符",',
    '  "scenes": ["最多3个适合场景"],',
    '  "pairingTips": ["最多3条搭配建议，每条不超过40个中文字符"],',
    '  "avoidTips": ["最多2条避坑建议，每条不超过40个中文字符"]',
    "}",
    "",
    "要求：",
    "1. summary 必须具体，不要写「百搭单品」这种空话。",
    "2. scenes 不超过 3 个。",
    "3. pairingTips 不超过 3 条。",
    "4. avoidTips 不超过 2 条。",
    "5. 不要生成完整套装，只给单品级建议。",
    "6. 不要编造未提供的信息。",
    "7. 输出必须是合法 JSON。",
  ].filter((s) => s !== "").join("\n");

  return parts;
}

export function buildGarmentStyleAdviceSystemPrompt(): string {
  return [
    "你是一个克制、实用的穿搭顾问，正在为一个本地衣橱管理 App 生成「单件衣物」的穿搭建议。",
    "",
    "请只根据用户提供的衣物属性、已有套装关系和推荐搭配单品生成建议。",
    "不要编造不存在的品牌、材质、价格、购买渠道。",
    "不要生成完整套装方案。",
    "不要输出夸张、营销化、玄学化表达。",
    "不要假设用户性别、身材、职业或消费水平，除非输入中明确提供。",
    "建议应简短、具体、可执行，适合手机界面展示。",
    "",
    "必须输出严格 JSON，不要输出 Markdown，不要输出解释文字。",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  摘要生成（给 prompt）                                               */
/* ------------------------------------------------------------------ */

export function summarizeRelatedOutfitsForPrompt(outfits: SavedOutfit[]): string {
  const top5 = outfits.slice(0, 5);
  if (top5.length === 0) return "暂无历史套装";

  return top5.map((o) => {
    const summary = getWearSummary(o.wornDates);
    const seasonPart = (o.seasons ?? []).length > 0 ? o.seasons!.join("/") : "";
    const scenePart = (o.sceneTags ?? []).join("/") || (o.styleTags ?? []).join("/") || "";
    const tags = [seasonPart, scenePart].filter(Boolean).join("，");
    const countPart = `${o.itemIds.length}件`;
    return `- ${o.name}：${countPart}${tags ? `，${tags}` : ""}，${summary.label}`;
  }).join("\n");
}

export function summarizeRecommendedPairingsForPrompt(items: RecommendedPairingItem[]): string {
  const top8 = items.slice(0, 8);
  if (top8.length === 0) return "暂无规则推荐搭配单品";

  return top8.map((r) => {
    const reasons = r.reasons.slice(0, 2).join("，");
    return `- ${r.item.name}：${reasons || "适合作为搭配补充"}`;
  }).join("\n");
}
