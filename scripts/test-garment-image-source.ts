import assert from "node:assert/strict";
import { deriveGarmentImageList, isMainImageEntry, isReferenceOutfitEntry } from "../src/lib/garment-image-source";
import { buildColorInfo } from "../src/lib/color-fields";
import type { ImageAssetReference, ReferenceOutfitImage, SavedOutfit, WardrobeItem } from "../src/lib/types";

function asset(assetId: string): ImageAssetReference {
  return { assetId, variants: ["original", "thumbnail"], sha256: `sha-${assetId}`, mimeType: "image/jpeg" };
}

function item(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 1,
    name: "白色 T 恤",
    mainImage: { asset: asset("main"), cropBox: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } },
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["all"],
    styles: ["casual"],
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function reference(id: string, createdAt: string, assetId = id): ReferenceOutfitImage {
  return { id, image: { asset: asset(assetId) }, createdAt, updatedAt: createdAt };
}

function outfit(overrides: Partial<SavedOutfit> = {}): SavedOutfit {
  return {
    id: "outfit-1",
    name: "测试套装",
    itemIds: [1],
    favorite: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const base = deriveGarmentImageList(item(), []);
assert.equal(base.length, 1);
assert.equal(base[0]?.source, "main");
assert.equal(base[0]?.image?.asset.assetId, "main");
assert.deepEqual(base[0]?.image?.cropBox, { x: 0.1, y: 0.2, width: 0.7, height: 0.6 });
assert.equal(isMainImageEntry(base[0]), true);
assert.equal(isReferenceOutfitEntry(base[0]), false);

assert.deepEqual(deriveGarmentImageList(item({ mainImage: undefined }), []), []);
assert.deepEqual(deriveGarmentImageList(null, []), []);

const refs = deriveGarmentImageList(item({
  referenceOutfitImages: [
    reference("late", "2026-06-03T00:00:00.000Z"),
    reference("early", "2026-06-02T00:00:00.000Z"),
    reference("duplicate-main", "2026-06-04T00:00:00.000Z", "main"),
  ],
}), []);
assert.deepEqual(refs.map((entry) => entry.refId).slice(1), ["early", "late"]);
assert.equal(refs[1]?.image?.asset.assetId, "early");
assert.equal(isReferenceOutfitEntry(refs[1]), true);

const related = deriveGarmentImageList(item(), [
  outfit({ id: "old", updatedAt: "2026-06-02T00:00:00.000Z" }),
  outfit({ id: "new", updatedAt: "2026-06-03T00:00:00.000Z" }),
  outfit({ id: "unrelated", itemIds: [99] }),
  outfit({ id: "new", updatedAt: "2026-06-03T00:00:00.000Z" }),
]);
assert.deepEqual(related.slice(1).map((entry) => entry.outfitId), ["new", "old"]);
assert.ok(related.slice(1).every((entry) => entry.renderKind === "outfit" && entry.image === undefined));

console.log("✅ test-garment-image-source: asset-reference derivation passed");
