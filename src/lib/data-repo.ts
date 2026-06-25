// src/lib/data-repo.ts
// v1.1.7 4B: 本地 Dexie 数据仓库统一入口
// 职责：封装数据读取和既有安全服务调用。
// 本文件不得导入 React。本文件不得导入 UI 组件。本文件不得改变事务语义。

import { getWardrobeDb, readWardrobeState } from "@/lib/db";
import type {
  ClosetLocation,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";
import { deleteWardrobeItemsWithCascade } from "@/lib/wardrobe-cascade-delete";
import type { WardrobeCascadeDeleteResult, WardrobeCascadeDeleteSource } from "@/lib/wardrobe-cascade-delete";
import {
  convertWishlistItemToWardrobe,
  undoWishlistPurchase,
  getWishlistPurchasedState,
  getUndoPurchaseRisk,
  type UndoPurchaseRisk,
} from "@/lib/wishlist-conversion";

export interface WardrobeDataSnapshot {
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitPlanEntries: OutfitPlanEntry[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
}

export async function getWardrobeSnapshot(): Promise<WardrobeDataSnapshot> {
  const state = await readWardrobeState();
  return {
    items: state.items,
    locations: state.locations,
    outfits: state.outfits || [],
    wishlistItems: state.wishlistItems || [],
    outfitPlanEntries: state.outfitPlanEntries || [],
    outfitCalendarPlans: state.outfitCalendarPlans || [],
    planPackingChecklistItems: state.planPackingChecklistItems || [],
  };
}

export async function getAllItems(): Promise<WardrobeItem[]> {
  return getWardrobeDb().items.toArray();
}

export async function getAllLocations(): Promise<ClosetLocation[]> {
  return getWardrobeDb().locations.toArray();
}

export async function getAllOutfits(): Promise<SavedOutfit[]> {
  return getWardrobeDb().outfits.toArray();
}

export async function getAllWishlistItems(): Promise<WishlistItem[]> {
  return getWardrobeDb().wishlistItems.toArray();
}

export async function getAllOutfitPlanEntries(): Promise<OutfitPlanEntry[]> {
  return getWardrobeDb().outfitPlanEntries.toArray();
}

export async function getAllOutfitCalendarPlans(): Promise<OutfitCalendarPlan[]> {
  return getWardrobeDb().outfitCalendarPlans.toArray();
}

export async function getAllPlanPackingChecklistItems(): Promise<PlanPackingChecklistItem[]> {
  return getWardrobeDb().planPackingChecklistItems.toArray();
}

export async function getItemById(itemId: number): Promise<WardrobeItem | undefined> {
  return getWardrobeDb().items.get(itemId);
}

export async function getOutfitById(outfitId: string): Promise<SavedOutfit | undefined> {
  return getWardrobeDb().outfits.get(outfitId);
}

export async function getWishlistItemById(wishlistItemId: string): Promise<WishlistItem | undefined> {
  return getWardrobeDb().wishlistItems.get(wishlistItemId);
}

export async function getItemsByLocation(locationId: string): Promise<WardrobeItem[]> {
  return getWardrobeDb().items.where("locationId").equals(locationId).toArray();
}

export async function getActiveItemsByLocation(locationId: string): Promise<WardrobeItem[]> {
  const items = await getItemsByLocation(locationId);
  return items.filter((i) => i.status === "active");
}

export async function getOutfitsContainingItem(itemId: number): Promise<SavedOutfit[]> {
  const outfits = await getAllOutfits();
  return outfits.filter((o) => Array.isArray(o.itemIds) && o.itemIds.includes(itemId));
}

export async function getPlanEntriesByOutfitId(outfitId: string): Promise<OutfitPlanEntry[]> {
  const entries = await getAllOutfitPlanEntries();
  return entries.filter((e) => e.outfitId === outfitId || e.actualOutfitId === outfitId);
}

export async function getPlanEntriesByDate(dateKey: string): Promise<OutfitPlanEntry[]> {
  return getWardrobeDb().outfitPlanEntries.where("date").equals(dateKey).toArray();
}

export async function getCalendarPlansForDateRange(startDate: string, endDate: string): Promise<OutfitCalendarPlan[]> {
  const plans = await getAllOutfitCalendarPlans();
  return plans.filter((p) => p.startDate <= endDate && p.endDate >= startDate);
}

export async function getPackingItemsByPlanId(planId: string): Promise<PlanPackingChecklistItem[]> {
  return getWardrobeDb().planPackingChecklistItems.where("calendarPlanId").equals(planId).toArray();
}

/* ------------------------------------------------------------------ */

export function getWishlistPurchasedStateFromRepo(wishlistItem: WishlistItem): ReturnType<typeof getWishlistPurchasedState> {
  return getWishlistPurchasedState(wishlistItem);
}

/*
                            */
/* ------------------------------------------------------------------ */

export async function deleteItemsWithCascade(input: {
  itemIds: number[];
  source: WardrobeCascadeDeleteSource;
}): Promise<WardrobeCascadeDeleteResult> {
  return deleteWardrobeItemsWithCascade({
    db: getWardrobeDb(),
    itemIds: input.itemIds,
    source: input.source,
  });
}

export async function convertWishlistToWardrobe(input: {
  wishlistItem: WishlistItem;
  locationId: string;
}): Promise<number> {
  return convertWishlistItemToWardrobe({
    wishlistItem: input.wishlistItem,
    locationId: input.locationId,
    db: getWardrobeDb(),
  });
}

export async function undoWishlistPurchaseFromRepo(input: {
  wishlistItem: WishlistItem;
}): Promise<void> {
  return undoWishlistPurchase({
    wishlistItem: input.wishlistItem,
    db: getWardrobeDb(),
  });
}

export async function deleteWishlistRecords(
  ids: readonly WishlistItem["id"][],
): Promise<void> {
  if (ids.length === 0) return;
  const db = getWardrobeDb();
  await db.transaction("rw", db.wishlistItems, async () => {
    const records = await db.wishlistItems.bulkGet([...ids]);
    const validIds = records
      .filter((r): r is WishlistItem => r != null)
      .map((r) => r.id);
    if (validIds.length > 0) {
      await db.wishlistItems.bulkDelete(validIds);
    }
  });
}

export function getWishlistUndoPurchaseRisk(input: {
  convertedItemId: number;
  wardrobeItems: WardrobeItem[];
  outfits: SavedOutfit[];
  wishlistItem: WishlistItem;
}): UndoPurchaseRisk {
  return getUndoPurchaseRisk(input);
}

/* ------------------------------------------------------------------ */
/*  wardrobeDataRepo: 全部读 + 写入口聚合 (置于所有函数声明之后)     */
/* ------------------------------------------------------------------ */

export const wardrobeDataRepo = {
  getWardrobeSnapshot,
  getAllItems,
  getAllLocations,
  getAllOutfits,
  getAllWishlistItems,
  getAllOutfitPlanEntries,
  getAllOutfitCalendarPlans,
  getAllPlanPackingChecklistItems,
  getItemById,
  getOutfitById,
  getWishlistItemById,
  getItemsByLocation,
  getActiveItemsByLocation,
  getOutfitsContainingItem,
  getPlanEntriesByOutfitId,
  getPlanEntriesByDate,
  getCalendarPlansForDateRange,
  getPackingItemsByPlanId,
  deleteItemsWithCascade,
  convertWishlistToWardrobe,
  undoWishlistPurchaseFromRepo,
  getWishlistPurchasedStateFromRepo,
  getWishlistUndoPurchaseRisk,
  deleteWishlistRecords,
};
