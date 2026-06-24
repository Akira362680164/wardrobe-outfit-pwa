// src/lib/thumbnail.ts
// ============================================================
// 缩略图判断 / 统计 (v0.9.43-dev, 批次 1 缩略图基础设施)
// ------------------------------------------------------------
// 用途:
// - needsItemThumbnail: 判断某件衣物是否需要 (重新) 生成缩略图
// - needsReferenceThumbnail: 判断某张参考图是否需要 (重新) 生成缩略图
// - countMissingThumbnails: 统计一批衣物的缩略图情况 (启动轻量统计用, 不解码图片)
//
// 纯函数, 不依赖 React / Dexie / DOM, 可在 unit test 和 SSR 环境下跑。
// 后续批次 4 会基于此实现后台回填队列。
// ============================================================

import {
  CURRENT_THUMBNAIL_VERSION,
  type ReferenceOutfitImage,
  type WardrobeItem,
} from "@/lib/types";

/** 单件衣物缩略图状态统计 */
export interface ThumbnailStats {
  /** 主图总数 (有 imageDataUrl 视为存在, 不计 thumbnail) */
  mainTotal: number;
  /** 主图缺失缩略图数 (含 failed) */
  mainMissing: number;
  /** 参考图总数 */
  referenceTotal: number;
  /** 参考图缺失缩略图数 (含 failed) */
  referenceMissing: number;
  /** 失败状态条目数 (主图 + 参考图) */
  failed: number;
  /** thumbnailVersion 与 CURRENT_THUMBNAIL_VERSION 不一致条目数 (主图 + 参考图) */
  outdatedVersion: number;
}

const EMPTY_STATS: ThumbnailStats = {
  mainTotal: 0,
  mainMissing: 0,
  referenceTotal: 0,
  referenceMissing: 0,
  failed: 0,
  outdatedVersion: 0,
};

/**
 * 判断"是否需要 (重新) 生成缩略图"。
 * 任一条件成立即返回 true:
 *  1. thumbnailDataUrl 缺失或为空
 *  2. thumbnailVersion 与 CURRENT_THUMBNAIL_VERSION 不一致 (规格变了)
 *  3. thumbnailStatus === "failed" (上次生成失败, 应重试)
 *  4. thumbnailStatus === "missing" (尚未生成, 即便 url 字段意外存在, 也重做一次)
 *
 * 其他情况 (ready + version 一致 + 有 url) 视为不需要。
 */
export function needsItemThumbnail(item: Pick<WardrobeItem, "thumbnailDataUrl" | "thumbnailVersion" | "thumbnailStatus">): boolean {
  if (!item.thumbnailDataUrl) return true;
  if (item.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION) return true;
  if (item.thumbnailStatus === "failed") return true;
  if (item.thumbnailStatus === "missing") return true;
  return false;
}

export function needsReferenceThumbnail(
  ref: Pick<ReferenceOutfitImage, "thumbnailDataUrl" | "thumbnailVersion" | "thumbnailStatus">,
): boolean {
  if (!ref.thumbnailDataUrl) return true;
  if (ref.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION) return true;
  if (ref.thumbnailStatus === "failed") return true;
  if (ref.thumbnailStatus === "missing") return true;
  return false;
}

/**
 * 统计一批衣物的缩略图情况。
 * 仅看字段, 不解码图片, 不 canvas, 不写 Dexie (批次 1 提示词 §2 明确要求)。
 * 适合在 refreshState 后 / App 启动后调用, 用于设置页展示 / 启动后台回填。
 */
export function countMissingThumbnails(items: ReadonlyArray<WardrobeItem> | null | undefined): ThumbnailStats {
  if (!Array.isArray(items) || items.length === 0) {
    return { ...EMPTY_STATS };
  }
  const stats: ThumbnailStats = { ...EMPTY_STATS };

  for (const item of items) {
    if (!item) continue;
    // 主图: 有 imageDataUrl 视为"主图存在"
    const hasMain = typeof item.imageDataUrl === "string" && item.imageDataUrl.length > 0;
    if (hasMain) {
      stats.mainTotal += 1;
      if (needsItemThumbnail(item)) {
        stats.mainMissing += 1;
      }
      if (item.thumbnailStatus === "failed") {
        stats.failed += 1;
      }
      if (typeof item.thumbnailVersion === "number" && item.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION) {
        stats.outdatedVersion += 1;
      }
    }

    // 参考图
    const refs = Array.isArray(item.referenceOutfitImages) ? item.referenceOutfitImages : [];
    for (const ref of refs) {
      if (!ref) continue;
      const hasRef = typeof ref.imageDataUrl === "string" && ref.imageDataUrl.length > 0;
      if (!hasRef) continue;
      stats.referenceTotal += 1;
      if (needsReferenceThumbnail(ref)) {
        stats.referenceMissing += 1;
      }
      if (ref.thumbnailStatus === "failed") {
        stats.failed += 1;
      }
      if (typeof ref.thumbnailVersion === "number" && ref.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION) {
        stats.outdatedVersion += 1;
      }
    }
  }

  return stats;
}
