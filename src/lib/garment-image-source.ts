// src/lib/garment-image-source.ts
// ============================================================
// 衣物图片组派生（v0.9.32-dev）
// ------------------------------------------------------------
// 用途: 瀑布流卡片 + 详情页 + 编辑页共用同一套"主图 + 参考穿搭图"派生逻辑。
// 不依赖 React / Dexie / DOM,纯函数,可在 unit test 和 server 环境下跑。
//
// 派生规则:
// - 第 0 张永远是衣物主图: item.imageDataUrl
// - 后续图片来自两个来源（按顺序、去重、过滤空值）:
//   1) item.referenceOutfitImages (手动添加的参考穿搭图,按 createdAt 升序)
//   2) outfits 数组中包含 item.id 的所有 SavedOutfit (按 updatedAt 倒序)
// - 关联套装条目 (renderKind: "outfit") 只派生引用,真实封面由调用方通过
//   OutfitCover/getOutfitCover 动态渲染,静态 previewImageDataUrl 不再代表
//   关联套装当前组成。
// - 主图和手动灵感图继续按图片 URL 去重; 套装按 outfit.id 去重。
// - 过滤: 跳过空字符串 / 非 data:http(s) URL
//
// 设计要点:
// - 纯函数,不修改入参,不调用 React/Dexie/DOM
// - 返回 GarmentImageEntry[],包含 source/renderKind 标记,父级可按需展示
// - 兼容老数据: item.referenceOutfitImages 缺失时按 [] 处理
// ============================================================

import type { CroppedImageReference, SavedOutfit, WardrobeItem } from "@/lib/types";

export type GarmentImageSource =
  | "main"
  | "reference_outfit"
  | "saved_outfit";

export interface GarmentImageEntry {
  image?: CroppedImageReference;
  /** 来源标记,父级可按需展示"主图 / 参考"角标 */
  source: GarmentImageSource;
  /** 渲染方式: image = 直接渲染图片; outfit = 通过 OutfitCover 动态渲染 */
  renderKind: "image" | "outfit";
  /** source === "reference_outfit" 时: 手动参考图 id（用于后续裁切/删除/重排） */
  refId?: string;
  /** source === "saved_outfit" 时: outfit id */
  outfitId?: string;
  /** 排序/筛选用的 createdAt 字段。source === "main" 时用 item.createdAt;其他用各自的 createdAt/updatedAt */
  createdAt: string;
}

const EMPTY_ENTRY: GarmentImageEntry = {
  source: "main",
  renderKind: "image",
  createdAt: "",
};

function safeTimestamp(value: string | undefined, fallback: string): string {
  if (typeof value === "string" && value) return value;
  return fallback;
}

/**
 * 派生某件衣物的图片列表（主图 + 参考穿搭图 + SavedOutfit 关联图）。
 *
 * @param item  衣物记录；null/undefined 或主图无效时返回空数组
 * @param outfits SavedOutfit 数组（不限顺序，内部过滤）
 * @returns  按展示顺序的图片列表；主图永远是 [0]
 */
export function deriveGarmentImageList(
  item: WardrobeItem | null | undefined,
  outfits: ReadonlyArray<SavedOutfit>,
): GarmentImageEntry[] {
  if (!item) return [];
  const now = new Date().toISOString();
  if (!item.mainImage) return [];

  const result: GarmentImageEntry[] = [
    {
      image: item.mainImage,
      source: "main",
      renderKind: "image",
      createdAt: safeTimestamp(item.createdAt, now),
    },
  ];
  const seen = new Set<string>([item.mainImage.asset.assetId]);

  // 1) 手动添加的参考穿搭图
  const manualRefs = Array.isArray(item.referenceOutfitImages)
    ? [...item.referenceOutfitImages]
    : [];
  // 按 createdAt 升序（早添加的先展示）
  manualRefs.sort((a, b) => {
    const ta = safeTimestamp(a.createdAt, "");
    const tb = safeTimestamp(b.createdAt, "");
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
  for (const ref of manualRefs) {
    if (seen.has(ref.image.asset.assetId)) continue;
    seen.add(ref.image.asset.assetId);
    result.push({
      image: ref.image,
      source: "reference_outfit",
      renderKind: "image",
      refId: ref.id,
      createdAt: safeTimestamp(ref.createdAt, now),
    });
  }

  // 2) SavedOutfit 派生的套装引用
  // 关联套装只派生引用 (renderKind: "outfit"), 真实封面由调用方通过
  // OutfitCover/getOutfitCover 动态渲染。静态 previewImageDataUrl 和
  // coverImageDataUrl 不再作为瀑布流套装页的权威展示源。
  if (Array.isArray(outfits) && outfits.length > 0 && typeof item.id === "number") {
    const targetId = item.id;
    const related = outfits.filter(
      (o) => Array.isArray(o.itemIds) && o.itemIds.includes(targetId),
    );
    // 按 updatedAt 倒序（新的在前）
    related.sort((a, b) => {
      const ta = safeTimestamp(b.updatedAt, "");
      const tb = safeTimestamp(a.updatedAt, "");
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    });
    const seenOutfitIds = new Set<string>();
    for (const outfit of related) {
      // 按 outfit.id 去重,不再按图片 URL 去重
      if (seenOutfitIds.has(outfit.id)) continue;
      seenOutfitIds.add(outfit.id);
      result.push({
        source: "saved_outfit",
        renderKind: "outfit",
        outfitId: outfit.id,
        createdAt: safeTimestamp(outfit.updatedAt, safeTimestamp(outfit.createdAt, now)),
      });
    }
  }

  return result;
}

/**
 * 工具函数：判断 entry 是否主图
 */
export function isMainImageEntry(entry: GarmentImageEntry | undefined | null): boolean {
  return !!entry && entry.source === "main";
}

/**
 * 工具函数：判断某个 entry 是否来自手动添加的参考图
 */
export function isReferenceOutfitEntry(entry: GarmentImageEntry | undefined | null): boolean {
  return !!entry && entry.source === "reference_outfit";
}

// 默认导出空 entry,避免 React 组件意外渲染时 source 不存在
export const EMPTY_GARMENT_IMAGE_ENTRY: GarmentImageEntry = { ...EMPTY_ENTRY };
