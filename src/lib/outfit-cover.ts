import type { ImageAssetReference, SavedOutfit, WardrobeItem } from "@/lib/types";

export type OutfitCoverMode =
  | "preview"
  | "real_photo"
  | "source_photo"
  | "auto_collage"
  | "fallback"
  | "empty";

export interface OutfitCoverResult {
  mode: OutfitCoverMode;
  asset?: ImageAssetReference;
  itemIds: number[];
}

/**
 * 套装封面统一计算。
 * 主图封面跟随套装记录里的当前 itemIds。
 * 删除/编辑流程负责先把 outfit.itemIds 写成真实剩余组成, 这里不保留已删除单品的信息。
 */
export function getOutfitCover(outfit: SavedOutfit, items: WardrobeItem[]): OutfitCoverResult {
  const itemIds = outfit.itemIds ?? [];
  const validItems = getValidOutfitItems(outfit, items);

  if (outfit.coverImage) return { mode: "preview", asset: outfit.coverImage.asset, itemIds };

  if (validItems.length > 0) {
    return { mode: "auto_collage", itemIds };
  }

  if (itemIds.length > 0) {
    return { mode: "empty", itemIds };
  }

  const realImages = outfit.outfitRealImages ?? [];
  if (realImages.length > 0) {
    return { mode: "real_photo", asset: realImages[0]!.image.asset, itemIds };
  }
  return { mode: "empty", itemIds };
}

export function getValidOutfitItems(outfit: { itemIds?: number[] }, items: WardrobeItem[]): WardrobeItem[] {
  return getExistingOutfitItems(outfit, items).filter((item) => !!item.mainImage);
}

export function getExistingOutfitItems(outfit: { itemIds?: number[] }, items: WardrobeItem[]): WardrobeItem[] {
  const itemMap = new Map<number, WardrobeItem>();
  for (const item of items) {
    if (typeof item.id === "number") itemMap.set(item.id, item);
  }
  return (outfit.itemIds ?? [])
    .map((id) => itemMap.get(id))
    .filter((item): item is WardrobeItem => !!item);
}

export function buildOutfitCoverRefreshPatch(itemIds: number[], items: WardrobeItem[]): Partial<SavedOutfit> {
  void itemIds;
  void items;
  return {
    ...clearOutfitCoverCachePatch(),
  };
}

export function clearOutfitCoverCachePatch(): Partial<SavedOutfit> {
  return {};
}

export function getCollageImageAssets(outfit: SavedOutfit, items: WardrobeItem[]): ImageAssetReference[] {
  return getValidOutfitItems(outfit, items)
    .slice(0, 4)
    .flatMap((item) => item.mainImage ? [item.mainImage.asset] : []);
}

/** Count how many items in the outfit still exist in the wardrobe */
export function countValidItems(outfit: SavedOutfit, items: WardrobeItem[]): number {
  return getExistingOutfitItems(outfit, items).length;
}
