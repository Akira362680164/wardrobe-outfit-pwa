// src/lib/repository/wardrobe-repository.ts
// ponytail: repository now writes workspace DB directly; old Dexie remains fallback outside this layer.

import type {
  GarmentStatus,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";
import { type WardrobeCascadeDeleteResult, type WardrobeCascadeDeleteSource } from "@/lib/wardrobe-cascade-delete";
import { type OutfitCascadeDeleteResult } from "@/lib/outfit-cascade-delete";
import { getUndoPurchaseRisk, type UndoPurchaseRisk } from "@/lib/wishlist-conversion";
import {
  addOutfitToDate,
  cancelActualOutfitWearForDate,
  type AddOutfitToDateInput,
  type OutfitWearSyncResult,
} from "@/lib/outfit-wear-sync";
import { bridgeOutfitPlanUpsert, bridgeOutfitPlanDelete, bridgeTripPlanUpsert, bridgeTripPlanDelete } from "@/lib/cloud-sync/plan-bridge";
import { invalidateWorkspaceSnapshotCache } from "@/lib/data-repo";
import {
  createLegacyItemId,
  workspaceConvertWishlistToWardrobe,
  workspaceDeleteGarmentsWithCascade,
  workspaceDeleteOutfitWithCascade,
  workspaceDeleteWishlistItems,
  workspaceUpsertGarment,
  workspaceUpsertOutfit,
  workspaceUpsertWishlistItem,
} from "@/lib/workspace-write-commands";

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
    const id = createLegacyItemId();
    await workspaceUpsertGarment({ ...item, id } as WardrobeItem);
    return ok(id);
  } catch (err) {
    return fail("保存单品失败，请重试");
  }
}

export async function repoUpdateGarment(
  id: number,
  patch: Partial<WardrobeItem>,
): Promise<RepoResult<void>> {
  try {
    const snapshot = await import("@/lib/data-repo").then((m) => m.getWardrobeSnapshot());
    const current = snapshot.items.find((item) => item.id === id);
    if (!current) return fail("单品不存在，请刷新后重试");
    await workspaceUpsertGarment({ ...current, ...patch, id });
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
    const result = await workspaceDeleteGarmentsWithCascade(ids, source);
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
    const id = `wishlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await workspaceUpsertWishlistItem({ ...item, id } as WishlistItem);
    return ok(id);
  } catch (err) {
    return fail("保存种草商品失败，请重试");
  }
}

export async function repoUpdateWishlistItem(
  id: string,
  patch: Partial<WishlistItem>,
): Promise<RepoResult<void>> {
  try {
    const snapshot = await import("@/lib/data-repo").then((m) => m.getWardrobeSnapshot());
    const current = snapshot.wishlistItems.find((item) => item.id === id);
    if (!current) return fail("种草商品不存在，请刷新后重试");
    await workspaceUpsertWishlistItem({ ...current, ...patch, id });
    return ok();
  } catch (err) {
    return fail("更新种草商品失败，请重试");
  }
}

export async function repoDeleteWishlistItems(
  ids: string[],
): Promise<RepoResult<void>> {
  try {
    await workspaceDeleteWishlistItems(ids);
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
    const newItemId = await workspaceConvertWishlistToWardrobe({ wishlistItem, locationId });
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
    const convertedItemId = wishlistItem.convertedItemId;
    const preservedWearSnapshots = typeof convertedItemId === "number"
      ? (await import("@/lib/data-repo").then((m) => m.getWardrobeSnapshot())).items.find((item) => item.id === convertedItemId)?.wornDates?.length ?? 0
      : 0;
    const cascadeResult = typeof convertedItemId === "number"
      ? await workspaceDeleteGarmentsWithCascade([convertedItemId], "wishlist_undo_purchase")
      : null;
    if (typeof convertedItemId !== "number") {
      await workspaceUpsertWishlistItem({
        ...wishlistItem,
        status: "interested",
        convertedItemId: undefined,
        convertedAt: undefined,
        convertedItemDeletedAt: undefined,
        updatedAt: new Date().toISOString(),
      });
    }
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
    const id = `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await workspaceUpsertOutfit({ ...outfit, id } as SavedOutfit);
    return ok(id);
  } catch (err) {
    return fail("保存套装失败，请重试");
  }
}

export async function repoUpdateOutfit(
  id: string,
  patch: Partial<SavedOutfit>,
): Promise<RepoResult<void>> {
  try {
    const snapshot = await import("@/lib/data-repo").then((m) => m.getWardrobeSnapshot());
    const current = snapshot.outfits.find((outfit) => outfit.id === id);
    if (!current) return fail("套装不存在，请刷新后重试");
    await workspaceUpsertOutfit({ ...current, ...patch, id });
    return ok();
  } catch (err) {
    return fail("更新套装失败，请重试");
  }
}

export async function repoDeleteOutfit(
  outfitId: string,
): Promise<RepoResult<OutfitCascadeDeleteResult>> {
  try {
    const result = await workspaceDeleteOutfitWithCascade(outfitId);
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
    await bridgeOutfitPlanUpsert(entry);
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
    await bridgeOutfitPlanDelete(entryId);
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
    await bridgeTripPlanUpsert(plan, checklistItems);
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
    await bridgeTripPlanDelete(planId);
    invalidateWorkspaceSnapshotCache();
    return ok();
  } catch (err) {
    return fail("删除旅行计划失败，请重试");
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
    const now = new Date().toISOString();
    const patch: Partial<WardrobeItem> = {
      name: editDraft.name?.trim(),
      imageDataUrl: editDraft.imageDataUrl,
      sourceImageDataUrl: editDraft.sourceImageDataUrl,
      cropBox: editDraft.cropBox,
      cropRevision: editDraft.cropRevision,
      thumbnailDataUrl: editDraft.thumbnailDataUrl,
      thumbnailCropRevision: editDraft.thumbnailCropRevision,
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
    const updatedItem = { ...viewingItem, ...patch, id: viewingItem.id };
    await workspaceUpsertGarment(updatedItem);
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
  // wear
  recordWear: repoRecordWear,
  cancelWear: repoCancelWear,
  // media
  updateGarmentImages: repoUpdateGarmentImages,
  updateOutfitRealImages: repoUpdateOutfitRealImages,
};
