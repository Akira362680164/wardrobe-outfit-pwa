import assert from "node:assert/strict";
import fs from "node:fs";
import { deriveGarmentImageList } from "../src/lib/garment-image-source";
import { getCollageImageAssets, getOutfitCover } from "../src/lib/outfit-cover";
import { buildColorInfo } from "../src/lib/color-fields";
import type { ImageAssetReference, SavedOutfit, WardrobeItem } from "../src/lib/types";

function asset(assetId: string): ImageAssetReference {
  return { assetId, variants: ["original", "thumbnail"], sha256: `sha-${assetId}`, mimeType: "image/jpeg" };
}

function item(id: number, assetId: string): WardrobeItem {
  return {
    id,
    name: `单品 ${id}`,
    mainImage: { asset: asset(assetId) },
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["all"],
    styles: ["casual"],
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function outfit(overrides: Partial<SavedOutfit> = {}): SavedOutfit {
  return {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [1, 2],
    favorite: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

const items = [item(1, "item-a"), item(2, "item-b")];
assert.equal(getOutfitCover(outfit(), items).mode, "auto_collage");
assert.deepEqual(getCollageImageAssets(outfit(), items).map((entry) => entry.assetId), ["item-a", "item-b"]);
assert.equal(getOutfitCover(outfit({ itemIds: [99] }), items).mode, "empty");

const explicit = getOutfitCover(outfit({ coverImage: { asset: asset("cover") } }), items);
assert.equal(explicit.mode, "preview");
assert.equal(explicit.asset?.assetId, "cover");

const realPhoto = getOutfitCover(outfit({
  itemIds: [],
  outfitRealImages: [{ id: "real", image: { asset: asset("real") }, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" }],
}), []);
assert.equal(realPhoto.mode, "real_photo");
assert.equal(realPhoto.asset?.assetId, "real");

const related = deriveGarmentImageList(items[0], [outfit()]);
assert.equal(related[1]?.renderKind, "outfit");
assert.equal(related[1]?.outfitId, "outfit-1");
assert.equal(related[1]?.image, undefined);

const wardrobeSource = fs.readFileSync("src/components/wardrobe-app.tsx", "utf8");
const waterfallStart = wardrobeSource.indexOf("function WaterfallCardImage(");
const waterfall = wardrobeSource.slice(waterfallStart, waterfallStart + 3500);
assert.ok(waterfallStart >= 0);
assert.ok(waterfall.includes('renderKind === "outfit"'));
assert.ok(waterfall.includes("<OutfitCover"));
assert.ok(waterfall.includes("asset: entry.image?.asset"));

const carouselSource = fs.readFileSync("src/components/swipe-image-carousel.tsx", "utf8");
assert.ok(carouselSource.includes("asset?: ImageAssetReference"));
assert.ok(carouselSource.includes("asset={slide.asset}"));

console.log("✅ test-outfit-cover-consistency: server asset cover rules passed");
