/**
 * 识别结果映射工具：将 GarmentTagResult 转换为编辑草稿的可识别属性补丁。
 *
 * 单品和种草重新识别共用同一套字段映射规则，禁止在页面内重复定义。
 */

import type { GarmentTagResult } from "@/lib/types";

export interface WardrobeEditRecognitionPatch {
  category: GarmentTagResult["category"];
  subcategory?: string;
  colors: GarmentTagResult["colors"];
  seasons: GarmentTagResult["seasons"];
  styles: GarmentTagResult["styles"];
  temperatureRange: GarmentTagResult["temperatureRange"];
  formality: GarmentTagResult["formality"];
  warmth: GarmentTagResult["warmth"];
  material?: string;
  fitGender?: GarmentTagResult["fitGender"];
  fitNotes?: string;
  aiConfidence: GarmentTagResult["confidence"];
  needsReview: GarmentTagResult["needsReview"];
  /** 名称：仅当当前名称为空时填入 AI 建议 */
  name?: string;
  /** 备注：仅当当前备注为空时填入 AI 备注 */
  notes?: string;
}

/**
 * 从 GarmentTagResult 构建单品编辑页识别补丁。
 * 名称和备注的「仅空值填充」规则由调用方负责：传入当前非空名称/备注时本函数不会覆盖。
 */
export function buildWardrobeEditRecognitionPatch(
  tag: GarmentTagResult,
  opts?: { currentName?: string; currentNotes?: string },
): WardrobeEditRecognitionPatch {
  return {
    category: tag.category,
    subcategory: tag.subcategory,
    colors: tag.colors,
    seasons: tag.seasons,
    styles: tag.styles,
    temperatureRange: tag.temperatureRange,
    formality: tag.formality,
    warmth: tag.warmth,
    material: tag.material,
    fitGender: tag.fitGender,
    fitNotes: tag.fitNotes,
    aiConfidence: tag.confidence,
    needsReview: tag.needsReview,
    name: (opts?.currentName != null && opts.currentName.trim() !== "") ? undefined : (tag.candidateNames[0]),
    notes: (opts?.currentNotes != null && opts.currentNotes.trim() !== "") ? undefined : tag.notes,
  };
}

/**
 * 从 GarmentTagResult 构建种草编辑页识别补丁。
 * 输入统一使用 GarmentTagResult，输出只包含允许 AI 更新的字段。
 */
export function buildWishlistEditRecognitionPatch(
  tag: GarmentTagResult,
  opts?: { currentName?: string; currentNotes?: string },
): WardrobeEditRecognitionPatch {
  return buildWardrobeEditRecognitionPatch(tag, opts);
}
