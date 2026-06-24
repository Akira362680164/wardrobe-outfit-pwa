// src/lib/wishlist-intake-from-ai.ts
// v1.1.4-dev 种草 AI 识别批次: 从 ShoppingAssessmentCandidate 直接生成 WishlistItem
// v2 (2026-06-24): 字段统一 — 按 v2 spec, AI 候选的 subcategory / colors / material / fitGender / fitNotes
//   / notes 透传为 WishlistItem 字段；price 仍由用户在步骤 3 手动填（不写入）;
//   删除 brand / shopName / currency / sceneTags / styleTags。

import type { ShoppingAssessmentCandidate, WishlistItem } from "@/lib/types";
import { emptyColorInfo, normalizeAiColorInfo } from "@/lib/color-fields";

/**
 * 从买前图片 AI 识别结果（ShoppingAssessmentCandidate）生成种草单品 WishlistItem。
 * 字段映射规则 per Subagent B 任务 spec。
 * v2 行为：
 *  - subcategory 透传（AI 已按 prompt 强制输出 catalog id；万一输出 free-form 中文，UI 走 catalog 反查兜底）
 *  - colors 走 normalizeAiColorInfo 归一为合法 ColorInfo
 *  - material 兜底：空时取 fitAndMaterialGuess
 *  - price 不写入（per v2 spec 5.1：price 是"用户填字段"之一，AI 不识别；测试断言 item.price == null）
 *  - productUrl 不写入（v2 spec: ShoppingAssessmentCandidate 无 productUrl 字段；用户后续填）
 *  - brand / shopName / currency / sceneTags / styleTags 全部不写入
 */
export function wishlistItemFromShoppingCandidate(input: {
  candidate: ShoppingAssessmentCandidate;
  sourceImageDataUrl: string;
  displayImageDataUrl: string;
  thumbnailDataUrl?: string;
  now: string;
}): Omit<WishlistItem, 'id'> {
  const { candidate, sourceImageDataUrl, displayImageDataUrl, thumbnailDataUrl, now } = input;

  const normalizedColors = normalizeAiColorInfo(candidate.colors);

  // material 兜底：空时取 fitAndMaterialGuess
  const resolvedMaterial = candidate.material?.trim() || candidate.fitAndMaterialGuess?.trim();

  return {
    name: candidate.name || "待确认种草单品",
    imageDataUrl: displayImageDataUrl,
    sourceImageDataUrl,
    thumbnailDataUrl,
    category: candidate.category,
    subcategory: candidate.subcategory,
    colors: normalizedColors.colors,
    seasons: candidate.seasonGuess,
    styles: candidate.styles,
    formality: candidate.formality,
    warmth: candidate.warmth,
    temperatureRange: candidate.temperatureRange,
    material: resolvedMaterial,
    fitGender: candidate.fitGender,
    fitNotes: candidate.fitNotes,
    notes: candidate.notes,
    status: "interested",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 生成兜底种草单品（AI 识别完全失败时使用）。
 * 名称写"待确认种草单品"，分类写 tops，颜色为空，状态写 interested。
 */
export function fallbackWishlistItem(input: {
  sourceImageDataUrl: string;
  displayImageDataUrl: string;
  thumbnailDataUrl?: string;
  now: string;
}): Omit<WishlistItem, 'id'> {
  const { sourceImageDataUrl, displayImageDataUrl, thumbnailDataUrl, now } = input;
  return {
    name: "待确认种草单品",
    imageDataUrl: displayImageDataUrl,
    sourceImageDataUrl,
    thumbnailDataUrl,
    category: "tops",
    colors: emptyColorInfo(),
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    status: "interested",
    notes: "未识别",
    createdAt: now,
    updatedAt: now,
  };
}
