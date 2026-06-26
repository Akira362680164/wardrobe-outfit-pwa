// src/lib/data-repo.ts
// v1.1.7 4B: 本地 Dexie 数据仓库统一入口
// 职责：封装数据读取和既有安全服务调用。
// 本文件不得导入 React。本文件不得导入 UI 组件。本文件不得改变事务语义。
// P0-N01: 账号工作区开启后从 workspace DB 读取，旧 Dexie 降级为回退源。

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
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import { readWorkspaceUiSnapshot, type WorkspaceUiSnapshot } from "@/lib/cloud-sync/workspace-ui-mapper";

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
  const ctx = await loadCloudBridgeContext();
  if (ctx) {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const snapshot = await readWorkspaceUiSnapshot(db);
    return {
      items: snapshot.items,
      locations: snapshot.locations,
      outfits: snapshot.outfits,
      wishlistItems: snapshot.wishlistItems,
      outfitPlanEntries: snapshot.outfitPlanEntries,
      outfitCalendarPlans: snapshot.outfitCalendarPlans,
      planPackingChecklistItems: snapshot.planPackingChecklistItems,
    };
  }
  // 无工作区时降级到旧 Dexie
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

// P0-N01: 工作区快照缓存（同次 refreshState 内复用，避免重复 loadCloudBridgeContext）
let _cachedWorkspaceSnapshot: WardrobeDataSnapshot | null = null;
let _cachedWorkspaceSnapshotTs = 0;
const WORKSPACE_SNAPSHOT_TTL_MS = 200;

async function getWorkspaceSnapshotCached(): Promise<WardrobeDataSnapshot | null> {
  const now = Date.now();
  if (_cachedWorkspaceSnapshot && now - _cachedWorkspaceSnapshotTs < WORKSPACE_SNAPSHOT_TTL_MS) {
    return _cachedWorkspaceSnapshot;
  }
  const ctx = await loadCloudBridgeContext();
  if (!ctx) {
    _cachedWorkspaceSnapshot = null;
    return null;
  }
  const db = getAccountWorkspaceDb(ctx.workspace);
  const snapshot = await readWorkspaceUiSnapshot(db);
  _cachedWorkspaceSnapshot = {
    items: snapshot.items,
    locations: snapshot.locations,
    outfits: snapshot.outfits,
    wishlistItems: snapshot.wishlistItems,
    outfitPlanEntries: snapshot.outfitPlanEntries,
    outfitCalendarPlans: snapshot.outfitCalendarPlans,
    planPackingChecklistItems: snapshot.planPackingChecklistItems,
  };
  _cachedWorkspaceSnapshotTs = now;
  return _cachedWorkspaceSnapshot;
}

function invalidateWorkspaceSnapshotCache(): void {
  _cachedWorkspaceSnapshot = null;
  _cachedWorkspaceSnapshotTs = 0;
}

export async function getAllItems(): Promise<WardrobeItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.items;
  return getWardrobeDb().items.toArray();
}

export async function getAllLocations(): Promise<ClosetLocation[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.locations;
  return getWardrobeDb().locations.toArray();
}

export async function getAllOutfits(): Promise<SavedOutfit[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfits;
  return getWardrobeDb().outfits.toArray();
}

export async function getAllWishlistItems(): Promise<WishlistItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.wishlistItems;
  return getWardrobeDb().wishlistItems.toArray();
}

export async function getAllOutfitPlanEntries(): Promise<OutfitPlanEntry[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfitPlanEntries;
  return getWardrobeDb().outfitPlanEntries.toArray();
}

export async function getAllOutfitCalendarPlans(): Promise<OutfitCalendarPlan[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfitCalendarPlans;
  return getWardrobeDb().outfitCalendarPlans.toArray();
}

export async function getAllPlanPackingChecklistItems(): Promise<PlanPackingChecklistItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.planPackingChecklistItems;
  return getWardrobeDb().planPackingChecklistItems.toArray();
}

export async function getItemById(itemId: number): Promise<WardrobeItem | undefined> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.items.find((i) => i.id === itemId);
  return getWardrobeDb().items.get(itemId);
}

export async function getOutfitById(outfitId: string): Promise<SavedOutfit | undefined> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfits.find((o) => o.id === outfitId);
  return getWardrobeDb().outfits.get(outfitId);
}

export async function getWishlistItemById(wishlistItemId: string): Promise<WishlistItem | undefined> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.wishlistItems.find((w) => w.id === wishlistItemId);
  return getWardrobeDb().wishlistItems.get(wishlistItemId);
}

export async function getItemsByLocation(locationId: string): Promise<WardrobeItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.items.filter((i) => i.locationId === locationId);
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
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfitPlanEntries.filter((e) => e.date === dateKey);
  return getWardrobeDb().outfitPlanEntries.where("date").equals(dateKey).toArray();
}

export async function getCalendarPlansForDateRange(startDate: string, endDate: string): Promise<OutfitCalendarPlan[]> {
  const plans = await getAllOutfitCalendarPlans();
  return plans.filter((p) => p.startDate <= endDate && p.endDate >= startDate);
}

export async function getPackingItemsByPlanId(planId: string): Promise<PlanPackingChecklistItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.planPackingChecklistItems.filter((p) => p.calendarPlanId === planId);
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
