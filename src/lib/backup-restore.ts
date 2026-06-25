import type { WardrobeBackup } from "@/lib/types";
import { getWardrobeDb } from "@/lib/db";

export interface BackupRestorePreview {
  fileName: string;
  appVersion: string;
  exportedAt: string;
  itemCount: number;
  locationCount: number;
  outfitCount: number;
  wishlistCount: number;
  planCount: number;
  travelPlanCount: number;
  packingCount: number;
  imageCount: number;
}

export function validateLatestBackupReferences(
  backup: WardrobeBackup,
): BackupRestorePreview {
  const errors: string[] = [];

  // Locations
  const locIds = new Set<string>();
  if (!backup.locations || backup.locations.length === 0) {
    errors.push("备份中缺少衣橱位置");
  } else {
    for (const loc of backup.locations) {
      if (!loc.id || typeof loc.id !== "string") {
        errors.push(`衣橱位置缺少 id`);
      } else if (locIds.has(loc.id)) {
        errors.push(`衣橱位置 id 重复: ${loc.id}`);
      } else {
        locIds.add(loc.id);
      }
    }
  }

  // Items
  const itemIds = new Set<number>();
  for (const item of backup.items) {
    if (typeof item.id !== "number" || !Number.isFinite(item.id) || item.id <= 0) {
      errors.push(`衣物缺少有效 id: ${JSON.stringify(item.id)}`);
    } else if (itemIds.has(item.id)) {
      errors.push(`衣物 id 重复: ${item.id}`);
    } else {
      itemIds.add(item.id);
    }
    if (item.locationId && !locIds.has(item.locationId)) {
      errors.push(`衣物 ${item.id} 引用了不存在的衣橱位置: ${item.locationId}`);
    }
    if (item.imageDataUrl && typeof item.imageDataUrl === "string" && !item.imageDataUrl.startsWith("data:image/")) {
      errors.push(`衣物 ${item.id} 的图片不是 data:image/ 格式`);
    }
  }

  // Outfits
  const outfitIds = new Set<string>();
  for (const outfit of (backup.outfits ?? [])) {
    if (!outfit.id) {
      errors.push("套装缺少 id");
    } else if (outfitIds.has(outfit.id)) {
      errors.push(`套装 id 重复: ${outfit.id}`);
    } else {
      outfitIds.add(outfit.id);
    }
    const uniqueItemIds = new Set(outfit.itemIds);
    if (uniqueItemIds.size !== outfit.itemIds.length) {
      errors.push(`套装 ${outfit.id} 包含重复衣物`);
    }
    for (const iid of outfit.itemIds) {
      if (!itemIds.has(iid)) {
        errors.push(`套装 ${outfit.id} 引用了不存在的衣物: ${iid}`);
      }
    }
    if (outfit.itemIds.length < 2) {
      errors.push(`套装 ${outfit.id} 至少需要 2 件衣物，当前只有 ${outfit.itemIds.length} 件`);
    }
    if (outfit.coverImageDataUrl && !outfit.coverImageDataUrl.startsWith("data:image/")) {
      errors.push(`套装 ${outfit.id} 的封面图片格式不正确`);
    }
  }

  // Wishlist items
  const wishlistIds = new Set<string>();
  for (const w of (backup.wishlistItems ?? [])) {
    if (!w.id) {
      errors.push("种草单品缺少 id");
    } else if (wishlistIds.has(w.id)) {
      errors.push(`种草单品 id 重复: ${w.id}`);
    } else {
      wishlistIds.add(w.id);
    }
    if (w.convertedItemId != null && !itemIds.has(w.convertedItemId)) {
      errors.push(`种草单品 ${w.id} 引用了不存在的已转换衣物: ${w.convertedItemId}`);
    }
    if (w.imageDataUrl && !w.imageDataUrl.startsWith("data:image/")) {
      errors.push(`种草单品 ${w.id} 的图片格式不正确`);
    }
  }

  // Outfit plan entries
  const planEntryIds = new Set<string>();
  for (const entry of (backup.outfitPlanEntries ?? [])) {
    if (!entry.id) {
      errors.push("穿搭计划条目缺少 id");
    } else if (planEntryIds.has(entry.id)) {
      errors.push(`穿搭计划条目 id 重复: ${entry.id}`);
    } else {
      planEntryIds.add(entry.id);
    }
    if (entry.outfitId && !outfitIds.has(entry.outfitId)) {
      errors.push(`穿搭计划条目 ${entry.id} 引用了不存在的套装: ${entry.outfitId}`);
    }
    if (entry.actualOutfitId && !outfitIds.has(entry.actualOutfitId)) {
      errors.push(`穿搭计划条目 ${entry.id} 引用了不存在的实际套装: ${entry.actualOutfitId}`);
    }
    if (entry.itemIds) {
      for (const iid of entry.itemIds) {
        if (!itemIds.has(iid)) {
          errors.push(`穿搭计划条目 ${entry.id} 引用了不存在的衣物: ${iid}`);
        }
      }
    }
  }

  // Outfit calendar plans
  const calendarPlanIds = new Set<string>();
  for (const plan of (backup.outfitCalendarPlans ?? [])) {
    if (!plan.id) {
      errors.push("旅行计划缺少 id");
    } else if (calendarPlanIds.has(plan.id)) {
      errors.push(`旅行计划 id 重复: ${plan.id}`);
    } else {
      calendarPlanIds.add(plan.id);
    }
    if (!plan.startDate || !plan.endDate) {
      errors.push(`旅行计划 ${plan.id} 缺少日期`);
    } else if (plan.startDate > plan.endDate) {
      errors.push(`旅行计划 ${plan.id} 开始日期晚于结束日期`);
    }
  }

  // Plan packing checklist items
  const packingIds = new Set<string>();
  for (const item of (backup.planPackingChecklistItems ?? [])) {
    if (!item.id) {
      errors.push("打包清单条目缺少 id");
    } else if (packingIds.has(item.id)) {
      errors.push(`打包清单条目 id 重复: ${item.id}`);
    } else {
      packingIds.add(item.id);
    }
    if (!calendarPlanIds.has(item.calendarPlanId)) {
      errors.push(`打包清单条目 ${item.id} 引用了不存在的旅行计划: ${item.calendarPlanId}`);
    }
    if (item.source === "wardrobe" && item.itemId != null && !itemIds.has(item.itemId)) {
      errors.push(`打包清单条目 ${item.id} 引用了不存在的衣物: ${item.itemId}`);
    }
  }

  // TryOnProfile
  if (backup.tryOnProfile) {
    if (backup.tryOnProfile.id !== "default") {
      errors.push(`穿衣画像 id 必须为 "default"，实际为: ${backup.tryOnProfile.id}`);
    }
    if (backup.tryOnProfile.fullBodyImageDataUrl && !backup.tryOnProfile.fullBodyImageDataUrl.startsWith("data:image/")) {
      errors.push("穿衣画像参考照片格式不正确");
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return {
    fileName: "",
    appVersion: "",
    exportedAt: backup.exportedAt,
    itemCount: backup.items.length,
    locationCount: backup.locations.length,
    outfitCount: (backup.outfits ?? []).length,
    wishlistCount: (backup.wishlistItems ?? []).length,
    planCount: (backup.outfitPlanEntries ?? []).length,
    travelPlanCount: (backup.outfitCalendarPlans ?? []).length,
    packingCount: (backup.planPackingChecklistItems ?? []).length,
    imageCount: 0,
  };
}

export async function applyLatestWardrobeBackup(
  backup: WardrobeBackup,
): Promise<void> {
  const db = getWardrobeDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.transaction as any)("rw",
    ...[db.items, db.locations, db.outfits, db.wishlistItems, db.tryOnProfile, db.outfitPlanEntries, db.outfitCalendarPlans, db.planPackingChecklistItems].filter(Boolean),
    async () => {
      await db.items.clear();
      await db.locations.clear();
      await db.outfits.clear();
      await db.wishlistItems.clear();
      await db.tryOnProfile.clear();
      await db.outfitPlanEntries.clear();
      await db.outfitCalendarPlans.clear();
      await db.planPackingChecklistItems.clear();

      await db.locations.bulkPut(backup.locations);
      await db.items.bulkPut(backup.items);
      await db.outfits.bulkPut(backup.outfits ?? []);
      await db.wishlistItems.bulkPut(backup.wishlistItems ?? []);
      if (backup.tryOnProfile) {
        await db.tryOnProfile.put(backup.tryOnProfile);
      }
      await db.outfitCalendarPlans.bulkPut(backup.outfitCalendarPlans ?? []);
      await db.outfitPlanEntries.bulkPut(backup.outfitPlanEntries ?? []);
      await db.planPackingChecklistItems.bulkPut(backup.planPackingChecklistItems ?? []);
    },
  );
}
