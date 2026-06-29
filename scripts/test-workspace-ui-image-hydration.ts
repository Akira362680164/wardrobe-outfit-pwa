import "fake-indexeddb/auto";

import { strict as assert } from "node:assert";

import { createAccountWorkspaceDb } from "../src/lib/account-workspace-db";
import { readWorkspaceUiSnapshot } from "../src/lib/cloud-sync/workspace-ui-mapper";

const NOW = "2026-06-29T00:00:00.000Z";
const ORIGINAL = "data:image/png;base64,b3JpZ2luYWw=";
const THUMBNAIL = "data:image/png;base64,dGh1bWJuYWls";

async function main() {
  const db = createAccountWorkspaceDb(`image-hydration-${crypto.randomUUID()}`);
  const common = { userId: "user-1", revision: 1, createdAt: NOW, updatedAt: NOW, originDeviceId: "device-1" };
  await db.locations.put({ ...common, id: "location-1", name: "默认衣橱", payload: { dexieId: "home", name: "默认衣橱" } });
  await db.garments.put({ ...common, id: "garment-1", legacyItemId: 1, locationId: "home", name: "外套", payload: { name: "外套", category: "outerwear" } });
  await db.wishlistItems.put({ ...common, id: "wishlist-1", legacyWishlistId: "wish-1", status: "interested", payload: { name: "鞋" } });
  await db.outfits.put({ ...common, id: "outfit-1", legacyOutfitId: "look-1", name: "套装", payload: { name: "套装", outfitRealImages: [{ id: "real-1", createdAt: NOW, updatedAt: NOW }] } });

  await Promise.all([
    putAsset(db, common, "asset-g", "garment", "garment-1", "imageDataUrl"),
    putAsset(db, common, "asset-w", "wishlistItem", "wishlist-1", "imageDataUrl"),
    putAsset(db, common, "asset-o", "outfit", "outfit-1", "coverImageDataUrl"),
    putAsset(db, common, "asset-r", "outfit", "outfit-1", "outfitRealImages.real-1.imageDataUrl"),
  ]);

  const snapshot = await readWorkspaceUiSnapshot(db);
  assert.equal(snapshot.items[0]?.imageDataUrl, ORIGINAL);
  assert.equal(snapshot.items[0]?.thumbnailDataUrl, THUMBNAIL);
  assert.equal(snapshot.wishlistItems[0]?.imageDataUrl, ORIGINAL);
  assert.equal(snapshot.outfits[0]?.coverImageDataUrl, ORIGINAL);
  assert.equal(snapshot.outfits[0]?.outfitRealImages?.[0]?.imageDataUrl, ORIGINAL);

  const remoteDb = createAccountWorkspaceDb(`image-cache-${crypto.randomUUID()}`);
  await remoteDb.garments.put({
    ...common,
    id: "garment-cache",
    legacyItemId: 2,
    locationId: "home",
    name: "缓存衣物",
    payload: {
      name: "缓存衣物",
      cloudAssetRefs: {
        imageDataUrl: { assetId: "cached-asset", sourceFieldName: "imageDataUrl", variants: ["original"], sha256: "a".repeat(64), mimeType: "image/png" },
      },
    },
  });
  const cache = {
    get: async () => null,
    downloadAndCache: async () => ({ blob: new Blob(["downloaded"], { type: "image/png" }), sha256: "a".repeat(64), mimeType: "image/png" }),
  };
  const remoteSnapshot = await readWorkspaceUiSnapshot(remoteDb, { imageCache: cache });
  assert.match(remoteSnapshot.items[0]?.imageDataUrl ?? "", /^data:image\/png;base64,/);

  const failed = await readWorkspaceUiSnapshot(remoteDb, {
    imageCache: { get: async () => null, downloadAndCache: async () => null },
  });
  assert.equal(failed.items.length, 1);
  assert.equal(failed.items[0]?.imageDataUrl, "");

  console.log("workspace UI image hydration: passed");
}

async function putAsset(
  db: ReturnType<typeof createAccountWorkspaceDb>,
  common: { userId: string; revision: number; createdAt: string; updatedAt: string; originDeviceId: string },
  id: string,
  ownerEntityType: "garment" | "wishlistItem" | "outfit",
  ownerEntityId: string,
  fieldName: string,
) {
  await db.assets.put({
    ...common,
    id,
    ownerEntityType,
    ownerEntityId,
    payload: {
      uploads: {
        original: { status: "local_pending", dataUrl: ORIGINAL },
        thumbnail: { status: "local_pending", dataUrl: THUMBNAIL },
      },
      source: { kind: "legacy_entity_image", fieldName },
      thumbnailStatus: "ready",
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
