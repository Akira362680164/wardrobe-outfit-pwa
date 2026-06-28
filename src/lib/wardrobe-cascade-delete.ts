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
