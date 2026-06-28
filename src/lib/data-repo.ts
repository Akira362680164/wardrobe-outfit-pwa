// src/lib/data-repo.ts
// v1.1.7 4B: 本地 Dexie 数据仓库统一入口
// 职责：封装数据读取和既有安全服务调用。
// 本文件不得导入 React。本文件不得导入 UI 组件。本文件不得改变事务语义。
// P0-N01: 账号工作区开启后从 workspace DB 读取，旧 Dexie 降级为回退源。

import type {
  ClosetLocation,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";
import {
  getWishlistPurchasedState,
  getUndoPurchaseRisk,
  type UndoPurchaseRisk,
} from "@/lib/wishlist-conversion";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import { readWorkspaceUiSnapshot } from "@/lib/cloud-sync/workspace-ui-mapper";
import type { WardrobeCascadeDeleteResult, WardrobeCascadeDeleteSource } from "@/lib/wardrobe-cascade-delete";
import { workspaceConvertWishlistToWardrobe, workspaceDeleteGarmentsWithCascade, workspaceDeleteWishlistItems } from "@/lib/workspace-write-commands";

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
  return { items: [], locations: [], outfits: [], wishlistItems: [], outfitPlanEntries: [], outfitCalendarPlans: [], planPackingChecklistItems: [] };
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

export function invalidateWorkspaceSnapshotCache(): void {
  _cachedWorkspaceSnapshot = null;
  _cachedWorkspaceSnapshotTs = 0;
}

export async function getAllItems(): Promise<WardrobeItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.items;
  return [];
}

export async function getAllLocations(): Promise<ClosetLocation[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.locations;
  return [];
}

export async function getAllOutfits(): Promise<SavedOutfit[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfits;
  return [];
}

export async function getAllWishlistItems(): Promise<WishlistItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.wishlistItems;
  return [];
}

export async function getAllOutfitPlanEntries(): Promise<OutfitPlanEntry[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfitPlanEntries;
  return [];
}

export async function getAllOutfitCalendarPlans(): Promise<OutfitCalendarPlan[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfitCalendarPlans;
  return [];
}

export async function getAllPlanPackingChecklistItems(): Promise<PlanPackingChecklistItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.planPackingChecklistItems;
  return [];
}

export async function getItemById(itemId: number): Promise<WardrobeItem | undefined> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.items.find((i) => i.id === itemId);
  return undefined;
}

export async function getOutfitById(outfitId: string): Promise<SavedOutfit | undefined> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.outfits.find((o) => o.id === outfitId);
  return undefined;
}

export async function getWishlistItemById(wishlistItemId: string): Promise<WishlistItem | undefined> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.wishlistItems.find((w) => w.id === wishlistItemId);
  return undefined;
}

export async function getItemsByLocation(locationId: string): Promise<WardrobeItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.items.filter((i) => i.locationId === locationId);
  return [];
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
  return [];
}

export async function getCalendarPlansForDateRange(startDate: string, endDate: string): Promise<OutfitCalendarPlan[]> {
  const plans = await getAllOutfitCalendarPlans();
  return plans.filter((p) => p.startDate <= endDate && p.endDate >= startDate);
}

export async function getPackingItemsByPlanId(planId: string): Promise<PlanPackingChecklistItem[]> {
  const ws = await getWorkspaceSnapshotCached();
  if (ws) return ws.planPackingChecklistItems.filter((p) => p.calendarPlanId === planId);
  return [];
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
  return workspaceDeleteGarmentsWithCascade(input.itemIds, input.source);
}

export async function convertWishlistToWardrobe(input: {
  wishlistItem: WishlistItem;
  locationId: string;
}): Promise<number> {
  return workspaceConvertWishlistToWardrobe(input);
}

export async function undoWishlistPurchaseFromRepo(input: {
  wishlistItem: WishlistItem;
}): Promise<void> {
  const convertedItemId = input.wishlistItem.convertedItemId;
  if (input.wishlistItem.convertedItemDeletedAt) {
    throw new Error("undoWishlistPurchase: 关联衣橱单品已删除");
  }
  if (typeof convertedItemId === "number") {
    await workspaceDeleteGarmentsWithCascade([convertedItemId], "wishlist_undo_purchase");
  }
}

export async function deleteWishlistRecords(
  ids: readonly WishlistItem["id"][],
): Promise<void> {
  if (ids.length === 0) return;
  await workspaceDeleteWishlistItems(ids);
}

export function getWishlistUndoPurchaseRisk(input: {
  convertedItemId: number;
  wardrobeItems: WardrobeItem[];
  outfits: SavedOutfit[];
  wishlistItem: WishlistItem;
}): UndoPurchaseRisk {
  return getUndoPurchaseRisk(input);
}

