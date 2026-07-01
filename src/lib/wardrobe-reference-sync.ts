import type { SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { buildLocalOutfitMetadataFromItems } from "@/lib/outfit-ai-metadata";
import { buildOutfitCoverRefreshPatch, getExistingOutfitItems } from "@/lib/outfit-cover";

export function buildSyncedOutfitPatch(outfit: SavedOutfit, allItems: WardrobeItem[], now: string): Partial<SavedOutfit> {
  const outfitItems = getExistingOutfitItems(outfit, allItems);
  const metadata = buildLocalOutfitMetadataFromItems({
    outfitItems,
    currentName: outfit.name,
  });

  return {
    ...buildOutfitCoverRefreshPatch(outfit.itemIds, allItems),
    name: metadata.name ?? outfit.name,
    seasons: metadata.seasons,
    sceneTags: metadata.sceneTags,
    styleTags: metadata.styleTags,
    pairingTags: metadata.pairingTags,
    temperatureRange: metadata.temperatureRange,
    notes: metadata.notes,
    aiSuggestion: undefined,
    updatedAt: now,
  };
}

export function buildSyncedPurchasedWishlistPatch(item: WardrobeItem, now: string): Partial<WishlistItem> {
  return {
    name: item.name,
    mainImage: item.mainImage,
    category: item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    seasons: item.seasons,
    styles: item.styles,
    temperatureRange: item.temperatureRange,
    formality: item.formality,
    warmth: item.warmth,
    material: item.material,
    fitGender: item.fitGender,
    fitNotes: item.fitNotes,
    price: item.price,
    productUrl: item.productUrl,
    notes: item.notes,
    convertedItemDeletedAt: undefined,
    updatedAt: now,
  };
}

export function isConvertedWishlistLinkDeleted(wishlistItem: WishlistItem, items: WardrobeItem[]): boolean {
  if (wishlistItem.convertedItemDeletedAt) return true;
  if (typeof wishlistItem.convertedItemId !== "number") return false;
  return !items.some((item) => item.id === wishlistItem.convertedItemId);
}
