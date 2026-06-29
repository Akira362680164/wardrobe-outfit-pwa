import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Dexie from "dexie";
import {
  ACCOUNT_WORKSPACE_DB_STORES,
  ACCOUNT_WORKSPACE_TABLE_NAMES,
  createAccountWorkspaceDb,
  createWorkspaceUuidV7,
  getAccountWorkspaceDb,
  runWorkspaceWrite,
  type WorkspaceGarmentRecord,
  type WorkspaceSyncOutboxRecord,
} from "../src/lib/account-workspace-db";
import { getAccountWorkspaceSnapshot } from "../src/lib/account-workspace-repo";

const expectedTables = [
  "garments",
  "outfits",
  "outfitItems",
  "wishlistItems",
  "wearEvents",
  "tripPlans",
  "outfitPlans",
  "assets",
  "locations",
  "profiles",
  "syncOutbox",
  "syncState",
  "syncConflicts",
  "migrationState",
];

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
  const dbName = `wardrobe_account_b2_${Date.now()}`;
  const repoSource = readFileSync(join(__dirname, "../src/lib/account-workspace-repo.ts"), "utf8");
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  console.log("\n=== Account Workspace DB ===");
  const actualTables = db.tables.map((table) => table.name).sort();
  check("schema 包含 B2 要求的全部表", JSON.stringify(actualTables) === JSON.stringify([...expectedTables].sort()), actualTables.join(", "));
  check("store 常量和 tableNames 保持一致", JSON.stringify(ACCOUNT_WORKSPACE_TABLE_NAMES.sort()) === JSON.stringify([...expectedTables].sort()));
  check("所有业务/同步 store 都包含 userId 索引", Object.values(ACCOUNT_WORKSPACE_DB_STORES).every((schema) => schema.includes("userId")));
  check("repository 保持纯读取", !/\.put\(|\.delete\(|\.bulkPut\(|\.bulkDelete\(|\.transaction\(/.test(repoSource));

  const entityId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:00.000Z"));
  check("实体 ID 使用 UUIDv7 形态", /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entityId), entityId);

  const garment: WorkspaceGarmentRecord = {
    id: entityId,
    userId: "user-b2",
    revision: 1,
    createdAt: "2026-06-26T12:00:00.000Z",
    updatedAt: "2026-06-26T12:00:00.000Z",
    originDeviceId: "device-b2",
    name: "白衬衫",
  };
  const outbox: WorkspaceSyncOutboxRecord = {
    mutationId: createWorkspaceUuidV7(new Date("2026-06-26T12:00:01.000Z")),
    userId: garment.userId,
    entityType: "garment",
    entityId: garment.id,
    operation: "create",
    status: "pending",
    attemptCount: 0,
    createdAt: "2026-06-26T12:00:01.000Z",
    updatedAt: "2026-06-26T12:00:01.000Z",
  };

  await runWorkspaceWrite(db, ["garments", "syncOutbox"], async (tx) => {
    await tx.garments.put(garment);
    await tx.syncOutbox.put(outbox);
  });
  const snapshot = await getAccountWorkspaceSnapshot(db);
  check("repository 读取 garments", snapshot.garments.length === 1 && snapshot.garments[0].id === garment.id);
  check("repository 读取 syncOutbox", snapshot.syncOutbox.length === 1 && snapshot.syncOutbox[0].mutationId === outbox.mutationId);
  check("repository 空表返回空数组", snapshot.outfits.length === 0 && snapshot.assets.length === 0 && snapshot.migrationState.length === 0);

  const rollbackId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:02.000Z"));
  try {
    await runWorkspaceWrite(db, ["garments", "syncOutbox"], async (tx) => {
      await tx.garments.put({ ...garment, id: rollbackId, name: "应回滚" });
      throw new Error("force rollback");
    });
  } catch {
    // expected
  }
  check("事务写入失败会回滚", await db.garments.get(rollbackId) === undefined);

  const cachedA = getAccountWorkspaceDb({ dbName });
  const cachedB = getAccountWorkspaceDb({ dbName });
  check("getAccountWorkspaceDb 按 dbName 缓存", cachedA === cachedB);

  db.close();
  cachedA.close();
  await Dexie.delete(dbName);

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
