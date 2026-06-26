import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";
import { buildColorInfo } from "../src/lib/color-fields";
import {
  createAccountWorkspaceDb,
  createWorkspaceUuidV7,
  type WorkspaceWishlistItemRecord,
} from "../src/lib/account-workspace-db";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import { deleteWishlistItem, writeWishlistItem } from "../src/lib/cloud-sync/sync-engine";
import { toCloudWishlistPayload } from "../src/lib/cloud-sync/wishlist-bridge";
import type { WishlistItem } from "../src/lib/types";

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
  const now = "2026-06-26T13:00:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000002";
  const dbName = `wardrobe_account_b5c_${Date.now()}`;
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "test",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now,
    lastOpenedAt: now,
    deviceId: "device-b5c",
  };

  const wishlistItem: WishlistItem = {
    id: "wishlist-local-1",
    name: "白色针织衫",
    imageDataUrl: "data:image/png;base64,wish",
    sourceImageDataUrl: "data:image/png;base64,source",
    thumbnailDataUrl: "data:image/png;base64,thumb",
    cropBox: { x: 1, y: 2, width: 3, height: 4 },
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring"],
    styles: ["casual"],
    formality: 3,
    warmth: 3,
    status: "interested",
    price: 299,
    createdAt: now,
    updatedAt: now,
    aiAssessment: {
      verdict: "consider",
      summary: "可考虑",
      matchReasons: ["有搭配"],
      conflictReasons: [],
      similarOwnedItemIds: [101],
      suggestedOutfits: [],
      generatedAt: now,
    },
  };

  const safePayload = toCloudWishlistPayload(wishlistItem);
  check("cloud wishlist payload 不包含 DataURL 字段", !JSON.stringify(safePayload).includes("data:image"));
  check("cloud wishlist payload 不包含 cropBox", !Object.prototype.hasOwnProperty.call(safePayload, "cropBox"));
  check("cloud wishlist payload 保留 legacyWishlistId", safePayload["legacyWishlistId"] === wishlistItem.id);
  check("cloud wishlist payload 保留买前评估", typeof safePayload["aiAssessment"] === "object");

  const workspaceWishlistId = createWorkspaceUuidV7(new Date("2026-06-26T13:00:01.000Z"));
  const created = await writeWishlistItem(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { payload: safePayload } },
    {
      id: workspaceWishlistId,
      legacyWishlistId: wishlistItem.id,
      status: wishlistItem.status,
      payload: safePayload,
    },
    "create",
  );
  const stored = await db.wishlistItems.get(workspaceWishlistId);
  const createOutbox = await db.syncOutbox.toArray();
  check("writeWishlistItem 写入 wishlistItem", stored?.legacyWishlistId === wishlistItem.id);
  check("writeWishlistItem 入队 create outbox", createOutbox.length === 1 && createOutbox[0].operation === "create");

  const updatedPayload = { ...safePayload, status: "archived", convertedItemId: 55 };
  const updated = await writeWishlistItem(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: created.revision, payload: { payload: updatedPayload } },
    {
      id: workspaceWishlistId,
      legacyWishlistId: wishlistItem.id,
      status: "archived",
      payload: updatedPayload,
    },
    "update",
  );
  const updateOutbox = await db.syncOutbox.toArray();
  check("writeWishlistItem 更新 revision", updated.revision === 2);
  check("writeWishlistItem 入队 update outbox", updateOutbox.length === 2 && updateOutbox[1].operation === "update");

  await deleteWishlistItem(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: updated.revision, payload: {} },
    updated as WorkspaceWishlistItemRecord,
  );
  const deleted = await db.wishlistItems.get(workspaceWishlistId);
  const deleteOutbox = await db.syncOutbox.toArray();
  check("deleteWishlistItem 软删除 wishlistItem", typeof deleted?.deletedAt === "string");
  check("deleteWishlistItem 入队 delete outbox", deleteOutbox.length === 3 && deleteOutbox[2].operation === "delete");

  db.close();
  await Dexie.delete(dbName);

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
