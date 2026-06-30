"use client";

import type {
  GarmentStatus,
  ClosetLocation,
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  TryOnProfile,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";
import type { WardrobeCascadeDeleteResult, WardrobeCascadeDeleteSource } from "@/lib/wardrobe-cascade-delete";
import type { OutfitCascadeDeleteResult } from "@/lib/outfit-cascade-delete";
import { getUndoPurchaseRisk, type UndoPurchaseRisk } from "@/lib/wishlist-conversion";
import type { AddOutfitToDateInput, OutfitWearSyncResult } from "@/lib/outfit-wear-sync";
import {
  bindOnlineEntityMetadata,
  getOnlineEntityMetadata,
  OnlineWorkspaceRepository,
} from "@/lib/online/online-repository";
import {
  onlineWriteRepository,
  type OnlineAssetInput,
  type OnlineMutationOptions,
} from "@/lib/online/online-write-repository";

export interface RepoResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface RepoMutationContext extends Partial<OnlineMutationOptions> {
  entityId?: string;
}

export interface RepoBatchCreateGarmentInput {
  item: Omit<WardrobeItem, "id"> & { id?: number };
  clientMutationId: string;
}

export interface RepoBatchCreateGarmentResult {
  clientMutationId: string;
  status: "succeeded" | "failed";
  item?: WardrobeItem;
  error?: string;
}

const reader = new OnlineWorkspaceRepository();

function ok<T>(data?: T): RepoResult<T> { return { ok: true, data }; }
function fail<T>(error: string): RepoResult<T> { return { ok: false, error }; }
function mutationId(value?: string): string {
  if (value) return value;
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function mutationContext(value: object | undefined, context: RepoMutationContext = {}): Required<OnlineMutationOptions> & { entityId: string } | null {
  const metadata = value ? getOnlineEntityMetadata(value) : undefined;
  const entityId = context.entityId ?? metadata?.entityId;
  const expectedRevision = context.expectedRevision ?? metadata?.revision;
  if (!entityId || !expectedRevision) return null;
  return { entityId, expectedRevision, clientMutationId: mutationId(context.clientMutationId) };
}

function assetInputs(value: object, mapping: Array<[string, "original" | "thumbnail"]>): OnlineAssetInput[] {
  const record = value as Record<string, unknown>;
  return mapping.flatMap(([fieldName, variant]) => {
    const image = record[fieldName];
    return typeof image === "string" && image.startsWith("data:image/") ? [{ fieldName, variant, image }] : [];
  });
}

function withoutImages<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/imageDataUrl$/i.test(key) && key !== "sourceImageDataUrl"));
}

async function uploadAssets(
  entityType: "garment" | "outfit" | "wishlistItem" | "profile",
  clientMutationId: string,
  inputs: OnlineAssetInput[],
): Promise<string[]> {
  if (inputs.length === 0) return [];
  return (await onlineWriteRepository.uploadAssetInputs({ clientMutationId, entityType, assets: inputs })).temporaryAssetIds;
}

export async function repoCreateGarment(
  item: Omit<WardrobeItem, "id">,
  context: RepoMutationContext = {},
): Promise<RepoResult<number>> {
  const clientMutationId = mutationId(context.clientMutationId);
  const legacyItemId = Date.now();
  try {
    const temporaryAssetIds = await uploadAssets("garment", clientMutationId, assetInputs(item, [
      ["imageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
    ]));
    const entity = await onlineWriteRepository.create("garments", {
      clientMutationId,
      payload: { ...withoutImages(item), legacyItemId },
      temporaryAssetIds,
    });
    await reader.mapGarment(entity);
    return ok(legacyItemId);
  } catch (error) { return fail(message(error, "保存单品失败，请重试")); }
}

export async function repoCreateGarmentsBatch(inputs: RepoBatchCreateGarmentInput[]): Promise<RepoBatchCreateGarmentResult[]> {
  const prepared = await Promise.all(inputs.map(async ({ item, clientMutationId }, index) => {
    const legacyItemId = item.id ?? Date.now() + index;
    try {
      const temporaryAssetIds = await uploadAssets("garment", clientMutationId, assetInputs(item, [
        ["imageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
      ]));
      return { item, legacyItemId, command: { clientMutationId, payload: { ...withoutImages(item), legacyItemId }, temporaryAssetIds } };
    } catch (error) {
      return { item, legacyItemId, clientMutationId, error: message(error, "图片上传失败") };
    }
  }));
  const ready = prepared.filter((entry): entry is Extract<typeof entry, { command: unknown }> => "command" in entry);
  const commandResults = ready.length ? await onlineWriteRepository.createBatch("garments", { items: ready.map((entry) => entry.command) }) : [];
  const byMutation = new Map(commandResults.map((result) => [result.clientMutationId, result]));
  return Promise.all(prepared.map(async (entry) => {
    const command = entry.command;
    if (!command) return { clientMutationId: entry.clientMutationId, status: "failed", error: entry.error } as const;
    const result = byMutation.get(command.clientMutationId);
    if (!result?.entity) return { clientMutationId: command.clientMutationId, status: "failed", error: result?.error ?? "服务器未返回该单品" } as const;
    return { clientMutationId: command.clientMutationId, status: "succeeded", item: await reader.mapGarment(result.entity) } as const;
  }));
}

export async function repoUpdateGarment(
  item: WardrobeItem,
  patch: Partial<WardrobeItem>,
  context: RepoMutationContext = {},
): Promise<RepoResult<WardrobeItem>> {
  const mutation = mutationContext(item, context);
  if (!mutation) return fail("单品版本信息缺失，请刷新后重试");
  try {
    const next = { ...item, ...patch };
    const temporaryAssetIds = await uploadAssets("garment", mutation.clientMutationId, assetInputs(patch, [
      ["imageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
    ]));
    const entity = await onlineWriteRepository.update("garments", mutation.entityId, {
      clientMutationId: mutation.clientMutationId,
      expectedRevision: mutation.expectedRevision,
      payload: withoutImages(next),
      temporaryAssetIds,
    });
    return ok(await reader.mapGarment(entity));
  } catch (error) { return fail(message(error, "更新单品失败，请重试")); }
}

export async function repoDeleteGarments(
  items: WardrobeItem[],
  source: WardrobeCascadeDeleteSource = "manual_delete",
  contexts: RepoMutationContext[] = [],
): Promise<RepoResult<WardrobeCascadeDeleteResult>> {
  try {
    for (const [index, item] of items.entries()) {
      const mutation = mutationContext(item, contexts[index]);
      if (!mutation) return fail("单品版本信息缺失，请刷新后重试");
      await onlineWriteRepository.remove("garments", mutation.entityId, mutation);
    }
    return ok({
      deletedItemIds: items.flatMap((item) => typeof item.id === "number" ? [item.id] : []),
      updatedOutfitIds: [], deletedOutfitIds: [], deletedPlanEntryIds: [], deletedPackingItemIds: [],
      markedDeletedWishlistIds: source === "wishlist_undo_purchase" ? [] : [], clearedWishlistConvertedIds: [],
    });
  } catch (error) { return fail(message(error, "删除单品失败，请重试")); }
}

export async function repoUpdateItemStatus(item: WardrobeItem, status: GarmentStatus, context: RepoMutationContext = {}) {
  return repoUpdateGarment(item, { status, updatedAt: new Date().toISOString() }, context);
}

export async function repoCreateWishlistItem(item: Omit<WishlistItem, "id">, context: RepoMutationContext = {}): Promise<RepoResult<string>> {
  const clientMutationId = mutationId(context.clientMutationId);
  const legacyWishlistId = `wishlist-${clientMutationId}`;
  try {
    const temporaryAssetIds = await uploadAssets("wishlistItem", clientMutationId, assetInputs(item, [
      ["imageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
    ]));
    const entity = await onlineWriteRepository.create("wishlist", { clientMutationId, payload: { ...withoutImages(item), legacyWishlistId }, temporaryAssetIds });
    await reader.mapWishlistItem(entity);
    return ok(legacyWishlistId);
  } catch (error) { return fail(message(error, "保存种草商品失败，请重试")); }
}

export async function repoUpdateWishlistItem(item: WishlistItem, patch: Partial<WishlistItem>, context: RepoMutationContext = {}): Promise<RepoResult<WishlistItem>> {
  const mutation = mutationContext(item, context);
  if (!mutation) return fail("种草版本信息缺失，请刷新后重试");
  try {
    const temporaryAssetIds = await uploadAssets("wishlistItem", mutation.clientMutationId, assetInputs(patch, [
      ["imageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
    ]));
    const entity = await onlineWriteRepository.update("wishlist", mutation.entityId, {
      clientMutationId: mutation.clientMutationId, expectedRevision: mutation.expectedRevision,
      payload: withoutImages({ ...item, ...patch }), temporaryAssetIds,
    });
    return ok(await reader.mapWishlistItem(entity));
  } catch (error) { return fail(message(error, "更新种草商品失败，请重试")); }
}

export async function repoDeleteWishlistItems(items: WishlistItem[], contexts: RepoMutationContext[] = {} as RepoMutationContext[]): Promise<RepoResult<void>> {
  try {
    for (const [index, item] of items.entries()) {
      const mutation = mutationContext(item, contexts[index]);
      if (!mutation) return fail("种草版本信息缺失，请刷新后重试");
      await onlineWriteRepository.remove("wishlist", mutation.entityId, mutation);
    }
    return ok();
  } catch (error) { return fail(message(error, "删除种草商品失败，请重试")); }
}

export async function repoConvertWishlistItem(item: WishlistItem, locationId: string, context: RepoMutationContext = {}): Promise<RepoResult<number>> {
  const mutation = mutationContext(item, context);
  if (!mutation) return fail("种草版本信息缺失，请刷新后重试");
  try {
    const entity = await onlineWriteRepository.convertWishlist(mutation.entityId, { ...mutation, locationId });
    const mapped = await reader.mapWishlistItem(entity);
    return ok(mapped.convertedItemId ?? 0);
  } catch (error) { return fail(message(error, "转入衣橱失败，请重试")); }
}

export interface RepoUndoPurchaseResult {
  deletedGarmentIds: number[]; updatedOutfitIds: string[]; deletedOutfitIds: string[];
  updatedPlanEntryIds: string[]; deletedPlanEntryIds: string[]; preservedWearSnapshots: number;
}

export async function repoUndoWishlistPurchase(item: WishlistItem, context: RepoMutationContext = {}): Promise<RepoResult<RepoUndoPurchaseResult>> {
  const mutation = mutationContext(item, context);
  if (!mutation) return fail("种草版本信息缺失，请刷新后重试");
  try {
    await onlineWriteRepository.undoWishlistPurchase(mutation.entityId, { ...mutation, payload: {} });
    return ok({ deletedGarmentIds: item.convertedItemId ? [item.convertedItemId] : [], updatedOutfitIds: [], deletedOutfitIds: [], updatedPlanEntryIds: [], deletedPlanEntryIds: [], preservedWearSnapshots: 0 });
  } catch (error) { return fail(message(error, "撤销购买失败，请重试")); }
}

export async function repoCreateOutfit(outfit: Omit<SavedOutfit, "id">, context: RepoMutationContext = {}): Promise<RepoResult<string>> {
  const clientMutationId = mutationId(context.clientMutationId);
  const legacyOutfitId = `outfit-${clientMutationId}`;
  try {
    const temporaryAssetIds = await uploadAssets("outfit", clientMutationId, assetInputs(outfit, [
      ["coverImageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
    ]));
    const entity = await onlineWriteRepository.create("outfits", { clientMutationId, payload: { ...withoutImages(outfit), legacyOutfitId }, temporaryAssetIds });
    await reader.mapOutfit(entity);
    return ok(legacyOutfitId);
  } catch (error) { return fail(message(error, "保存套装失败，请重试")); }
}

export async function repoUpdateOutfit(outfit: SavedOutfit, patch: Partial<SavedOutfit>, context: RepoMutationContext = {}): Promise<RepoResult<SavedOutfit>> {
  const mutation = mutationContext(outfit, context);
  if (!mutation) return fail("套装版本信息缺失，请刷新后重试");
  try {
    const temporaryAssetIds = await uploadAssets("outfit", mutation.clientMutationId, assetInputs(patch, [
      ["coverImageDataUrl", "original"], ["thumbnailDataUrl", "thumbnail"],
    ]));
    const entity = await onlineWriteRepository.update("outfits", mutation.entityId, {
      clientMutationId: mutation.clientMutationId, expectedRevision: mutation.expectedRevision,
      payload: withoutImages({ ...outfit, ...patch }), temporaryAssetIds,
    });
    return ok(await reader.mapOutfit(entity));
  } catch (error) { return fail(message(error, "更新套装失败，请重试")); }
}

export async function repoDeleteOutfit(outfit: SavedOutfit | string, context: RepoMutationContext = {}): Promise<RepoResult<OutfitCascadeDeleteResult>> {
  if (typeof outfit === "string") return fail("套装版本信息缺失，请刷新后重试");
  const mutation = mutationContext(outfit, context);
  if (!mutation) return fail("套装版本信息缺失，请刷新后重试");
  try {
    await onlineWriteRepository.remove("outfits", mutation.entityId, mutation);
    return ok({ deletedOutfitIds: [outfit.id], deletedPlanEntryIds: [], deletedPackingItemIds: [], keptWornCount: 0 });
  } catch (error) { return fail(message(error, "删除套装失败，请重试")); }
}

export async function repoSetOutfitFavorite(outfit: SavedOutfit, value: boolean, context: RepoMutationContext = {}): Promise<RepoResult<SavedOutfit>> {
  const mutation = mutationContext(outfit, context);
  if (!mutation) return fail("套装版本信息缺失，请刷新后重试");
  try {
    const entity = await onlineWriteRepository.setOutfitFavorite(mutation.entityId, { ...mutation, value, payload: {} });
    return ok(await reader.mapOutfit(entity));
  } catch (error) { return fail(message(error, "更新收藏失败，请重试")); }
}

export async function repoCreateLocation(location: Omit<ClosetLocation, "id">, context: RepoMutationContext = {}): Promise<RepoResult<ClosetLocation>> {
  try {
    const entity = await onlineWriteRepository.create("locations", {
      clientMutationId: mutationId(context.clientMutationId), payload: location, temporaryAssetIds: [],
    });
    return ok(reader.mapLocation(entity));
  } catch (error) { return fail(message(error, "新增衣橱位置失败，请重试")); }
}

export async function repoUpdateLocation(location: ClosetLocation, patch: Partial<ClosetLocation>, context: RepoMutationContext = {}): Promise<RepoResult<ClosetLocation>> {
  const mutation = mutationContext(location, context);
  if (!mutation) return fail("衣橱位置版本信息缺失，请刷新后重试");
  try {
    const entity = await onlineWriteRepository.update("locations", mutation.entityId, {
      ...mutation, payload: { ...location, ...patch }, temporaryAssetIds: [],
    });
    return ok(reader.mapLocation(entity));
  } catch (error) { return fail(message(error, "更新衣橱位置失败，请重试")); }
}

export async function repoDeleteLocation(location: ClosetLocation, context: RepoMutationContext = {}): Promise<RepoResult<void>> {
  const mutation = mutationContext(location, context);
  if (!mutation) return fail("衣橱位置版本信息缺失，请刷新后重试");
  try { await onlineWriteRepository.remove("locations", mutation.entityId, mutation); return ok(); }
  catch (error) { return fail(message(error, "删除衣橱位置失败，请重试")); }
}

export async function repoSaveProfile(profile: TryOnProfile, context: RepoMutationContext = {}): Promise<RepoResult<TryOnProfile>> {
  const metadata = getOnlineEntityMetadata(profile);
  const clientMutationId = mutationId(context.clientMutationId);
  try {
    const temporaryAssetIds = await uploadAssets("profile", clientMutationId, assetInputs(profile, [
      ["fullBodyImageDataUrl", "original"], ["faceImageDataUrl", "original"],
    ]));
    const entity = metadata
      ? await onlineWriteRepository.update("profiles", metadata.entityId, {
          clientMutationId, expectedRevision: context.expectedRevision ?? metadata.revision,
          payload: withoutImages(profile), temporaryAssetIds,
        })
      : await onlineWriteRepository.create("profiles", {
          clientMutationId, payload: withoutImages(profile), temporaryAssetIds,
        });
    return ok(await reader.mapProfile(entity));
  } catch (error) { return fail(message(error, "保存试穿档案失败，请重试")); }
}

async function upsertPlan(resource: "trip-plans" | "outfit-plans", value: OutfitCalendarPlan | OutfitPlanEntry, context: RepoMutationContext): Promise<RepoResult<void>> {
  const mutation = mutationContext(value, context);
  try {
    if (mutation) await onlineWriteRepository.update(resource, mutation.entityId, { ...mutation, payload: { ...value }, temporaryAssetIds: [] });
    else await onlineWriteRepository.create(resource, { clientMutationId: mutationId(context.clientMutationId), payload: { ...value }, temporaryAssetIds: [] });
    return ok();
  } catch (error) { return fail(message(error, "保存计划失败，请重试")); }
}

export const repoUpsertOutfitPlanEntry = (entry: OutfitPlanEntry, context: RepoMutationContext = {}) => upsertPlan("outfit-plans", entry, context);
export const repoUpsertTripPlan = (plan: OutfitCalendarPlan, _items: PlanPackingChecklistItem[] = [], context: RepoMutationContext = {}) => upsertPlan("trip-plans", plan, context);

async function deletePlan(resource: "trip-plans" | "outfit-plans", value: OutfitCalendarPlan | OutfitPlanEntry, context: RepoMutationContext): Promise<RepoResult<void>> {
  const mutation = mutationContext(value, context);
  if (!mutation) return fail("计划版本信息缺失，请刷新后重试");
  try { await onlineWriteRepository.remove(resource, mutation.entityId, mutation); return ok(); }
  catch (error) { return fail(message(error, "删除计划失败，请重试")); }
}

export const repoDeleteOutfitPlanEntry = (entry: OutfitPlanEntry, context: RepoMutationContext = {}) => deletePlan("outfit-plans", entry, context);
export const repoDeleteTripPlan = (plan: OutfitCalendarPlan, context: RepoMutationContext = {}) => deletePlan("trip-plans", plan, context);

export async function repoUpdatePackingChecklist(plan: OutfitCalendarPlan, items: PlanPackingChecklistItem[], context: RepoMutationContext = {}): Promise<RepoResult<void>> {
  const mutation = mutationContext(plan, context);
  if (!mutation) return fail("旅行计划版本信息缺失，请刷新后重试");
  try { await onlineWriteRepository.updatePackingChecklist(mutation.entityId, { ...mutation, items: items.map((item) => ({ ...item })) }); return ok(); }
  catch (error) { return fail(message(error, "更新打包清单失败，请重试")); }
}

export async function repoMarkPlanWorn(entry: OutfitPlanEntry, wornAt: string, outfitId?: string, context: RepoMutationContext = {}): Promise<RepoResult<OutfitPlanEntry>> {
  const mutation = mutationContext(entry, context);
  if (!mutation) return fail("穿搭计划版本信息缺失，请刷新后重试");
  try {
    const entity = await onlineWriteRepository.markPlanWorn(mutation.entityId, { ...mutation, wornAt, outfitId });
    return ok(reader.mapOutfitPlan(entity));
  } catch (error) { return fail(message(error, "标记已穿失败，请重试")); }
}

export async function repoCancelPlanWorn(entry: OutfitPlanEntry, context: RepoMutationContext = {}): Promise<RepoResult<OutfitPlanEntry>> {
  const mutation = mutationContext(entry, context);
  if (!mutation) return fail("穿搭计划版本信息缺失，请刷新后重试");
  try {
    const entity = await onlineWriteRepository.cancelPlanWorn(mutation.entityId, { ...mutation, payload: {} });
    return ok(reader.mapOutfitPlan(entity));
  } catch (error) { return fail(message(error, "取消已穿失败，请重试")); }
}

export async function repoRecordWear(_input: AddOutfitToDateInput): Promise<RepoResult<OutfitWearSyncResult>> { return fail("请刷新穿搭计划后再标记已穿"); }
export async function repoCancelWear(_dateKey: string, _outfitId: string, _todayKey: string): Promise<RepoResult<OutfitWearSyncResult>> { return fail("请刷新穿搭计划后再取消已穿"); }

export const repoUpdateGarmentImages = repoUpdateGarment;
export const repoUpdateOutfitRealImages = repoUpdateOutfit;

export async function repoSaveEditedGarment(viewingItem: WardrobeItem, editDraft: Partial<WardrobeItem> & { status: GarmentStatus }, context: RepoMutationContext = {}): Promise<RepoResult<WardrobeItem>> {
  return repoUpdateGarment(viewingItem, { ...editDraft, updatedAt: new Date().toISOString() }, context);
}

function message(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }

export { getUndoPurchaseRisk, type UndoPurchaseRisk, bindOnlineEntityMetadata };

export const wardrobeRepository = {
  createGarment: repoCreateGarment, createGarmentsBatch: repoCreateGarmentsBatch, updateGarment: repoUpdateGarment,
  deleteGarments: repoDeleteGarments, updateItemStatus: repoUpdateItemStatus, saveEditedGarment: repoSaveEditedGarment,
  createWishlistItem: repoCreateWishlistItem, updateWishlistItem: repoUpdateWishlistItem,
  deleteWishlistItems: repoDeleteWishlistItems, convertWishlistItem: repoConvertWishlistItem,
  undoWishlistPurchase: repoUndoWishlistPurchase, getUndoPurchaseRisk,
  createOutfit: repoCreateOutfit, updateOutfit: repoUpdateOutfit, deleteOutfit: repoDeleteOutfit,
  setOutfitFavorite: repoSetOutfitFavorite,
  createLocation: repoCreateLocation, updateLocation: repoUpdateLocation, deleteLocation: repoDeleteLocation,
  saveProfile: repoSaveProfile,
  upsertOutfitPlanEntry: repoUpsertOutfitPlanEntry, deleteOutfitPlanEntry: repoDeleteOutfitPlanEntry,
  upsertTripPlan: repoUpsertTripPlan, deleteTripPlan: repoDeleteTripPlan,
  updatePackingChecklist: repoUpdatePackingChecklist, markPlanWorn: repoMarkPlanWorn, cancelPlanWorn: repoCancelPlanWorn,
  recordWear: repoRecordWear, cancelWear: repoCancelWear,
  updateGarmentImages: repoUpdateGarmentImages, updateOutfitRealImages: repoUpdateOutfitRealImages,
};
export async function bridgeGarmentCreate(item: WardrobeItem) {
  const { ok, error } = await repoCreateGarment(item);
  if (!ok) throw new Error(error ?? "创建单品失败");
}

export async function bridgeGarmentUpdate(item: WardrobeItem) {
  const { ok, error } = await repoUpdateGarment(item, {});
  if (!ok) throw new Error(error ?? "更新单品失败");
}

export async function bridgeGarmentDelete(itemIds: number[]) {
  const { ok, error } = await repoDeleteGarments(itemIds as unknown as WardrobeItem[]);
  if (!ok) throw new Error(error ?? "删除单品失败");
}

export async function bridgeOutfitUpsert(outfit: SavedOutfit) {
  const { ok, error } = outfit.id
    ? await repoUpdateOutfit(outfit, {})
    : await repoCreateOutfit(outfit);
  if (!ok) throw new Error(error ?? "保存套装失败");
}

export async function bridgeOutfitDelete(outfit: SavedOutfit | string) {
  const { ok, error } = await repoDeleteOutfit(outfit);
  if (!ok) throw new Error(error ?? "删除套装失败");
}

export async function bridgeLocationUpsert(loc: ClosetLocation) {
  const res = loc.id
    ? await repoUpdateLocation(loc, {})
    : await repoCreateLocation(loc);
  if (!res.ok) throw new Error(res.error ?? "保存位置失败");
}

export async function bridgeLocationDelete(id: string) {
  const { ok, error } = await repoDeleteLocation({ id } as ClosetLocation);
  if (!ok) throw new Error(error ?? "删除位置失败");
}

export async function bridgeWishlistUpsert(item: WishlistItem) {
  const { ok, error } = item.id
    ? await repoUpdateWishlistItem(item, {})
    : await repoCreateWishlistItem(item);
  if (!ok) throw new Error(error ?? "保存种草失败");
}

export async function bridgeOutfitPlanDelete(entry: OutfitPlanEntry | string) {
  const { ok, error } = await repoDeleteOutfitPlanEntry(entry as OutfitPlanEntry);
  if (!ok) throw new Error(error ?? "删除穿搭计划失败");
}

export async function bridgeWearEventsForGarment(_item: WardrobeItem) {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bridgeWearSyncResult(_result: any) {}

export function createLegacyItemId(): number { return Date.now(); }

export async function deleteItemsWithCascade(opts: { itemIds: number[]; source: string }) {
  const { ok, error } = await repoDeleteGarments(opts.itemIds as unknown as WardrobeItem[]);
  if (!ok) throw new Error(error ?? "删除单品失败");
}

export async function readWorkspaceTryOnProfile(): Promise<TryOnProfile> {
  return { id: "default", enabled: false, fitGender: "unspecified", updatedAt: new Date().toISOString() };
}

export const saveWorkspaceTryOnProfile = repoSaveProfile;

export async function bridgeOutfitPlanUpsert(entry: OutfitPlanEntry) {
  const { ok, error } = await repoUpsertOutfitPlanEntry(entry);
  if (!ok) throw new Error(error ?? "保存穿搭计划失败");
}

export async function bridgeTripPlanUpsert(plan: OutfitCalendarPlan, items: PlanPackingChecklistItem[] = []) {
  const { ok, error } = await repoUpsertTripPlan(plan, items);
  if (!ok) return { bridged: false };
  return { bridged: true };
}

export async function bridgeTripPlanDelete(plan: OutfitCalendarPlan | string) {
  const { ok, error } = await repoDeleteTripPlan(plan as OutfitCalendarPlan);
  if (!ok) throw new Error(error ?? "删除旅行计划失败");
}
