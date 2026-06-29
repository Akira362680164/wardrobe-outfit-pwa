import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";

import { buildColorInfo } from "../src/lib/color-fields";
import {
  createAccountWorkspaceDb,
  createWorkspaceUuidV7,
  type WorkspaceGarmentRecord,
} from "../src/lib/account-workspace-db";
import {
  imageAssetInputsForGarment,
  imageAssetInputsForOutfit,
  imageAssetInputsForWishlist,
  prepareEntityImageAssets,
  putPreparedEntityImageAssets,
} from "../src/lib/cloud-sync/asset-bridge";
import { toCloudGarmentPayload } from "../src/lib/cloud-sync/garment-bridge";
import { toCloudOutfitPayload } from "../src/lib/cloud-sync/outfit-bridge";
import { writeGarment, writeOutfitBundle, writeWishlistItem } from "../src/lib/cloud-sync/sync-engine";
import { toCloudWishlistPayload } from "../src/lib/cloud-sync/wishlist-bridge";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import type { SavedOutfit, WardrobeItem, WishlistItem } from "../src/lib/types";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function main() {
  const now = "2026-06-26T15:00:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000003";
  const dbName = `wardrobe_assets_bridge_${Date.now()}`;
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "assets-bridge",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now,
    lastOpenedAt: now,
    deviceId: "device-assets-bridge",
  };

  const garment: WardrobeItem = {
    id: 101,
    name: "云同步白衬衫",
    imageDataUrl: "data:image/png;base64,Z2FybWVudA==",
    thumbnailDataUrl: "data:image/jpeg;base64,Z2FybWVudC10aHVtYg==",
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring"],
    styles: ["commute"],
    locationId: "default",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
  const garmentId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:01.000Z"));
  const garmentAssets = await prepareEntityImageAssets(db, {
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "garment",
    ownerEntityId: garmentId,
    images: imageAssetInputsForGarment(garment),
  }, { readImageSize: async () => ({ width: 800, height: 1000 }) });
  const garmentPayload = toCloudGarmentPayload(garment, garmentAssets.assetRefs);
  check("garment payload 不含 DataURL", !JSON.stringify(garmentPayload).includes("data:image"));
  check("garment payload 包含 imageDataUrl asset 引用", typeof (garmentPayload.cloudAssetRefs as Record<string, unknown> | undefined)?.imageDataUrl === "object");
  await writeGarment(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { payload: garmentPayload } },
    { id: garmentId, legacyItemId: garment.id, locationId: garment.locationId, name: garment.name, payload: garmentPayload },
    "create",
  );
  await putPreparedEntityImageAssets(db, workspace, garmentAssets);
  const garmentAssetRows = await db.assets.where("ownerEntityId").equals(garmentId).toArray();
  check("garment 只写入一个主图 asset 记录", garmentAssetRows.length === 1 && garmentAssetRows[0]?.ownerEntityType === "garment");
  check("garment 主图 asset 同时包含 original 和 thumbnail", garmentAssets.assetRefs.imageDataUrl?.variants.join(",") === "original,thumbnail");
  check("garment asset payload 保存 dataUrl 用于上传暂存", JSON.stringify(garmentAssetRows[0].payload).includes("data:image"));
  const uploadedPayload = garmentAssetRows[0].payload as import("../src/lib/cloud-sync/asset-metadata").LocalAssetPayload;
  if (uploadedPayload.uploads.original) uploadedPayload.uploads.original.status = "uploaded";
  if (uploadedPayload.uploads.thumbnail) uploadedPayload.uploads.thumbnail.status = "uploaded";
  await db.assets.update(garmentAssetRows[0].id, { payload: uploadedPayload });
  const recroppedAssets = await prepareEntityImageAssets(db, {
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "garment",
    ownerEntityId: garmentId,
    images: imageAssetInputsForGarment({ ...garment, thumbnailDataUrl: "data:image/jpeg;base64,bmV3LXRodW1i" }),
  }, { readImageSize: async () => ({ width: 800, height: 1000 }) });
  const recroppedPayload = recroppedAssets.preparedAssets[0].record.payload as import("../src/lib/cloud-sync/asset-metadata").LocalAssetPayload;
  check("重新裁切时相同 original 不重新排队", recroppedPayload.uploads.original?.status === "uploaded");
  check("重新裁切时新 thumbnail 单独排队", recroppedPayload.uploads.thumbnail?.status === "local_pending");

  const wishlist: WishlistItem = {
    id: "wish-asset-1",
    name: "云同步针织衫",
    imageDataUrl: "data:image/png;base64,d2lzaA==",
    thumbnailDataUrl: "data:image/jpeg;base64,d2lzaC10aHVtYg==",
    category: "tops",
    colors: buildColorInfo("single", ["米"]),
    seasons: ["autumn"],
    styles: ["casual"],
    status: "interested",
    createdAt: now,
    updatedAt: now,
  };
  const wishlistId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:02.000Z"));
  const wishlistAssets = await prepareEntityImageAssets(db, {
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "wishlistItem",
    ownerEntityId: wishlistId,
    images: imageAssetInputsForWishlist(wishlist),
  });
  const wishlistPayload = toCloudWishlistPayload(wishlist, wishlistAssets.assetRefs);
  await writeWishlistItem(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { payload: wishlistPayload } },
    { id: wishlistId, legacyWishlistId: wishlist.id, status: wishlist.status, payload: wishlistPayload },
    "create",
  );
  await putPreparedEntityImageAssets(db, workspace, wishlistAssets);
  check("wishlist payload 不含 DataURL 且含 asset 引用", !JSON.stringify(wishlistPayload).includes("data:image") && typeof (wishlistPayload.cloudAssetRefs as Record<string, unknown> | undefined)?.imageDataUrl === "object");
  check("wishlist 写入 asset 记录", (await db.assets.where("ownerEntityId").equals(wishlistId).count()) === 1);

  const outfit: SavedOutfit = {
    id: "outfit-asset-1",
    name: "云同步套装",
    itemIds: [101],
    coverImageDataUrl: "data:image/png;base64,b3V0Zml0LWNvdmVy",
    previewImageDataUrl: "data:image/png;base64,b3V0Zml0LXByZXZpZXc=",
    thumbnailDataUrl: "data:image/jpeg;base64,b3V0Zml0LXRodW1i",
    outfitRealImages: [{
      id: "real-1",
      imageDataUrl: "data:image/png;base64,b3V0Zml0LXJlYWw=",
      thumbnailDataUrl: "data:image/jpeg;base64,b3V0Zml0LXJlYWwtdGh1bWI=",
      createdAt: now,
      updatedAt: now,
    }],
    source: "manual",
    favorite: true,
    createdAt: now,
    updatedAt: now,
  };
  const outfitId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:03.000Z"));
  await db.garments.put({
    id: garmentId,
    userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    originDeviceId: workspace.deviceId,
    legacyItemId: 101,
  } satisfies WorkspaceGarmentRecord);
  const outfitAssets = await prepareEntityImageAssets(db, {
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "outfit",
    ownerEntityId: outfitId,
    images: imageAssetInputsForOutfit(outfit),
  });
  const outfitPayload = toCloudOutfitPayload(outfit, outfitAssets.assetRefs);
  await writeOutfitBundle(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { payload: outfitPayload } },
    {
      operation: "create",
      outfit: { id: outfitId, legacyOutfitId: outfit.id, name: outfit.name, payload: outfitPayload },
      outfitItems: [{ outfitId, garmentId, sortOrder: 0 }],
    },
  );
  await putPreparedEntityImageAssets(db, workspace, outfitAssets);
  const outfitAssetRows = await db.assets.where("ownerEntityId").equals(outfitId).toArray();
  check("outfit payload 不含 DataURL", !JSON.stringify(outfitPayload).includes("data:image"));
  check("outfit payload 包含套装实图 asset 引用", typeof (outfitPayload.cloudAssetRefs as Record<string, unknown> | undefined)?.["outfitRealImages.real-1.imageDataUrl"] === "object");
  check("outfit 写入多张 asset 记录", outfitAssetRows.length === 3);

  const outboxJson = JSON.stringify(await db.syncOutbox.toArray());
  check("结构化 outbox 不包含图片 DataURL", !outboxJson.includes("data:image"));

  db.close();
  await Dexie.delete(dbName);
  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
