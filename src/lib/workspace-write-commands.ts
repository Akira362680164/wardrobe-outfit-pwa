"use client";

import { bridgeGarmentCreate, bridgeGarmentDelete, bridgeGarmentUpdate } from "@/lib/cloud-sync/garment-bridge";
import { bridgeOutfitDelete, bridgeOutfitUpsert } from "@/lib/cloud-sync/outfit-bridge";
import { bridgeOutfitPlanDelete, bridgeOutfitPlanUpsert } from "@/lib/cloud-sync/plan-bridge";
import { bridgeWishlistDelete, bridgeWishlistUpsert } from "@/lib/cloud-sync/wishlist-bridge";
import { getWardrobeSnapshot, invalidateWorkspaceSnapshotCache } from "@/lib/data-repo";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import { wishlistToWardrobeItem } from "@/lib/wishlist-conversion";
import { buildSyncedOutfitPatch } from "@/lib/wardrobe-reference-sync";
import type { OutfitCascadeDeleteResult } from "@/lib/outfit-cascade-delete";
import type { WardrobeCascadeDeleteResult, WardrobeCascadeDeleteSource } from "@/lib/wardrobe-cascade-delete";
import type { SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";

export function createLegacyItemId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export async function workspaceUpsertGarment(item: WardrobeItem): Promise<void> {
  const result = await bridgeGarmentUpdate(item);
  if (!result.bridged) throw new Error(result.reason ?? "write_failed");
  invalidateWorkspaceSnapshotCache();
}

export interface WorkspaceUpdateGarmentCropInput {
  itemId: number;
  cropBox: { x: number; y: number; width: number; height: number };
  cropRevision: number;
  thumbnailDataUrl: string;
  thumbnailCropRevision: number;
  updatedAt: string;
}

// ponytail: dedicated crop-only update — reuses bridgeGarmentUpdate but
// with only crop fields changed; imageDataUrl is untouched so bridge
// won't re-generate the original variant asset.
export async function workspaceUpdateGarmentCrop(input: WorkspaceUpdateGarmentCropInput): Promise<void> {
  const snapshot = await getWardrobeSnapshot();
  const item = snapshot.items.find((i) => i.id === input.itemId);
  if (!item) throw new Error(`衣物 id=${input.itemId} 不存在`);

  const updated: WardrobeItem = {
    ...item,
    cropBox: input.cropBox,
    cropRevision: input.cropRevision,
    thumbnailDataUrl: input.thumbnailDataUrl,
    thumbnailCropRevision: input.thumbnailCropRevision,
    updatedAt: input.updatedAt,
  };

  const result = await bridgeGarmentUpdate(updated);
  if (!result.bridged) throw new Error(result.reason ?? "write_failed");
  invalidateWorkspaceSnapshotCache();
}

export async function workspaceUpsertWishlistItem(item: WishlistItem): Promise<void> {
  const result = await bridgeWishlistUpsert(item);
  if (!result.bridged) throw new Error(result.reason ?? "write_failed");
  invalidateWorkspaceSnapshotCache();
}

export async function workspaceUpsertOutfit(outfit: SavedOutfit): Promise<void> {
  const result = await bridgeOutfitUpsert(outfit);
  if (!result.bridged) throw new Error(result.reason ?? "write_failed");
  invalidateWorkspaceSnapshotCache();
}

export async function workspaceDeleteWishlistItems(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const result = await bridgeWishlistDelete(id);
    if (result.reason === "workspace_wishlist_not_found" && typeof console !== "undefined") {
      console.warn("[workspace-write-commands] workspaceDeleteWishlistItems: 工作区中找不到对应种草, 已放过 (id=", id, ")，通常是 v1.x 老数据同步时漏写 legacyWishlistId 导致");
    }
    if (!result.bridged && result.reason !== "workspace_wishlist_not_found") throw new Error(result.reason ?? "write_failed");
  }
  invalidateWorkspaceSnapshotCache();
}

export async function workspaceDeleteOutfitWithCascade(outfitId: string): Promise<OutfitCascadeDeleteResult> {
  const snapshot = await getWardrobeSnapshot();
  const now = new Date().toISOString();
  const result: OutfitCascadeDeleteResult = {
    deletedOutfitIds: [outfitId],
    deletedPlanEntryIds: [],
    deletedPackingItemIds: [],
    keptWornCount: 0,
  };
  const outfit = snapshot.outfits.find((o) => o.id === outfitId);
  const outfitName = outfit?.name || "";
  for (const entry of snapshot.outfitPlanEntries) {
    const referencesOutfit = entry.outfitId === outfitId || entry.actualOutfitId === outfitId;
    if (!referencesOutfit) continue;
    if (entry.status === "worn") {
      result.keptWornCount++;
      await bridgeOutfitPlanUpsert({
        ...entry,
        outfitId: entry.outfitId === outfitId ? undefined : entry.outfitId,
        actualOutfitId: entry.actualOutfitId === outfitId ? undefined : entry.actualOutfitId,
        title: entry.title || outfitName || undefined,
        updatedAt: now,
      });
    } else {
      await bridgeOutfitPlanDelete(entry.id);
      result.deletedPlanEntryIds.push(entry.id);
    }
  }
  const deleted = await bridgeOutfitDelete(outfitId);
  if (!deleted.bridged && deleted.reason !== "workspace_outfit_not_found") throw new Error(deleted.reason ?? "write_failed");
  invalidateWorkspaceSnapshotCache();
  return result;
}

export async function workspaceDeleteGarmentsWithCascade(
  itemIds: number[],
  source: WardrobeCascadeDeleteSource,
): Promise<WardrobeCascadeDeleteResult> {
  const snapshot = await getWardrobeSnapshot();
  const now = new Date().toISOString();
  const deletedItemIds = Array.from(new Set(itemIds.filter((id) => Number.isFinite(id))));
  const deletedItemIdSet = new Set(deletedItemIds);
  const result: WardrobeCascadeDeleteResult = {
    deletedItemIds,
    updatedOutfitIds: [],
    deletedOutfitIds: [],
    deletedPlanEntryIds: [],
    deletedPackingItemIds: [],
    markedDeletedWishlistIds: [],
    clearedWishlistConvertedIds: [],
  };
  if (deletedItemIds.length === 0) return result;

  const remainingItems = snapshot.items.filter((item) => typeof item.id === "number" && !deletedItemIdSet.has(item.id));
  const deletedOutfitIds = new Set<string>();
  for (const outfit of snapshot.outfits) {
    const nextItemIds = outfit.itemIds.filter((id) => !deletedItemIdSet.has(id));
    if (nextItemIds.length === outfit.itemIds.length) continue;
    if (nextItemIds.length >= 2) {
      await workspaceUpsertOutfit({
        ...outfit,
        itemIds: nextItemIds,
        ...buildSyncedOutfitPatch({ ...outfit, itemIds: nextItemIds }, remainingItems, now),
      });
      result.updatedOutfitIds.push(outfit.id);
    } else {
      await bridgeOutfitDelete(outfit.id);
      deletedOutfitIds.add(outfit.id);
      result.deletedOutfitIds.push(outfit.id);
    }
  }

  for (const entry of snapshot.outfitPlanEntries) {
    const referencesDeletedOutfit = Boolean(
      (entry.outfitId && deletedOutfitIds.has(entry.outfitId)) ||
      (entry.actualOutfitId && deletedOutfitIds.has(entry.actualOutfitId)),
    );
    const onlyDeletedDetachedItems = Array.isArray(entry.itemIds) && entry.itemIds.length > 0 && !entry.outfitId && entry.itemIds.every((id) => deletedItemIdSet.has(id));
    if (referencesDeletedOutfit || onlyDeletedDetachedItems) {
      await bridgeOutfitPlanDelete(entry.id);
      result.deletedPlanEntryIds.push(entry.id);
    }
  }

  for (const itemId of deletedItemIds) {
    const deleted = await bridgeGarmentDelete(itemId);
    if (!deleted.bridged && deleted.reason !== "workspace_garment_not_found") throw new Error(deleted.reason ?? "write_failed");
  }

  for (const wishlistItem of snapshot.wishlistItems) {
    if (wishlistItem.convertedItemId == null || !deletedItemIdSet.has(wishlistItem.convertedItemId)) continue;
    if (source === "wishlist_undo_purchase") {
      await workspaceUpsertWishlistItem({
        ...wishlistItem,
        status: "interested",
        convertedItemId: undefined,
        convertedAt: undefined,
        convertedItemDeletedAt: undefined,
        updatedAt: now,
      });
      result.clearedWishlistConvertedIds.push(wishlistItem.id);
    } else {
      await workspaceUpsertWishlistItem({ ...wishlistItem, convertedItemDeletedAt: now, updatedAt: now });
      result.markedDeletedWishlistIds.push(wishlistItem.id);
    }
  }

  invalidateWorkspaceSnapshotCache();
  return result;
}

export async function workspaceConvertWishlistToWardrobe(input: {
  wishlistItem: WishlistItem;
  locationId: string;
}): Promise<number> {
  const now = new Date().toISOString();
  const id = createLegacyItemId();
  const garment = { ...wishlistToWardrobeItem({ wishlistItem: input.wishlistItem, locationId: input.locationId, now }), id } as WardrobeItem;
  const wishlistItem: WishlistItem = {
    ...input.wishlistItem,
    status: "archived",
    convertedItemId: id,
    convertedAt: now,
    convertedItemDeletedAt: undefined,
    updatedAt: now,
  };
  await workspaceUpsertGarment(garment);
  await workspaceUpsertWishlistItem(wishlistItem);
  return id;
}

export async function clearAllWorkspaceData(): Promise<void> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return;
  const db = getAccountWorkspaceDb(ctx.workspace);
  await db.garments.clear();
  await db.outfits.clear();
  await db.outfitItems.clear();
  await db.wishlistItems.clear();
  await db.wearEvents.clear();
  await db.tripPlans.clear();
  await db.outfitPlans.clear();
  await db.locations.clear();
  await db.profiles.clear();
  invalidateWorkspaceSnapshotCache();
}
