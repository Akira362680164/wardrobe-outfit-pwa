// src/lib/outfit-ai-prompt.ts
// v0.9.50-dev 套装 AI 化: 套装建议 prompt 与 JSON 解析。

import type { OutfitReplacementCandidate } from "@/lib/outfit-ai-suggestion";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS, SEASON_LABELS } from "@/lib/types";
import { getAllColors } from "@/lib/color-fields";

export function buildOutfitAiSuggestionSystemPrompt(): string {
  return [
    "你是一个克制、实用的穿搭顾问，正在为一个本地衣橱 App 分析用户已经保存的套装。",
    "你只能基于用户提供的套装字段、真实存在的衣物字段和本地规则候选做建议。",
    "不要编造不存在的衣物、itemId、品牌、材质、目的地、用户身份或活动。",
    "不要创建未知衣物，不要建议把未知衣物加入衣橱。",
    "不要生成图片，不要触发试穿，不要输出营销话术。",
    "看不清、无依据或信息不足时，对应数组留空或写成风险点，不要硬编。",
    "replacementSuggestions 里的 originalItemId 必须来自套装内衣物。",
    "replacementSuggestions 里的 suggestedItemIds 必须来自输入的本地替换候选，不允许使用其他数字。",
    "输出必须是严格 JSON，不要 Markdown，不要代码块，不要 JSON 外解释文字。",
  ].join("\n");
}

export function buildOutfitAiSuggestionPrompt(input: {
  outfit: SavedOutfit;
  outfitItems: WardrobeItem[];
  replacementCandidatesByItem: Array<{
    originalItem: WardrobeItem;
    candidates: OutfitReplacementCandidate[];
  }>;
}): string {
  const { outfit, outfitItems, replacementCandidatesByItem } = input;
  const outfitItemIds = outfitItems.map((item) => item.id).filter((id): id is number => typeof id === "number");
  const replacementCandidateIds = replacementCandidatesByItem.flatMap((entry) =>
    entry.candidates.map((candidate) => candidate.item.id).filter((id): id is number => typeof id === "number"),
  );

  return [
    "请为下面这套已保存套装生成穿搭使用建议。",
    "",
    "【套装信息】",
    `套装名称：${outfit.name}`,
    `套装内 itemIds：${outfitItemIds.join("、") || "无"}`,
    `季节：${formatSeasons(outfit.seasons) || "未填写"}`,
    `场景：${(outfit.sceneTags ?? []).join("、") || outfit.activity || outfit.destination || "未填写"}`,
    `风格：${[...(outfit.styleTags ?? []), ...(outfit.pairingTags ?? [])].join("、") || outfit.style || "未填写"}`,
    `适穿温度：${formatTemperature(outfit) || "未填写"}`,
    outfit.notes ? `备注：${outfit.notes}` : "",
    "",
    "【套装内真实衣物】",
    outfitItems.length > 0 ? outfitItems.map(formatOutfitItemForPrompt).join("\n") : "暂无可用衣物",
    "",
    "【可用替换候选】",
    replacementCandidatesByItem.length > 0
      ? replacementCandidatesByItem.map(formatReplacementCandidatesForPrompt).join("\n")
      : "暂无本地规则替换候选",
    "",
    "【白名单】",
    `originalItemId 只能使用这些套装内 id：${outfitItemIds.join("、") || "无"}`,
    `suggestedItemIds 只能使用这些候选 id：${Array.from(new Set(replacementCandidateIds)).join("、") || "无"}`,
    "",
    "请输出以下 JSON 结构：",
    "{",
    '  "summary": "一句话总结这套适合怎么用，20-90个中文字符",',
    '  "suitableScenes": ["最多5个适合场景，每个不超过42个中文字符"],',
    '  "unsuitableScenes": ["最多5个不太适合场景，每个不超过42个中文字符"],',
    '  "strengths": ["最多5条搭配优点，每条不超过42个中文字符"],',
    '  "risks": ["最多5条风险点，每条不超过42个中文字符"],',
    '  "replacementSuggestions": [',
    "    {",
    '      "originalItemId": 套装内真实衣物数字 id,',
    '      "suggestedItemIds": [只能来自对应本地替换候选的真实数字 id],',
    '      "reason": "替换理由，不超过70个中文字符"',
    "    }",
    "  ],",
    '  "missingItems": ["最多5个可选缺失单品，每个不超过42个中文字符"]',
    "}",
    "",
    "判断规则：",
    "1. 先判断适合什么温度、场景、正式度和活动强度。",
    "2. 优点要来自真实衣物属性、套装标签或颜色/季节/风格信息。",
    "3. 风险点要克制，不要制造不存在的问题。",
    "4. 替换建议只能从【可用替换候选】里选择，不要返回套装内已有 itemId。",
    "5. 如果没有足够替换依据，replacementSuggestions 留空。",
    "6. 如果缺少鞋、包、外套等核心组成，可以写入 missingItems；已有的不要重复建议。",
    "7. 输出必须是合法 JSON。",
  ].filter(Boolean).join("\n");
}

export function parseOutfitAiSuggestionJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const json = extractFirstJsonObject(text);
    if (!json) throw new Error("AI 返回不是合法 JSON");
    return JSON.parse(json);
  }
}

function formatOutfitItemForPrompt(item: WardrobeItem): string {
  const colors = getAllColors(item.colors).join("、") || "未填写";
  const scenes = item.styles.join("、") || "未填写";
  const styles = (item.styles ?? []).join("、") || "未填写";
  return [
    `- itemId=${item.id ?? "未知"}，${item.name}`,
    `  分类：${CATEGORY_LABELS[item.category] ?? item.category}${item.subcategory ? ` / ${item.subcategory}` : ""}`,
    `  颜色：${colors}`,
    `  季节：${formatSeasons(item.seasons) || "未填写"}`,
    `  场景：${scenes}`,
    `  风格：${styles}`,
    `  正式度：${item.formality}，保暖度：${item.warmth}，状态：${item.status}`,
  ].join("\n");
}

function formatReplacementCandidatesForPrompt(entry: {
  originalItem: WardrobeItem;
  candidates: OutfitReplacementCandidate[];
}): string {
  const originalId = entry.originalItem.id ?? "未知";
  if (entry.candidates.length === 0) return `- originalItemId=${originalId}，${entry.originalItem.name}：暂无候选`;
  const candidates = entry.candidates.map((candidate) => {
    const item = candidate.item;
    return `  - suggestedItemId=${item.id ?? "未知"}，${item.name}：${candidate.reasons.slice(0, 3).join("，")}，规则分 ${candidate.score}`;
  }).join("\n");
  return `- originalItemId=${originalId}，${entry.originalItem.name}\n${candidates}`;
}

function formatSeasons(seasons: readonly string[] | undefined): string {
  if (!seasons || seasons.length === 0) return "";
  return seasons.map((season) => SEASON_LABELS[season as keyof typeof SEASON_LABELS] ?? season).join("、");
}

function formatTemperature(outfit: SavedOutfit): string {
  const range = outfit.temperatureRange;
  if (!range) return "";
  if (typeof range.minC === "number" && typeof range.maxC === "number") return `${range.minC}-${range.maxC}℃`;
  if (typeof range.minC === "number") return `${range.minC}℃以上`;
  if (typeof range.maxC === "number") return `${range.maxC}℃以下`;
  return "";
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}
