import assert from "node:assert/strict";
import { countValidItems, getCollageImageAssets, getOutfitCover } from "../src/lib/outfit-cover";
import { buildSyncedOutfitPatch, buildSyncedPurchasedWishlistPatch } from "../src/lib/wardrobe-reference-sync";
import { toggleTodayWornDate, getLocalDateKey } from "../src/lib/wear-records";
import { buildColorInfo } from "../src/lib/color-fields";
import type { ImageAssetReference, SavedOutfit, WardrobeItem } from "../src/lib/types";

const asset = (assetId: string): ImageAssetReference => ({ assetId, variants: ["original", "thumbnail"], sha256: `sha-${assetId}`, mimeType: "image/jpeg" });
const item = (id: number): WardrobeItem => ({
  id, name: `Item ${id}`, mainImage: { asset: asset(`item-${id}`) }, category: "tops",
  colors: buildColorInfo("single", []), seasons: [], styles: [], locationId: "home", status: "active",
  wornDates: [], createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
});
const outfit = (overrides: Partial<SavedOutfit> = {}): SavedOutfit => ({
  id: "outfit", name: "套装", itemIds: [1, 2], favorite: true,
  createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", ...overrides,
});

const items = [item(1), item(2), item(3), item(4)];
assert.equal(getOutfitCover(outfit(), items).mode, "auto_collage");
assert.equal(getOutfitCover(outfit({ itemIds: [99] }), items).mode, "empty");
assert.equal(getOutfitCover(outfit({ itemIds: [] }), items).mode, "empty");
assert.equal(getOutfitCover(outfit({ coverImage: { asset: asset("cover") } }), items).asset?.assetId, "cover");
assert.deepEqual(getCollageImageAssets(outfit({ itemIds: [1, 2, 3, 4, 99] }), items).map((entry) => entry.assetId), ["item-1", "item-2", "item-3", "item-4"]);
assert.equal(countValidItems(outfit({ itemIds: [1, 99, 3] }), items), 2);

const now = "2026-07-01T00:00:00.000Z";
const synced = buildSyncedOutfitPatch(outfit({ aiSuggestion: { summary: "旧建议", suitableScenes: [], unsuitableScenes: [], strengths: [], risks: [], replacementSuggestions: [], missingItems: [], generatedAt: now } }), items, now);
assert.equal(synced.name, "套装");
assert.equal(synced.aiSuggestion, undefined);
const wishlist = buildSyncedPurchasedWishlistPatch({ ...items[0]!, name: "编辑后单品", price: 199 }, now);
assert.equal(wishlist.name, "编辑后单品");
assert.equal(wishlist.price, 199);
assert.equal(wishlist.mainImage?.asset.assetId, "item-1");

const today = getLocalDateKey();
const worn = toggleTodayWornDate([], today);
assert.ok(worn.includes(today));
assert.ok(!toggleTodayWornDate(worn, today).includes(today));

console.log("✅ test-outfit-asset-center: asset references and wear rules passed");
