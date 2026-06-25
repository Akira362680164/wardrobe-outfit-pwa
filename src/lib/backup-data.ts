import type { ClosetLocation, OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, TryOnProfile, WardrobeBackup, WardrobeItem, WishlistItem } from "@/lib/types";
import { migrateItemRecord, migrateOutfitCalendarPlanRecords, migrateOutfitPlanEntryRecords, migratePlanPackingChecklistItemRecords, migrateSavedOutfitRecords, migrateWishlistItemRecords } from "@/lib/migrate";

export const LATEST_BACKUP_VERSION = 5 as const;

export function createLatestBackup(
  items: WardrobeItem[],
  locations: ClosetLocation[],
  outfits: SavedOutfit[] = [],
  tryOnProfile?: TryOnProfile,
  wishlistItems: WishlistItem[] = [],
  outfitPlanEntries: OutfitPlanEntry[] = [],
  outfitCalendarPlans: OutfitCalendarPlan[] = [],
  planPackingChecklistItems: PlanPackingChecklistItem[] = [],
): WardrobeBackup {
  return {
    version: 5,
    exportedAt: new Date().toISOString(),
    locations,
    items,
    outfits,
    wishlistItems,
    tryOnProfile,
    outfitPlanEntries,
    outfitCalendarPlans,
    planPackingChecklistItems,
  };
}

export function parseLatestBackupMetadata(raw: string): WardrobeBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("备份文件格式不正确：无法解析 JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("备份文件格式不正确：根节点必须是对象");
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== 5) {
    throw new Error(`不支持的备份版本: ${obj.version}，当前只支持版本 5`);
  }

  if (typeof obj.exportedAt !== "string" || isNaN(Date.parse(obj.exportedAt))) {
    throw new Error("备份文件缺少有效的导出时间");
  }

  if (!Array.isArray(obj.locations)) {
    throw new Error("备份文件缺少衣橱位置数据");
  }

  if (!Array.isArray(obj.items)) {
    throw new Error("备份文件缺少衣物数据");
  }

  const migratedItems = obj.items.map((item: unknown) => migrateItemRecord(item));
  const migratedOutfits = migrateSavedOutfitRecords(obj.outfits);
  const migratedWishlistItems = migrateWishlistItemRecords(obj.wishlistItems);
  const migratedOutfitPlanEntries = migrateOutfitPlanEntryRecords(obj.outfitPlanEntries);
  const migratedOutfitCalendarPlans = migrateOutfitCalendarPlanRecords(obj.outfitCalendarPlans);
  const migratedPlanPackingChecklistItems = migratePlanPackingChecklistItemRecords(obj.planPackingChecklistItems);

  return {
    version: 5,
    exportedAt: obj.exportedAt as string,
    locations: obj.locations as ClosetLocation[],
    items: migratedItems,
    outfits: migratedOutfits,
    wishlistItems: migratedWishlistItems,
    tryOnProfile: (obj.tryOnProfile as TryOnProfile | undefined) ?? undefined,
    outfitPlanEntries: migratedOutfitPlanEntries,
    outfitCalendarPlans: migratedOutfitCalendarPlans,
    planPackingChecklistItems: migratedPlanPackingChecklistItems,
  };
}
