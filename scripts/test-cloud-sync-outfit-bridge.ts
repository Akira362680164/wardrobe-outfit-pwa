import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";
import {
  createAccountWorkspaceDb,
  createWorkspaceUuidV7,
  type WorkspaceGarmentRecord,
} from "../src/lib/account-workspace-db";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import { deleteOutfitBundle, writeOutfitBundle } from "../src/lib/cloud-sync/sync-engine";
import { toCloudOutfitPayload } from "../src/lib/cloud-sync/outfit-bridge";
import type { SavedOutfit } from "../src/lib/types";

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
  const now = "2026-06-26T12:30:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000001";
  const dbName = `wardrobe_account_b5b_${Date.now()}`;
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
    deviceId: "device-b5b",
  };

  const garmentA: WorkspaceGarmentRecord = {
    id: createWorkspaceUuidV7(new Date("2026-06-26T12:30:01.000Z")),
    userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    originDeviceId: "device-b5b",
    legacyItemId: 101,
    name: "白衬衫",
  };
  const garmentB: WorkspaceGarmentRecord = {
    ...garmentA,
    id: createWorkspaceUuidV7(new Date("2026-06-26T12:30:02.000Z")),
    legacyItemId: 102,
    name: "牛仔裤",
  };
  await db.garments.bulkPut([garmentA, garmentB]);

  const legacyOutfit: SavedOutfit = {
    id: "manual-local-1",
    name: "通勤套装",
    itemIds: [101, 102],
    coverImageDataUrl: "data:image/png;base64,cover",
    previewImageDataUrl: "data:image/png;base64,preview",
    sourceImageDataUrl: "data:image/png;base64,source",
    thumbnailDataUrl: "data:image/png;base64,thumb",
    autoCoverImageDataUrl: "data:image/png;base64,auto",
    outfitRealImages: [],
    destination: "办公室",
    activity: "commute",
    style: "commute",
    source: "manual",
    favorite: true,
    createdAt: now,
    updatedAt: now,
  };
  const safePayload = toCloudOutfitPayload(legacyOutfit);
  check("cloud outfit payload 不包含 DataURL 字段", !JSON.stringify(safePayload).includes("data:image"));
  check("cloud outfit payload 不把 itemIds 作为权威字段", !Object.prototype.hasOwnProperty.call(safePayload, "itemIds"));
  check("cloud outfit payload 保留 legacyItemIds 供迁移追踪", JSON.stringify(safePayload["legacyItemIds"]) === "[101,102]");

  const outfitId = createWorkspaceUuidV7(new Date("2026-06-26T12:30:03.000Z"));
  await writeOutfitBundle(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { payload: safePayload } },
    {
      operation: "create",
      outfit: { id: outfitId, legacyOutfitId: legacyOutfit.id, name: legacyOutfit.name, payload: safePayload },
      outfitItems: [
        { outfitId, garmentId: garmentA.id, sortOrder: 0 },
        { outfitId, garmentId: garmentB.id, sortOrder: 1 },
      ],
    },
  );

  const createdOutfit = await db.outfits.get(outfitId);
  const createdItems = await db.outfitItems.where("outfitId").equals(outfitId).toArray();
  const createOutbox = await db.syncOutbox.toArray();
  check("writeOutfitBundle 写入 outfit", createdOutfit?.legacyOutfitId === legacyOutfit.id);
  check("writeOutfitBundle 写入 outfitItems 关系", createdItems.length === 2);
  check("writeOutfitBundle 为 outfit + outfitItems 入队 outbox", createOutbox.length === 3);

  const keptItem = createdItems.find((item) => item.garmentId === garmentA.id);
  const removedItem = createdItems.find((item) => item.garmentId === garmentB.id);
  assert(createdOutfit);
  assert(keptItem);
  assert(removedItem);
  const updatedPayload = { ...safePayload, name: "通勤套装 2" };
  await writeOutfitBundle(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: createdOutfit.revision, payload: { payload: updatedPayload } },
    {
      operation: "update",
      outfit: { id: outfitId, legacyOutfitId: legacyOutfit.id, name: "通勤套装 2", payload: updatedPayload },
      outfitItems: [{ id: keptItem.id, outfitId, garmentId: garmentA.id, sortOrder: 0, baseRevision: keptItem.revision }],
      removedOutfitItems: [removedItem],
    },
  );
  const afterUpdateOutfit = await db.outfits.get(outfitId);
  const afterUpdateRemovedItem = await db.outfitItems.get(removedItem.id);
  const afterUpdateOutbox = await db.syncOutbox.toArray();
  check("writeOutfitBundle 更新 outfit revision", afterUpdateOutfit?.revision === 2);
  check("writeOutfitBundle 对移除关系软删除", typeof afterUpdateRemovedItem?.deletedAt === "string");
  check("writeOutfitBundle 为更新和级联删除入队", afterUpdateOutbox.length === 6);

  assert(afterUpdateOutfit);
  const activeItems = (await db.outfitItems.where("outfitId").equals(outfitId).toArray()).filter((item) => !item.deletedAt);
  await deleteOutfitBundle(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: afterUpdateOutfit.revision, payload: {} },
    afterUpdateOutfit,
    activeItems,
  );
  const deletedOutfit = await db.outfits.get(outfitId);
  const deletedActiveItem = await db.outfitItems.get(activeItems[0].id);
  const deleteOutbox = await db.syncOutbox.toArray();
  check("deleteOutfitBundle 软删除 outfit", typeof deletedOutfit?.deletedAt === "string");
  check("deleteOutfitBundle 级联软删除 active outfitItem", typeof deletedActiveItem?.deletedAt === "string");
  check("deleteOutfitBundle 为 outfit + active outfitItem 入队删除", deleteOutbox.length === 8);

  db.close();
  await Dexie.delete(dbName);

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
