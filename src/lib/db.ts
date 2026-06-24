import Dexie, { type Table } from "dexie";
import { DEFAULT_LOCATIONS, type ClosetLocation, type OutfitCalendarPlan, type OutfitPlanEntry, type PlanPackingChecklistItem, type SavedOutfit, type TryOnProfile, type WardrobeItem, type WishlistItem } from "@/lib/types";
import { migrateItemRecord, migrateOutfitCalendarPlanRecord, migrateOutfitPlanEntryRecord, migratePlanPackingChecklistItemRecord, migrateSavedOutfitRecord, migrateWishlistItemRecord } from "@/lib/migrate";

const REMOVED_AUTO_LOCATION_IDS = ["boyfriend_home", "car_trunk"];

const DEFAULT_TRY_ON_PROFILE: TryOnProfile = {
  id: "default",
  enabled: false,
  fitGender: "unspecified",
  updatedAt: new Date().toISOString(),
};

class WardrobeDatabase extends Dexie {
  items!: Table<WardrobeItem, number>;
  locations!: Table<ClosetLocation, string>;
  outfits!: Table<SavedOutfit, string>;
  wishlistItems!: Table<WishlistItem, string>;
  tryOnProfile!: Table<TryOnProfile, string>;
  outfitPlanEntries!: Table<OutfitPlanEntry, string>;
  outfitCalendarPlans!: Table<OutfitCalendarPlan, string>;
  planPackingChecklistItems!: Table<PlanPackingChecklistItem, string>;

  constructor() {
    super("wardrobe-outfit-pwa");
    this.version(1).stores({
      items: "++id, category, locationId, status, updatedAt",
      locations: "id, sortOrder, updatedAt",
    });
    this.version(2).stores({
      items: "++id, category, locationId, status, updatedAt",
      locations: "id, sortOrder, updatedAt",
      outfits: "id, updatedAt, favorite",
    });
    this.version(3).stores({
      items: "++id, category, locationId, status, updatedAt",
      locations: "id, sortOrder, updatedAt",
      outfits: "id, updatedAt, favorite",
      tryOnProfile: "id",
    });
    this.version(4).stores({
      items: "++id, category, locationId, status, updatedAt",
      locations: "id, sortOrder, updatedAt",
      outfits: "id, updatedAt, favorite",
      wishlistItems: "id, status, updatedAt",
      tryOnProfile: "id",
    });
    // v0.9.49-dev auto-fix: v3 → v4 升级占位, 未来 v5+ 新字段在此显式迁移,
    // 避免 dexie4 死代码 guard 在 transaction 外访问未声明 table 报 "Table undefined"。
    this.version(4).upgrade(async (_tx) => {
      // 当前 v3 → v4 是新增空表, 无需迁移数据; 保留 callback 以备 v5 字段扩展。
    });
    this.version(5).stores({
      items: "++id, category, locationId, status, updatedAt",
      locations: "id, sortOrder, updatedAt",
      outfits: "id, updatedAt, favorite",
      wishlistItems: "id, status, updatedAt",
      tryOnProfile: "id",
      outfitPlanEntries: "id, date, outfitId, calendarPlanId, status, updatedAt",
      outfitCalendarPlans: "id, type, startDate, endDate, updatedAt",
      planPackingChecklistItems: "id, calendarPlanId, source, checked, updatedAt",
    });
  }
}

let database: WardrobeDatabase | null = null;

export function getWardrobeDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前环境不支持本地衣橱数据库");
  }

  if (!database) {
    database = new WardrobeDatabase();
  }

  return database;
}

export async function ensureDefaultLocations() {
  const db = getWardrobeDb();
  const count = await db.locations.count();

  if (count === 0) {
    await db.locations.bulkPut(DEFAULT_LOCATIONS);
  }

  await removeEmptyLegacyAutoLocations(db);
}

async function removeEmptyLegacyAutoLocations(db: WardrobeDatabase) {
  const legacyLocations = await db.locations.bulkGet(REMOVED_AUTO_LOCATION_IDS);
  const removableIds = (
    await Promise.all(
      legacyLocations
        .filter((location): location is ClosetLocation => Boolean(location))
        .map(async (location) => {
          const itemCount = await db.items.where("locationId").equals(location.id).count();
          const isAutoLocation =
            (location.id === "boyfriend_home" && location.name === "男朋友家衣柜") ||
            (location.id === "car_trunk" && location.name === "车子后备箱");
          return isAutoLocation && itemCount === 0 ? location.id : null;
        }),
    )
  ).filter((id): id is string => Boolean(id));

  if (removableIds.length > 0) {
    await db.locations.bulkDelete(removableIds);
  }
}

export async function readWardrobeState() {
  await ensureDefaultLocations();
  const db = getWardrobeDb();
  // v0.9.49-dev auto-fix: wishlistItems 在 transaction 外访问, schema 未声明时 dexie4 可能抛
  // "Table undefined"。这里用 optional chaining + fallback, 失败降级为 []。
  const wishlistItemsFallback: WishlistItem[] = await (async () => {
    try {
      if (!db.wishlistItems) return [];
      const rows = await db.wishlistItems.orderBy("updatedAt").reverse().toArray();
      return rows.map((item) => migrateWishlistItemRecord(item)).filter((item): item is WishlistItem => item !== null);
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[db] wishlistItems read fallback:", error);
      return [];
    }
  })();
  // v1.1.0-dev: 新增三张计划表，旧库无表时返回空数组
  const outfitPlanEntriesFallback: OutfitPlanEntry[] = await (async () => {
    try {
      if (!db.outfitPlanEntries) return [];
      const rows = await db.outfitPlanEntries.orderBy("updatedAt").reverse().toArray();
      return rows.map((e) => migrateOutfitPlanEntryRecord(e)).filter((e): e is OutfitPlanEntry => e !== null);
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[db] outfitPlanEntries read fallback:", error);
      return [];
    }
  })();
  const outfitCalendarPlansFallback: OutfitCalendarPlan[] = await (async () => {
    try {
      if (!db.outfitCalendarPlans) return [];
      const rows = await db.outfitCalendarPlans.orderBy("updatedAt").reverse().toArray();
      return rows.map((p) => migrateOutfitCalendarPlanRecord(p)).filter((p): p is OutfitCalendarPlan => p !== null);
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[db] outfitCalendarPlans read fallback:", error);
      return [];
    }
  })();
  const planPackingChecklistItemsFallback: PlanPackingChecklistItem[] = await (async () => {
    try {
      if (!db.planPackingChecklistItems) return [];
      const rows = await db.planPackingChecklistItems.orderBy("updatedAt").reverse().toArray();
      return rows.map((ci) => migratePlanPackingChecklistItemRecord(ci)).filter((ci): ci is PlanPackingChecklistItem => ci !== null);
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[db] planPackingChecklistItems read fallback:", error);
      return [];
    }
  })();
  const [rawItems, locations, rawOutfits] = await Promise.all([
    db.items.orderBy("updatedAt").reverse().toArray(),
    db.locations.orderBy("sortOrder").toArray(),
    db.outfits.orderBy("updatedAt").reverse().toArray(),
  ]);
  const wishlistItems = wishlistItemsFallback;

  const items = rawItems.map((item) => migrateItemRecord(item));
  const outfits = rawOutfits.map((outfit) => migrateSavedOutfitRecord(outfit));

  const itemIdSet = new Set(items.map((item) => item.id).filter((id): id is number => typeof id === "number"));

  const cleanedOutfits: typeof outfits = [];
  const toDelete: string[] = [];
  const toUpdate: Array<{ id: string; itemIds: number[]; updatedAt: string }> = [];

  for (const outfit of outfits) {
    const filteredIds = outfit.itemIds.filter((id) => itemIdSet.has(id));
    if (filteredIds.length < 2) {
      toDelete.push(outfit.id);
    } else if (filteredIds.length < outfit.itemIds.length) {
      toUpdate.push({ id: outfit.id, itemIds: filteredIds, updatedAt: new Date().toISOString() });
      cleanedOutfits.push({ ...outfit, itemIds: filteredIds });
    } else {
      cleanedOutfits.push(outfit);
    }
  }

  if (toDelete.length > 0 || toUpdate.length > 0) {
    try {
      if (toDelete.length > 0) await db.outfits.bulkDelete(toDelete);
      for (const up of toUpdate) await db.outfits.update(up.id, { itemIds: up.itemIds, updatedAt: up.updatedAt });
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[db] outfit cleanup fallback:", error);
    }
  }

  const cleanedOutfitIdSet = new Set(cleanedOutfits.map((outfit) => outfit.id));
  const cleanedOutfitPlanEntries: OutfitPlanEntry[] = [];
  const planEntryIdsToDelete: string[] = [];
  for (const entry of outfitPlanEntriesFallback) {
    const invalidOutfitRef = Boolean(entry.outfitId && !cleanedOutfitIdSet.has(entry.outfitId));
    const invalidActualOutfitRef = Boolean(entry.actualOutfitId && !cleanedOutfitIdSet.has(entry.actualOutfitId));
    const detachedInvalidItems = !entry.outfitId && Array.isArray(entry.itemIds) && entry.itemIds.length > 0 && entry.itemIds.every((id) => !itemIdSet.has(id));
    if (invalidOutfitRef || invalidActualOutfitRef || detachedInvalidItems) {
      planEntryIdsToDelete.push(entry.id);
    } else {
      cleanedOutfitPlanEntries.push(entry);
    }
  }

  const cleanedPlanPackingChecklistItems: PlanPackingChecklistItem[] = [];
  const packingItemIdsToDelete: string[] = [];
  for (const checklistItem of planPackingChecklistItemsFallback) {
    if (checklistItem.source === "wardrobe" && checklistItem.itemId != null && !itemIdSet.has(checklistItem.itemId)) {
      packingItemIdsToDelete.push(checklistItem.id);
    } else {
      cleanedPlanPackingChecklistItems.push(checklistItem);
    }
  }

  if (planEntryIdsToDelete.length > 0 || packingItemIdsToDelete.length > 0) {
    try {
      for (const id of planEntryIdsToDelete) await db.outfitPlanEntries.delete(id);
      for (const id of packingItemIdsToDelete) await db.planPackingChecklistItems.delete(id);
    } catch (error) {
      if (typeof console !== "undefined") console.warn("[db] plan cleanup fallback:", error);
    }
  }

  return { items, locations, outfits: cleanedOutfits, wishlistItems, outfitPlanEntries: cleanedOutfitPlanEntries, outfitCalendarPlans: outfitCalendarPlansFallback, planPackingChecklistItems: cleanedPlanPackingChecklistItems };
}

export async function readTryOnProfile(): Promise<TryOnProfile> {
  const db = getWardrobeDb();
  const profile = await db.tryOnProfile.get("default");
  if (!profile) return { ...DEFAULT_TRY_ON_PROFILE, updatedAt: new Date().toISOString() };
  // v0.9.22: 老数据 tryOnProfile 可能没有 fitGender 字段, 补默认值 unspecified
  return {
    ...DEFAULT_TRY_ON_PROFILE,
    ...profile,
    fitGender: profile.fitGender ?? "unspecified",
  };
}

export async function saveTryOnProfile(profile: TryOnProfile): Promise<void> {
  const db = getWardrobeDb();
  await db.tryOnProfile.put({ ...profile, id: "default", updatedAt: new Date().toISOString() });
}

export function getExistingOutfitItemIds(outfit: { itemIds: number[] }, itemIdSet: Set<number>): number[] {
  return outfit.itemIds.filter((id) => itemIdSet.has(id));
}

export function getDisplayOutfits(outfits: Array<{ itemIds: number[] }>, itemIdSet: Set<number>) {
  return outfits
    .map((outfit) => ({ ...outfit, itemIds: outfit.itemIds.filter((id) => itemIdSet.has(id)) }))
    .filter((outfit) => outfit.itemIds.length > 0);
}
