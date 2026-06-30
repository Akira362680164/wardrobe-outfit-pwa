// bridge-compat.ts – 旧 bridge / write-command 到 wardrobeRepository 的兼容适配层。
// 所有旧 call site 的 import 重定向到此文件，以避免逐个修改 30+ 处调用点。
// 本文件是过渡产物；旧链路物理删除过程中便于 typecheck 和 build 先行通过。

import type { WishlistItem, WardrobeItem, ClosetLocation, SavedOutfit,
  OutfitPlanEntry, OutfitCalendarPlan, PlanPackingChecklistItem,
  TryOnProfile } from "@/lib/types";
import {
  repoCreateGarment, repoUpdateGarment, repoDeleteGarments,
  repoUpdateItemStatus, repoCreateWishlistItem, repoUpdateWishlistItem, repoDeleteWishlistItems,
  repoCreateOutfit, repoUpdateOutfit, repoDeleteOutfit,
  repoCreateLocation, repoUpdateLocation, repoDeleteLocation,
  repoSaveProfile, repoUpsertOutfitPlanEntry, repoUpsertTripPlan,
  repoDeleteOutfitPlanEntry, repoDeleteTripPlan,
} from "@/lib/repository/wardrobe-repository";

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
