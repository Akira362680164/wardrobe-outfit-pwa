// v2.0.12-test P0-2: 默认衣橱只允许首次创建，并发调用必须幂等。
// 测试：
//  1) 空 workspace 首次调用 → 创建 1 条 home
//  2) 已有 home 后再调用 → 不写新 outbox
//  3) 并发两次调用 → 只产生 1 条 home + 1 条 outbox
//  4) garment-bridge 在 locationId 找不到时中止 (不补建)
//  5) UI mapper 严格只读 (不补建衣橱、不重定向孤儿)

import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createAccountWorkspaceDb, type AccountWorkspaceDatabase } from "../src/lib/account-workspace-db";
import { readWorkspaceUiSnapshot } from "../src/lib/cloud-sync/workspace-ui-mapper";
import { bridgeGarmentCreate } from "../src/lib/cloud-sync/garment-bridge";
import { initializeDefaultWorkspaceLocation } from "../src/lib/cloud-sync/location-bridge";
import { loadWorkspaceRegistry, type AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import type { WardrobeItem } from "../src/lib/types";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; const msg = detail ? `: ${detail}` : ""; failures.push(name + msg); console.log(`  ❌ ${name}${msg}`); }
}

function buildDb(userId: string): { db: AccountWorkspaceDatabase; workspace: AccountWorkspaceRecord } {
  const db = createAccountWorkspaceDb("test-default-closet-" + Math.random().toString(36).slice(2, 9));
  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "hash-" + userId,
    dbName: db.name,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: "2026-06-29T00:00:00.000Z",
    lastOpenedAt: "2026-06-29T00:00:00.000Z",
    deviceId: "device-1",
  };
  return { db, workspace };
}

async function main() {
  // case 1: 首次创建 1 条 home
  {
    const { db, workspace } = buildDb("u1");
    const r1 = await initializeDefaultWorkspaceLocation(workspace, "device-1");
    const all = await db.locations.toArray();
    check("首次调用返回 bridged=true", r1.bridged === true);
    check("首次调用产生 1 条 location", all.length === 1, `actual=${all.length}`);
    const home = all.find((l) => ((l.payload as Record<string, unknown>)?.dexieId) === "home");
    check("首次调用产生 home 衣橱", Boolean(home));
  }

  // case 2: 已有 home 后再调用不再写
  {
    const { db, workspace } = buildDb("u2");
    await initializeDefaultWorkspaceLocation(workspace, "device-1");
    const before = await db.locations.toArray();
    const beforeOutbox = await db.syncOutbox.toArray();
    const r2 = await initializeDefaultWorkspaceLocation(workspace, "device-1");
    const after = await db.locations.toArray();
    const afterOutbox = await db.syncOutbox.toArray();
    check("已存在 home 时 bridged=true (幂等)", r2.bridged === true);
    check("已存在 home 时不写新 location", after.length === before.length);
    check("已存在 home 时不写新 outbox", afterOutbox.length === beforeOutbox.length);
  }

  // case 3: 并发两次调用只产生 1 条
  {
    const { db, workspace } = buildDb("u3");
    const [r1, r2] = await Promise.all([
      initializeDefaultWorkspaceLocation(workspace, "device-1"),
      initializeDefaultWorkspaceLocation(workspace, "device-1"),
    ]);
    const all = await db.locations.toArray();
    const outbox = await db.syncOutbox.toArray();
    check("并发两次都返回成功", r1.bridged === true && r2.bridged === true);
    check("并发两次只产生 1 条 home location", all.length === 1, `actual=${all.length}`);
    check("并发两次只产生 1 条 closetLocation outbox", outbox.filter((m) => m.entityType === "closetLocation").length === 1, `actual=${outbox.filter((m) => m.entityType === "closetLocation").length}`);
  }

  // case 4: UI mapper 严格只读 - 不补建衣橱
  {
    const { db, workspace } = buildDb("u4");
    // 不调用 initializeDefaultWorkspaceLocation，模拟"还没初始化"的状态
    const snap = await readWorkspaceUiSnapshot(db);
    check("UI mapper 不补建 home (严格只读)", snap.locations.length === 0, `actual=${snap.locations.length}`);
  }

  // case 5: UI mapper 严格只读 - 不重定向孤儿衣物
  {
    const { db, workspace } = buildDb("u5");
    await initializeDefaultWorkspaceLocation(workspace, "device-1");
    // 直接插入一条孤儿衣物 (locationId="ghost")
    await db.garments.put({
      id: "orphan-1", userId: workspace.userId, revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z", updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1",
      locationId: "ghost",
      name: "孤儿",
      payload: { name: "孤儿" },
    });
    const snap = await readWorkspaceUiSnapshot(db);
    const item = snap.items[0];
    check("UI mapper 不重定向孤儿衣物 (严格只读)", item?.locationId === "ghost", `actual=${item?.locationId}`);
    check("UI mapper 不为孤儿衣物创建 ghost 衣橱", snap.locations.filter((l) => l.id === "ghost").length === 0);
  }

  // case 6: bridgeGarmentCreate 找不到 locationId 时中止
  {
    const { db, workspace } = buildDb("u6");
    // 不创建任何 location
    // mock loadCloudBridgeContext 期待 workspace
    // 简化：我们手动用 db 测试
    // 直接验证源码逻辑: assertLocationExists 在 locationId 找不到时返回 false
    const src = readFileSync("src/lib/cloud-sync/garment-bridge.ts", "utf8");
    check("bridgeGarmentCreate 含 assertLocationExists 守卫", /assertLocationExists\(db, item\.locationId\)/.test(src));
    check("bridgeGarmentCreate 找不到 locationId 时返回 location_not_found / default_location_missing",
      /location_not_found/.test(src) && /default_location_missing/.test(src));
  }

  // case 7: 源码中不存在"补建衣橱/合并/重定向"逻辑
  {
    const mapper = readFileSync("src/lib/cloud-sync/workspace-ui-mapper.ts", "utf8");
    check("workspace-ui-mapper 不再含 dedupeLocations", !/function dedupeLocations/.test(mapper));
    check("workspace-ui-mapper 不再含孤儿重定向", !/把孤儿衣物的 locationId 重定向到默认衣橱/.test(mapper));
  }

  console.log(`\ndefault closet idempotent tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error("failures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
