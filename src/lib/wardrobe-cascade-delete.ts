import type { OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { buildSyncedOutfitPatch } from "@/lib/wardrobe-reference-sync";

export type WardrobeCascadeDeleteSource = "manual_delete" | "wishlist_undo_purchase";

export interface WardrobeCascadeDeleteResult {
  deletedItemIds: number[];
  updatedOutfitIds: string[];
  deletedOutfitIds: string[];
  deletedPlanEntryIds: string[];
  deletedPackingItemIds: string[];
  markedDeletedWishlistIds: string[];
  clearedWishlistConvertedIds: string[];
}

interface CascadeDb {
  // Dexie transaction has several overloads; tests may provide a small compatible runner.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: (...args: any[]) => Promise<unknown>;
  items: {
    toArray?: () => Promise<WardrobeItem[]>;
    bulkDelete?: (ids: number[]) => Promise<unknown>;
    delete?: (id: number) => Promise<unknown>;
  };
  outfits: {
    toArray: () => Promise<SavedOutfit[]>;
    update: (id: string, patch: Partial<SavedOutfit>) => Promise<unknown>;
    delete: (id: string) => Promise<unknown>;
  };
  outfitPlanEntries?: {
    toArray: () => Promise<OutfitPlanEntry[]>;
    delete: (id: string) => Promise<unknown>;
  };
  planPackingChecklistItems?: {
    toArray: () => Promise<PlanPackingChecklistItem[]>;
    delete: (id: string) => Promise<unknown>;
  };
  wishlistItems?: {
    toArray: () => Promise<WishlistItem[]>;
    update: (id: string, patch: Partial<WishlistItem>) => Promise<unknown>;
  };
}

function uniqueNumberIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
}

function isTransactionTable(table: object | undefined): table is object {
  return Boolean(table);
}

function hasDeletedOutfitReference(entry: OutfitPlanEntry, deletedOutfitIds: Set<string>): boolean {
  return Boolean(
    (entry.outfitId && deletedOutfitIds.has(entry.outfitId)) ||
    (entry.actualOutfitId && deletedOutfitIds.has(entry.actualOutfitId)),
  );
}

function hasOnlyDeletedDetachedItems(entry: OutfitPlanEntry, deletedItemIds: Set<number>, deletedOutfitIds: Set<string>): boolean {
  if (!Array.isArray(entry.itemIds) || entry.itemIds.length === 0) return false;
  const hasValidOutfitRef = Boolean(entry.outfitId && !deletedOutfitIds.has(entry.outfitId));
  if (hasValidOutfitRef) return false;
  return entry.itemIds.every((itemId) => deletedItemIds.has(itemId));
}

async function bulkDeleteItems(db: CascadeDb, itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return;
  if (typeof db.items.bulkDelete === "function") {
    await db.items.bulkDelete(itemIds);
    return;
  }
  for (const id of itemIds) {
    await db.items.delete?.(id);
  }
}

export async function deleteWardrobeItemsWithCascade(input: {
  db: CascadeDb;
  itemIds: number[];
  source: WardrobeCascadeDeleteSource;
}): Promise<WardrobeCascadeDeleteResult> {
  const { db } = input;
  const deletedItemIds = uniqueNumberIds(input.itemIds);
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

  const transactionTables = [db.items, db.outfits, db.outfitPlanEntries, db.planPackingChecklistItems, db.wishlistItems].filter(isTransactionTable);
  await db.transaction(
    "rw",
    transactionTables,
    async () => {
      const now = new Date().toISOString();

      await bulkDeleteItems(db, deletedItemIds);

      const remainingItems = typeof db.items.toArray === "function" ? await db.items.toArray() : [];
      const outfits = await db.outfits.toArray();
      for (const outfit of outfits) {
        const nextItemIds = outfit.itemIds.filter((itemId) => !deletedItemIdSet.has(itemId));
        if (nextItemIds.length === outfit.itemIds.length) continue;

        if (nextItemIds.length >= 2) {
          const nextOutfit = { ...outfit, itemIds: nextItemIds };
          await db.outfits.update(outfit.id, { itemIds: nextItemIds, ...buildSyncedOutfitPatch(nextOutfit, remainingItems, now) });
          result.updatedOutfitIds.push(outfit.id);
        } else {
          await db.outfits.delete(outfit.id);
          result.deletedOutfitIds.push(outfit.id);
        }
      }

      const deletedOutfitIdSet = new Set(result.deletedOutfitIds);

      if (db.outfitPlanEntries) {
        const entries = await db.outfitPlanEntries.toArray();
        for (const entry of entries) {
          if (
            hasDeletedOutfitReference(entry, deletedOutfitIdSet) ||
            hasOnlyDeletedDetachedItems(entry, deletedItemIdSet, deletedOutfitIdSet)
          ) {
            await db.outfitPlanEntries.delete(entry.id);
            result.deletedPlanEntryIds.push(entry.id);
          }
        }
      }

      if (db.planPackingChecklistItems) {
        const checklistItems = await db.planPackingChecklistItems.toArray();
        for (const checklistItem of checklistItems) {
          if (checklistItem.source !== "wardrobe") continue;
          if (checklistItem.itemId == null || !deletedItemIdSet.has(checklistItem.itemId)) continue;
          await db.planPackingChecklistItems.delete(checklistItem.id);
          result.deletedPackingItemIds.push(checklistItem.id);
        }
      }

      // 手工删除衣橱单品时保留已买记录, 但标记关联单品已删除; 撤销购买链路仍清空转换关系。
      if (db.wishlistItems) {
        const wishlistItems = await db.wishlistItems.toArray();
        for (const item of wishlistItems) {
          if (item.convertedItemId == null || !deletedItemIdSet.has(item.convertedItemId)) continue;
          if (input.source === "wishlist_undo_purchase") {
            await db.wishlistItems.update(item.id, { convertedItemId: undefined, convertedAt: undefined, convertedItemDeletedAt: undefined, updatedAt: now });
            result.clearedWishlistConvertedIds.push(item.id);
          } else {
            await db.wishlistItems.update(item.id, { convertedItemDeletedAt: now, updatedAt: now });
            result.markedDeletedWishlistIds.push(item.id);
          }
        }
      }
    },
  );

  return result;
}
