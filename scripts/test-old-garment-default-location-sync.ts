import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";
import {
  createWorkspaceUuidV7,
  getAccountWorkspaceDb,
  type WorkspaceGarmentRecord,
  type WorkspaceLocationRecord,
} from "../src/lib/account-workspace-db";
import { deleteWorkspaceGarmentByItemId } from "../src/lib/cloud-sync/garment-bridge";
import { hashWorkspaceIdToNumber, resolveWorkspaceGarmentItemId } from "../src/lib/cloud-sync/hash-workspace-id";
import { bridgeLocationDelete, initializeDefaultWorkspaceLocation, normalizeDefaultWorkspaceLocation } from "../src/lib/cloud-sync/location-bridge";
import { buildEntityRecord } from "../src/lib/cloud-sync/sync-engine";
import { readWorkspaceUiSnapshot } from "../src/lib/cloud-sync/workspace-ui-mapper";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";

async function main() {
  const now = "2026-06-28T12:00:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000028";
  const deviceId = "device-old-garment-regression";
  const dbName = `wardrobe_old_garment_regression_${Date.now()}`;
  await Dexie.delete(dbName);
  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "old-garment-regression",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now,
    lastOpenedAt: now,
    deviceId,
  };
  const db = getAccountWorkspaceDb(workspace);
  await db.open();
  const oldGarment: WorkspaceGarmentRecord = {
    id: createWorkspaceUuidV7(new Date(now)),
    userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    originDeviceId: deviceId,
    locationId: "home",
    name: "早期孤儿衣物",
    payload: { name: "早期孤儿衣物", locationId: "home" },
  };
  await db.garments.put(oldGarment);

  const hashedItemId = hashWorkspaceIdToNumber(oldGarment.id);
  assert.equal(resolveWorkspaceGarmentItemId(oldGarment), hashedItemId);
  assert.equal(resolveWorkspaceGarmentItemId({ ...oldGarment, payload: { legacyItemId: 42 } }), 42);
  assert.equal(resolveWorkspaceGarmentItemId({ ...oldGarment, legacyItemId: 41, payload: { legacyItemId: 42 } }), 41);

  const concurrent = await Promise.all([
    initializeDefaultWorkspaceLocation(workspace, deviceId),
    initializeDefaultWorkspaceLocation(workspace, deviceId),
    initializeDefaultWorkspaceLocation(workspace, deviceId),
  ]);
  assert.equal(concurrent.every((result) => result.bridged), true);
  const defaultLocations = await db.locations.filter((location) => !location.deletedAt).toArray();
  assert.equal(defaultLocations.length, 1, "空 workspace 应只创建一个真实默认衣橱");
  assert.equal((defaultLocations[0].payload as Record<string, unknown>).dexieId, "home");
  assert.equal((defaultLocations[0].payload as Record<string, unknown>).name, "默认衣橱");
  assert.equal((defaultLocations[0].payload as Record<string, unknown>).note, "默认衣橱");
  const pulledHome = buildEntityRecord({
    cursor: "cursor-home-1",
    entityType: "closetLocation",
    entityId: defaultLocations[0].id,
    operation: "update",
    revision: 2,
    payload: { dexieId: "home", name: "默认衣橱", note: "默认衣橱", sortOrder: 0 },
    createdAt: now,
  }, workspace);
  assert.equal((pulledHome.payload as Record<string, unknown>).dexieId, "home", "pull 变更必须保留 payload 容器");
  assert.equal((pulledHome as WorkspaceLocationRecord).name, "默认衣橱", "pull 变更仍需填充索引字段");
  assert.deepEqual(await bridgeLocationDelete("home"), { bridged: false, reason: "default_location_protected" });
  const firstOutboxCount = await db.syncOutbox.count();
  assert.equal((await initializeDefaultWorkspaceLocation(workspace, deviceId)).bridged, true);
  assert.equal(await db.locations.filter((location) => !location.deletedAt).count(), 1, "默认衣橱初始化必须幂等");
  assert.equal(await db.syncOutbox.count(), firstOutboxCount, "幂等调用不得重复创建同步任务");

  const duplicateId = createWorkspaceUuidV7(new Date("2026-06-28T11:00:00.000Z"));
  const duplicateGarmentId = createWorkspaceUuidV7(new Date("2026-06-28T11:01:00.000Z"));
  await db.locations.put({
    id: duplicateId, userId, revision: 0, createdAt: now, updatedAt: now, originDeviceId: deviceId,
    name: "默认衣橱", note: "默认衣橱", sortOrder: 1,
    payload: { dexieId: "home", name: "默认衣橱", note: "默认衣橱", sortOrder: 1 },
  });
  await db.garments.put({
    id: duplicateGarmentId, userId, revision: 1, createdAt: now, updatedAt: now, originDeviceId: deviceId,
    locationId: duplicateId, name: "重复衣橱下衣物", payload: { name: "重复衣橱下衣物", locationId: duplicateId },
  });
  assert.equal((await normalizeDefaultWorkspaceLocation(workspace, deviceId)).bridged, true);
  const activeHomes = (await db.locations.toArray()).filter((record) => !record.deletedAt && (record.payload as Record<string, unknown>)?.dexieId === "home");
  assert.equal(activeHomes.length, 1, "重复 home 语义记录必须归一为一条");
  assert.equal(typeof (await db.locations.get(duplicateId))?.deletedAt, "string", "重复 home 记录必须写墓碑");
  assert.equal((await db.garments.get(duplicateGarmentId))?.locationId, "home", "重复衣橱下衣物必须迁移到 home");
  assert.equal((await db.syncOutbox.toArray()).some((entry) => entry.entityId === duplicateId && entry.operation === "delete"), true);
  await db.garments.delete(duplicateGarmentId);

  const snapshot = await readWorkspaceUiSnapshot(db);
  assert.equal(snapshot.locations[0]?.id, "home", "workspace 衣橱应映射回衣物使用的 dexieId");
  assert.equal(snapshot.items[0]?.locationId, "home");
  assert.equal(snapshot.items[0]?.id, hashedItemId);

  assert.equal(await deleteWorkspaceGarmentByItemId(db, workspace, deviceId, hashedItemId), true);
  assert.equal(typeof (await db.garments.get(oldGarment.id))?.deletedAt, "string", "删除应写入本地墓碑");
  const deleteMutations = await db.syncOutbox
    .filter((entry) => entry.entityType === "garment" && entry.entityId === oldGarment.id && entry.operation === "delete")
    .toArray();
  assert.equal(deleteMutations.length, 1, "删除应生成云同步 delete outbox");
  assert.equal((await readWorkspaceUiSnapshot(db)).items.length, 0, "墓碑衣物不得继续出现在 UI 快照");

  db.close();
  await Dexie.delete(dbName);
  console.log("old garment deletion + default location sync regression: passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
