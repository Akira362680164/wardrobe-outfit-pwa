// src/lib/repository/wardrobe-repository.ts
// v2.0.1 fix: 统一写入口 — 旧 Dexie 写入 + 等待 bridge 结果 + 刷新顺序
// ponytail: 单文件仓库，不再 void bridge，统一返回 RepoResult

import { getWardrobeDb } from "@/lib/db";
import type {
  ClosetLocation,
  GarmentStatus,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";
import { deleteWardrobeItemsWithCascade, type WardrobeCascadeDeleteResult, type WardrobeCascadeDeleteSource } from "@/lib/wardrobe-cascade-delete";
import { deleteOutfitWithCascade, type OutfitCascadeDeleteResult } from "@/lib/outfit-cascade-delete";
import { convertWishlistItemToWardrobe, undoWishlistPurchase, getUndoPurchaseRisk, type UndoPurchaseRisk } from "@/lib/wishlist-conversion";
import {
  addOutfitToDate,
  cancelActualOutfitWearForDate,
  type AddOutfitToDateInput,
  type OutfitWearSyncResult,
} from "@/lib/outfit-wear-sync";
import { bridgeGarmentCreate, bridgeGarmentDelete, bridgeGarmentUpdate } from "@/lib/cloud-sync/garment-bridge";
import { bridgeWishlistUpsert, bridgeWishlistDelete } from "@/lib/cloud-sync/wishlist-bridge";
import { bridgeOutfitUpsert, bridgeOutfitDelete } from "@/lib/cloud-sync/outfit-bridge";
import { bridgeOutfitPlanUpsert, bridgeOutfitPlanDelete, bridgeTripPlanUpsert, bridgeTripPlanDelete, bridgeTripPlanWithChecklist } from "@/lib/cloud-sync/plan-bridge";
import { buildSyncedOutfitPatch } from "@/lib/wardrobe-reference-sync";
import { invalidateWorkspaceSnapshotCache } from "@/lib/data-repo";

export interface RepoResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

function ok<T>(data?: T): RepoResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): RepoResult<T> {
  return { ok: false, error };
}

/* ------------------------------------------------------------------ */
/*  Garment commands                                                   */
/* ------------------------------------------------------------------ */

export async function repoCreateGarment(
  item: Omit<WardrobeItem, "id">,
): Promise<RepoResult<number>> {
  try {
    const db = getWardrobeDb();
    const newId = await db.items.add(item as Omit<WardrobeItem, "id">);
    const created: WardrobeItem = { ...item, id: newId } as WardrobeItem;
    const result = await bridgeGarmentCreate(created);
    invalidateWorkspaceSnapshotCache();
    if (!result.bridged && result.reason && result.reason !== "no_workspace") {
      console.warn("[repo] bridgeGarmentCreate failed:", result.reason);
    }
    return ok(newId);
  } catch (err) {
    return fail("保存单品失败，请重试");
  }
}

export async function repoUpdateGarment(
  id: number,
  patch: Partial<WardrobeItem>,
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.items.update(id, patch);
    const updated = await db.items.get(id);
    if (updated) {
      const result = await bridgeGarmentUpdate(updated);
      if (!result.bridged && result.reason && result.reason !== "no_workspace") {
        console.warn("[repo] bridgeGarmentUpdate failed:", result.reason);
      }
    }
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("更新单品失败，请重试");
  }
}

export async function repoDeleteGarments(
  ids: number[],
  source: WardrobeCascadeDeleteSource = "manual_delete",
): Promise<RepoResult<WardrobeCascadeDeleteResult>> {
  try {
    const db = getWardrobeDb();
    const result = await deleteWardrobeItemsWithCascade({ db, itemIds: ids, source });
    for (const itemId of result.deletedItemIds) void bridgeGarmentDelete(itemId);
    for (const outfitId of result.updatedOutfitIds) {
      const outfit = await db.outfits.get(outfitId);
      if (outfit) void bridgeOutfitUpsert(outfit);
    }
    for (const outfitId of result.deletedOutfitIds) void bridgeOutfitDelete(outfitId);
    for (const entryId of result.deletedPlanEntryIds) void bridgeOutfitPlanDelete(entryId);
    for (const wishlistId of result.clearedWishlistConvertedIds) {
      const wishItem = await db.wishlistItems.get(wishlistId);
      if (wishItem) void bridgeWishlistUpsert(wishItem);
    }
    invalidateWorkspaceSnapshotCache();
    return ok(result);
  } catch (err) {
    return fail("删除单品失败，请重试");
  }
}

export async function repoUpdateItemStatus(
  item: WardrobeItem,
  status: GarmentStatus,
): Promise<RepoResult<void>> {
  if (typeof item.id !== "number") return fail("单品 ID 无效");
  const updatedAt = new Date().toISOString();
  return repoUpdateGarment(item.id, { status, updatedAt });
}

/* ------------------------------------------------------------------ */
/*  Wishlist commands                                                  */
/* ------------------------------------------------------------------ */

export async function repoCreateWishlistItem(
  item: Omit<WishlistItem, "id">,
): Promise<RepoResult<string>> {
  try {
    const db = getWardrobeDb();
    const newId = await db.wishlistItems.add(item as unknown as WishlistItem);
    const created: WishlistItem = { ...item, id: newId } as WishlistItem;
    const result = await bridgeWishlistUpsert(created);
    invalidateWorkspaceSnapshotCache();
    if (!result.bridged && result.reason && result.reason !== "no_workspace") {
      console.warn("[repo] bridgeWishlistUpsert failed:", result.reason);
    }
    return ok(newId);
  } catch (err) {
    return fail("保存种草商品失败，请重试");
  }
}

export async function repoUpdateWishlistItem(
  id: string,
  patch: Partial<WishlistItem>,
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.wishlistItems.update(id, patch);
    const updated = await db.wishlistItems.get(id);
    if (updated) {
      const result = await bridgeWishlistUpsert(updated);
      if (!result.bridged && result.reason && result.reason !== "no_workspace") {
        console.warn("[repo] bridgeWishlistUpsert failed:", result.reason);
      }
    }
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("更新种草商品失败，请重试");
  }
}

export async function repoDeleteWishlistItems(
  ids: string[],
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.transaction("rw", db.wishlistItems, async () => {
      const records = await db.wishlistItems.bulkGet([...ids]);
      const validIds = records.filter((r): r is WishlistItem => r != null).map((r) => r.id);
      if (validIds.length > 0) await db.wishlistItems.bulkDelete(validIds);
    });
    for (const id of ids) void bridgeWishlistDelete(id);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("删除种草商品失败，请重试");
  }
}

export async function repoConvertWishlistItem(
  wishlistItem: WishlistItem,
  locationId: string,
): Promise<RepoResult<number>> {
  try {
    const db = getWardrobeDb();
    const newItemId = await convertWishlistItemToWardrobe({ wishlistItem, locationId, db });
    const created = await db.items.get(newItemId);
    if (created) void bridgeGarmentCreate(created);
    const updatedWish = await db.wishlistItems.get(wishlistItem.id);
    if (updatedWish) void bridgeWishlistUpsert(updatedWish);
    invalidateWorkspaceSnapshotCache();
    return ok(newItemId);
  } catch (err) {
    return fail("转入衣橱失败，请重试");
  }
}

export interface RepoUndoPurchaseResult {
  deletedGarmentIds: number[];
  updatedOutfitIds: string[];
  deletedOutfitIds: string[];
  updatedPlanEntryIds: string[];
  deletedPlanEntryIds: string[];
  preservedWearSnapshots: number;
}

export async function repoUndoWishlistPurchase(
  wishlistItem: WishlistItem,
): Promise<RepoResult<RepoUndoPurchaseResult>> {
  try {
    const db = getWardrobeDb();
    // 先收集级联信息
    const convertedItemId = wishlistItem.convertedItemId;
    let cascadeResult: WardrobeCascadeDeleteResult | null = null;
    let preservedWearSnapshots = 0;

    if (typeof convertedItemId === "number") {
      const item = await db.items.get(convertedItemId);
      if (!item) return fail("关联衣橱单品不存在");
      cascadeResult = await deleteWardrobeItemsWithCascade({
        db,
        itemIds: [convertedItemId],
        source: "wishlist_undo_purchase",
      });
      preservedWearSnapshots = item.wornDates?.length ?? 0;
    }

    const now = new Date().toISOString();
    await db.transaction("rw", db.wishlistItems, async () => {
      await db.wishlistItems.update(wishlistItem.id, {
        status: "interested",
        convertedItemId: undefined,
        convertedAt: undefined,
        convertedItemDeletedAt: undefined,
        updatedAt: now,
      });
    });

    // 同步级联变更到工作区
    if (cascadeResult) {
      for (const itemId of cascadeResult.deletedItemIds) void bridgeGarmentDelete(itemId);
      for (const outfitId of cascadeResult.updatedOutfitIds) {
        const outfit = await db.outfits.get(outfitId);
        if (outfit) void bridgeOutfitUpsert(outfit);
      }
      for (const outfitId of cascadeResult.deletedOutfitIds) void bridgeOutfitDelete(outfitId);
      for (const entryId of cascadeResult.deletedPlanEntryIds) void bridgeOutfitPlanDelete(entryId);
    }

    const updatedWish = await db.wishlistItems.get(wishlistItem.id);
    if (updatedWish) void bridgeWishlistUpsert(updatedWish);

    invalidateWorkspaceSnapshotCache();
    return ok({
      deletedGarmentIds: cascadeResult?.deletedItemIds ?? [],
      updatedOutfitIds: cascadeResult?.updatedOutfitIds ?? [],
      deletedOutfitIds: cascadeResult?.deletedOutfitIds ?? [],
      updatedPlanEntryIds: [],
      deletedPlanEntryIds: cascadeResult?.deletedPlanEntryIds ?? [],
      preservedWearSnapshots,
    });
  } catch (err) {
    return fail("撤销购买失败，请重试");
  }
}

export { getUndoPurchaseRisk, type UndoPurchaseRisk };

/* ------------------------------------------------------------------ */
/*  Outfit commands                                                    */
/* ------------------------------------------------------------------ */

export async function repoCreateOutfit(
  outfit: Omit<SavedOutfit, "id">,
): Promise<RepoResult<string>> {
  try {
    const db = getWardrobeDb();
    const newId = await db.outfits.add(outfit as unknown as SavedOutfit);
    const created: SavedOutfit = { ...outfit, id: newId } as SavedOutfit;
    void bridgeOutfitUpsert(created);
    invalidateWorkspaceSnapshotCache();
    return ok(newId);
  } catch (err) {
    return fail("保存套装失败，请重试");
  }
}

export async function repoUpdateOutfit(
  id: string,
  patch: Partial<SavedOutfit>,
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.outfits.update(id, patch);
    const updated = await db.outfits.get(id);
    if (updated) void bridgeOutfitUpsert(updated);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("更新套装失败，请重试");
  }
}

export async function repoDeleteOutfit(
  outfitId: string,
): Promise<RepoResult<OutfitCascadeDeleteResult>> {
  try {
    const db = getWardrobeDb();
    const result = await deleteOutfitWithCascade({ db, outfitId });
    void bridgeOutfitDelete(outfitId);
    for (const entryId of result.deletedPlanEntryIds) void bridgeOutfitPlanDelete(entryId);
    invalidateWorkspaceSnapshotCache();
    return ok(result);
  } catch (err) {
    return fail("删除套装失败，请重试");
  }
}

/* ------------------------------------------------------------------ */
/*  Plan commands                                                      */
/* ------------------------------------------------------------------ */

export async function repoUpsertOutfitPlanEntry(
  entry: OutfitPlanEntry,
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.outfitPlanEntries.put(entry);
    void bridgeOutfitPlanUpsert(entry);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("保存计划失败，请重试");
  }
}

export async function repoDeleteOutfitPlanEntry(
  entryId: string,
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.outfitPlanEntries.delete(entryId);
    void bridgeOutfitPlanDelete(entryId);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("删除计划失败，请重试");
  }
}

export async function repoUpsertTripPlan(
  plan: OutfitCalendarPlan,
  checklistItems: PlanPackingChecklistItem[] = [],
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.outfitCalendarPlans.put(plan);
    void bridgeTripPlanUpsert(plan, checklistItems);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("保存旅行计划失败，请重试");
  }
}

export async function repoDeleteTripPlan(
  planId: string,
): Promise<RepoResult<void>> {
  try {
    const db = getWardrobeDb();
    await db.outfitCalendarPlans.delete(planId);
    void bridgeTripPlanDelete(planId);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("删除旅行计划失败，请重试");
  }
}

export async function repoSyncTripPlanChecklist(
  planId: string,
): Promise<RepoResult<void>> {
  try {
    void bridgeTripPlanWithChecklist(planId);
    return ok();
  } catch (err) {
    return fail("同步打包清单失败，请重试");
  }
}

/* ------------------------------------------------------------------ */
/*  Wear commands                                                      */
/* ------------------------------------------------------------------ */

export async function repoRecordWear(
  input: AddOutfitToDateInput,
): Promise<RepoResult<OutfitWearSyncResult>> {
  try {
    const result = await addOutfitToDate(input);
    // bridge the wear sync result — bridge individual plan entries and outfits
    const db = getWardrobeDb();
    for (const outfitId of result.updatedOutfitIds) {
      const outfit = await db.outfits.get(outfitId);
      if (outfit) void bridgeOutfitUpsert(outfit);
    }
    for (const entryId of result.touchedEntryIds ?? []) {
      const entry = await db.outfitPlanEntries.get(entryId);
      if (entry) void bridgeOutfitPlanUpsert(entry);
    }
    for (const entryId of result.deletedEntryIds ?? []) {
      void bridgeOutfitPlanDelete(entryId);
    }
    for (const itemId of result.updatedItemIds) {
      const item = await db.items.get(itemId);
      if (item) void bridgeGarmentUpdate(item);
    }
    invalidateWorkspaceSnapshotCache();
    return ok(result);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "记录穿着失败，请重试");
  }
}

export async function repoCancelWear(
  dateKey: string,
  outfitId: string,
  todayKey: string,
): Promise<RepoResult<OutfitWearSyncResult>> {
  try {
    const result = await cancelActualOutfitWearForDate({ dateKey, outfitId, todayKey });
    const db = getWardrobeDb();
    for (const oId of result.updatedOutfitIds) {
      const outfit = await db.outfits.get(oId);
      if (outfit) void bridgeOutfitUpsert(outfit);
    }
    for (const entryId of result.touchedEntryIds ?? []) {
      const entry = await db.outfitPlanEntries.get(entryId);
      if (entry) void bridgeOutfitPlanUpsert(entry);
    }
    for (const entryId of result.deletedEntryIds ?? []) {
      void bridgeOutfitPlanDelete(entryId);
    }
    for (const itemId of result.updatedItemIds) {
      const item = await db.items.get(itemId);
      if (item) void bridgeGarmentUpdate(item);
    }
    invalidateWorkspaceSnapshotCache();
    return ok(result);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "取消穿着失败，请重试");
  }
}

/* ------------------------------------------------------------------ */
/*  Media commands (inspiration / real images)                         */
/* ------------------------------------------------------------------ */

export async function repoUpdateGarmentImages(
  itemId: number,
  patch: Partial<WardrobeItem>,
): Promise<RepoResult<void>> {
  return repoUpdateGarment(itemId, patch);
}

export async function repoUpdateOutfitRealImages(
  outfitId: string,
  patch: Partial<SavedOutfit>,
): Promise<RepoResult<void>> {
  return repoUpdateOutfit(outfitId, patch);
}

/* ------------------------------------------------------------------ */
/*  P0-02 fix: single-update item save (no stale second write)         */
/* ------------------------------------------------------------------ */

export async function repoSaveEditedGarment(
  viewingItem: WardrobeItem,
  editDraft: Partial<WardrobeItem> & { status: GarmentStatus },
): Promise<RepoResult<WardrobeItem>> {
  if (typeof viewingItem.id !== "number") return fail("单品 ID 无效");
  try {
    const db = getWardrobeDb();
    const now = new Date().toISOString();
    const patch: Partial<WardrobeItem> = {
      name: editDraft.name?.trim(),
      imageDataUrl: editDraft.imageDataUrl,
      sourceImageDataUrl: editDraft.sourceImageDataUrl,
      cropBox: editDraft.cropBox,
      thumbnailDataUrl: editDraft.thumbnailDataUrl,
      category: editDraft.category,
      subcategory: editDraft.subcategory,
      colors: editDraft.colors,
      seasons: editDraft.seasons?.length ? editDraft.seasons : ["all"],
      styles: editDraft.styles?.length ? editDraft.styles : ["casual"],
      formality: editDraft.formality,
      warmth: editDraft.warmth,
      temperatureRange: editDraft.temperatureRange,
      material: editDraft.material,
      fitGender: editDraft.fitGender,
      fitNotes: editDraft.fitNotes?.trim() || undefined,
      price: editDraft.price,
      productUrl: editDraft.productUrl,
      purchaseDate: editDraft.purchaseDate,
      locationId: editDraft.locationId,
      status: editDraft.status,
      notes: editDraft.notes?.trim() || undefined,
      aiConfidence: editDraft.aiConfidence,
      needsReview: editDraft.needsReview,
      updatedAt: now,
    };
    await db.items.update(viewingItem.id, patch);
    const updatedItem = await db.items.get(viewingItem.id);
    if (!updatedItem) return fail("保存后未找到单品");
    // 单次 bridge，不再二次覆盖
    const bridgeResult = await bridgeGarmentUpdate(updatedItem);
    if (!bridgeResult.bridged && bridgeResult.reason && bridgeResult.reason !== "no_workspace") {
      console.warn("[repo] repoSaveEditedGarment bridge failed:", bridgeResult.reason);
    }
    invalidateWorkspaceSnapshotCache();
    return ok(updatedItem);
  } catch (err) {
    return fail("保存衣物信息失败，请重试");
  }
}

/* ------------------------------------------------------------------ */
/*  Aggregated export                                                  */
/* ------------------------------------------------------------------ */

export const wardrobeRepository = {
  // garment
  createGarment: repoCreateGarment,
  updateGarment: repoUpdateGarment,
  deleteGarments: repoDeleteGarments,
  updateItemStatus: repoUpdateItemStatus,
  saveEditedGarment: repoSaveEditedGarment,
  // wishlist
  createWishlistItem: repoCreateWishlistItem,
  updateWishlistItem: repoUpdateWishlistItem,
  deleteWishlistItems: repoDeleteWishlistItems,
  convertWishlistItem: repoConvertWishlistItem,
  undoWishlistPurchase: repoUndoWishlistPurchase,
  getUndoPurchaseRisk,
  // outfit
  createOutfit: repoCreateOutfit,
  updateOutfit: repoUpdateOutfit,
  deleteOutfit: repoDeleteOutfit,
  // plan
  upsertOutfitPlanEntry: repoUpsertOutfitPlanEntry,
  deleteOutfitPlanEntry: repoDeleteOutfitPlanEntry,
  upsertTripPlan: repoUpsertTripPlan,
  deleteTripPlan: repoDeleteTripPlan,
  syncTripPlanChecklist: repoSyncTripPlanChecklist,
  // wear
  recordWear: repoRecordWear,
  cancelWear: repoCancelWear,
  // media
  updateGarmentImages: repoUpdateGarmentImages,
  updateOutfitRealImages: repoUpdateOutfitRealImages,
};
