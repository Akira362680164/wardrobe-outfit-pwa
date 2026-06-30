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

function assetInputs(
  value: object,
  mapping: Array<[sourceField: string, assetField: string, variant: "original" | "thumbnail"]>,
): OnlineAssetInput[] {
  const record = value as Record<string, unknown>;
  return mapping.flatMap(([sourceField, fieldName, variant]) => {
    const image = record[sourceField];
    return typeof image === "string" && image.startsWith("data:image/") ? [{ fieldName, variant, image }] : [];
  });
}

function withoutImages<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/imageDataUrl$/i.test(key) && key !== "sourceImageDataUrl").map(([key, entry]) => [
    key,
    key === "referenceOutfitImages" && Array.isArray(entry)
      ? entry.map((reference) => {
          const record = reference as Record<string, unknown>;
          return { ...record, imageDataUrl: undefined, sourceImageDataUrl: undefined, thumbnailDataUrl: undefined, assetField: referenceAssetField(String(record.id ?? "")) };
        })
      : entry,
  ]));
}

function referenceAssetField(id: string): string { return `referenceOutfitImage:${id}`; }
function referenceAssetInputs(value: object): OnlineAssetInput[] {
  const references = (value as { referenceOutfitImages?: unknown }).referenceOutfitImages;
  if (!Array.isArray(references)) return [];
  return references.flatMap((reference) => {
    const record = reference as Record<string, unknown>;
    const fieldName = referenceAssetField(String(record.id ?? ""));
    return [
      ...(typeof record.imageDataUrl === "string" && record.imageDataUrl.startsWith("data:image/") ? [{ fieldName, variant: "original" as const, image: record.imageDataUrl }] : []),
      ...(typeof record.thumbnailDataUrl === "string" && record.thumbnailDataUrl.startsWith("data:image/") ? [{ fieldName, variant: "thumbnail" as const, image: record.thumbnailDataUrl }] : []),
    ];
  });
}

async function uploadAssets(
  entityType: "garment" | "outfit" | "wishlistItem" | "profile",
  clientMutationId: string,
  inputs: OnlineAssetInput[],
): Promise<string[]> {
  if (inputs.length === 0) return [];
  return (await onlineWriteRepository.uploadAssetInputs({ clientMutationId, entityType, assets: inputs })).temporaryAssetIds;
}

async function committedMutationEntity(clientMutationId: string, resource: Parameters<typeof onlineWriteRepository.read>[0]) {
  const response = await onlineWriteRepository.getMutationResult(clientMutationId);
  return response?.status === "committed" && response.entity
    ? onlineWriteRepository.read(resource, response.entity.id)
    : null;
}

export async function repoCreateGarment(
  item: Omit<WardrobeItem, "id">,
  context: RepoMutationContext = {},
): Promise<RepoResult<number>> {
  const clientMutationId = mutationId(context.clientMutationId);
  const legacyItemId = Date.now();
  try {
    const committed = await committedMutationEntity(clientMutationId, "garments");
    if (committed) return ok(Number(committed.payload.legacyItemId));
    const temporaryAssetIds = await uploadAssets("garment", clientMutationId, [...assetInputs(item, [
      ["imageDataUrl", "imageDataUrl", "original"], ["thumbnailDataUrl", "imageDataUrl", "thumbnail"],
    ]), ...referenceAssetInputs(item)]);
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
      const committedEntity = await committedMutationEntity(clientMutationId, "garments");
      if (committedEntity) return { kind: "committed" as const, item, legacyItemId: Number(committedEntity.payload.legacyItemId), clientMutationId, committedEntity };
      const temporaryAssetIds = await uploadAssets("garment", clientMutationId, assetInputs(item, [
        ["imageDataUrl", "imageDataUrl", "original"], ["thumbnailDataUrl", "imageDataUrl", "thumbnail"],
      ]));
      return { kind: "ready" as const, item, legacyItemId, command: { clientMutationId, payload: { ...withoutImages(item), legacyItemId }, temporaryAssetIds } };
    } catch (error) {
      return { kind: "failed" as const, item, legacyItemId, clientMutationId, error: message(error, "图片上传失败") };
    }
  }));
  const ready = prepared.filter((entry): entry is Extract<typeof entry, { kind: "ready" }> => entry.kind === "ready");
  const commandResults = ready.length ? await onlineWriteRepository.createBatch("garments", { items: ready.map((entry) => entry.command) }) : [];
  const byMutation = new Map(commandResults.map((result) => [result.clientMutationId, result]));
  return Promise.all(prepared.map(async (entry) => {
    if (entry.kind === "committed") return { clientMutationId: entry.clientMutationId, status: "succeeded", item: await reader.mapGarment(entry.committedEntity) } as const;
    if (entry.kind === "failed") return { clientMutationId: entry.clientMutationId, status: "failed", error: entry.error } as const;
    const command = entry.command;
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
    const committed = await committedMutationEntity(mutation.clientMutationId, "garments");
    if (committed) return ok(await reader.mapGarment(committed));
    const temporaryAssetIds = await uploadAssets("garment", mutation.clientMutationId, [...assetInputs(patch, [
      ["imageDataUrl", "imageDataUrl", "original"], ["thumbnailDataUrl", "imageDataUrl", "thumbnail"],
    ]), ...referenceAssetInputs(next)]);
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
    const committed = await committedMutationEntity(clientMutationId, "wishlist");
    if (committed) return ok(String(committed.payload.legacyWishlistId ?? committed.id));
    const temporaryAssetIds = await uploadAssets("wishlistItem", clientMutationId, assetInputs(item, [
      ["imageDataUrl", "imageDataUrl", "original"], ["thumbnailDataUrl", "imageDataUrl", "thumbnail"],
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
    const committed = await committedMutationEntity(mutation.clientMutationId, "wishlist");
    if (committed) return ok(await reader.mapWishlistItem(committed));
    const temporaryAssetIds = await uploadAssets("wishlistItem", mutation.clientMutationId, assetInputs(patch, [
      ["imageDataUrl", "imageDataUrl", "original"], ["thumbnailDataUrl", "imageDataUrl", "thumbnail"],
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
    const committed = await committedMutationEntity(clientMutationId, "outfits");
    if (committed) return ok(String(committed.payload.legacyOutfitId ?? committed.id));
    const temporaryAssetIds = await uploadAssets("outfit", clientMutationId, assetInputs(outfit, [
      ["coverImageDataUrl", "coverImageDataUrl", "original"], ["thumbnailDataUrl", "coverImageDataUrl", "thumbnail"],
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
    const committed = await committedMutationEntity(mutation.clientMutationId, "outfits");
    if (committed) return ok(await reader.mapOutfit(committed));
    const temporaryAssetIds = await uploadAssets("outfit", mutation.clientMutationId, assetInputs(patch, [
      ["coverImageDataUrl", "coverImageDataUrl", "original"], ["thumbnailDataUrl", "coverImageDataUrl", "thumbnail"],
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
      ["fullBodyImageDataUrl", "fullBodyImageDataUrl", "original"], ["faceImageDataUrl", "faceImageDataUrl", "original"],
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

export async function repoUpdateOutfitPlanEntry(
  entry: OutfitPlanEntry,
  patch: Partial<OutfitPlanEntry>,
  context: RepoMutationContext = {},
): Promise<RepoResult<OutfitPlanEntry>> {
  const mutation = mutationContext(entry, context);
  if (!mutation) return fail("穿搭计划版本信息缺失，请刷新后重试");
  try {
    const entity = await onlineWriteRepository.update("outfit-plans", mutation.entityId, {
      ...mutation,
      payload: { ...entry, ...patch },
      temporaryAssetIds: [],
    });
    return ok(reader.mapOutfitPlan(entity));
  } catch (error) { return fail(message(error, "保存计划失败，请重试")); }
}

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

export async function repoRecordWear(outfit: SavedOutfit, dateKey: string, context: RepoMutationContext = {}): Promise<RepoResult<void>> {
  const mutation = mutationContext(outfit, context);
  if (!mutation) return fail("套装版本信息缺失，请刷新后重试");
  try {
    await onlineWriteRepository.markOutfitWorn(mutation.entityId, { ...mutation, wornAt: `${dateKey}T12:00:00.000Z` });
    return ok();
  } catch (error) { return fail(message(error, "标记已穿失败，请重试")); }
}

export async function repoCancelWear(outfit: SavedOutfit, dateKey: string, context: RepoMutationContext = {}): Promise<RepoResult<void>> {
  const mutation = mutationContext(outfit, context);
  if (!mutation) return fail("套装版本信息缺失，请刷新后重试");
  try {
    await onlineWriteRepository.cancelOutfitWorn(mutation.entityId, { ...mutation, date: dateKey, payload: {} });
    return ok();
  } catch (error) { return fail(message(error, "取消已穿失败，请重试")); }
}

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
  upsertOutfitPlanEntry: repoUpsertOutfitPlanEntry, updateOutfitPlanEntry: repoUpdateOutfitPlanEntry,
  deleteOutfitPlanEntry: repoDeleteOutfitPlanEntry,
  upsertTripPlan: repoUpsertTripPlan, deleteTripPlan: repoDeleteTripPlan,
  updatePackingChecklist: repoUpdatePackingChecklist, markPlanWorn: repoMarkPlanWorn, cancelPlanWorn: repoCancelPlanWorn,
  recordWear: repoRecordWear, cancelWear: repoCancelWear,
  updateGarmentImages: repoUpdateGarmentImages, updateOutfitRealImages: repoUpdateOutfitRealImages,
};

// ---- 轻量错误抛出辅助 ----
// 调用方在 try/catch 中直接使用，替代旧的 bridge* 薄包装。
// 每处调用直接看到 repoXxx 方法名，失败语义由 rethrowIfFailed 统一处理。

export function rethrowIfFailed<T>(result: RepoResult<T>, fallbackMessage: string): NonNullable<T> {
  if (!result.ok) throw new Error(result.error ?? fallbackMessage);
  return result.data as NonNullable<T>;
}

// ---- 仓库级操作辅助 ----
// 不为 bridge 兼容，只为封装 create-or-update 判断逻辑。
// 调用方直接看到 repoDeleteGarments 等底层方法。

export async function upsertOutfit(outfit: SavedOutfit): Promise<RepoResult<SavedOutfit>> {
  return outfit.id ? repoUpdateOutfit(outfit, {}) : (repoCreateOutfit(outfit) as unknown as Promise<RepoResult<SavedOutfit>>);
}

export async function upsertLocation(loc: ClosetLocation): Promise<RepoResult<ClosetLocation>> {
  return loc.id ? repoUpdateLocation(loc, {}) : repoCreateLocation(loc);
}

export async function deleteLocationById(id: string): Promise<RepoResult<void>> {
  return repoDeleteLocation({ id } as ClosetLocation);
}

export async function upsertTripPlan(plan: OutfitCalendarPlan, items: PlanPackingChecklistItem[] = []): Promise<RepoResult<void>> {
  return repoUpsertTripPlan(plan, items);
}

export async function readWorkspaceTryOnProfile(): Promise<TryOnProfile> {
  return { id: "default", enabled: false, fitGender: "unspecified", updatedAt: new Date().toISOString() };
}
