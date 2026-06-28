import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";

// v2.0.7 regression: bridgeWishlistDelete 在工作区种草记录
// (WorkspaceWishlistItemRecord.legacyWishlistId 为空) 找不到匹配项时, 必须回退到按 w.id 软删。
//
// 直接测 fallback 路径所需的两个核心函数: findWorkspaceWishlistById 和 softDeleteWorkspaceWishlist。
// 这两个函数正是 bridgeWishlistDelete 在 fallback 分支里调用的实现。

import { createAccountWorkspaceDb } from "../src/lib/account-workspace-db";
import { findWorkspaceWishlistById, softDeleteWorkspaceWishlist } from "../src/lib/cloud-sync/wishlist-bridge";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";

interface WishlistRec {
  id: string;
  userId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  originDeviceId: string;
  legacyWishlistId?: string;
  status?: string;
  payload: unknown;
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

async function main() {
  const now = "2026-06-29T02:00:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000099";
  const dbName = `wardrobe_account_fallback_${Date.now()}`;
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  // 写一个完全匹配的 registry 让 isGuardCurrent 通过
  // 1) globalThis.localStorage + globalThis.window.localStorage (workspace-registry.getWorkspaceStorage 用 window.localStorage)
  if (typeof globalThis.localStorage === "undefined") {
    const store: Record<string, string> = {};
    const fakeStorage: Storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    } as Storage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = fakeStorage;
    (globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: fakeStorage };
  } else if (typeof (globalThis as { window?: unknown }).window === "undefined") {
    (globalThis as unknown as { window: { localStorage: Storage } }).window = {
      localStorage: (globalThis as unknown as { localStorage: Storage }).localStorage,
    };
  }
  // 2) registry
  const { saveWorkspaceRegistry, stableUserIdHash } = await import("../src/lib/workspace-registry");
  saveWorkspaceRegistry({
    version: 1,
    activeUserId: userId,
    activeDbName: dbName,
    activeWorkspaceGeneration: 1,
    updatedAt: now,
    workspaces: {
      [userId]: {
        userId,
        userIdHash: stableUserIdHash(userId),
        dbName,
        schemaVersion: 1,
        activeWorkspaceGeneration: 1,
        createdAt: now,
        lastOpenedAt: now,
        deviceId: "device-fallback",
      },
    },
  });

  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: stableUserIdHash(userId),
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now,
    lastOpenedAt: now,
    deviceId: "device-fallback",
  };
  const ctx = { workspace, deviceId: workspace.deviceId };

  // 1) 写入一条 v1.x 老数据：legacyWishlistId 为空, w.id = "workspace-uuid-orphan-1"
  const orphan: WishlistRec = {
    id: "workspace-uuid-orphan-1",
    userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    originDeviceId: "device-v1",
    status: "interested",
    payload: {
      id: "wishlist-old-1",
      name: "待确认种草单品",
      imageDataUrl: "",
      category: "tops",
      status: "interested",
    },
  };
  await db.wishlistItems.put(orphan as never);

  // 2) 主路径查找 (按 legacyWishlistId) 应该找不到
  const items = await db.wishlistItems.toArray();
  const byLegacy = items.find((it: { legacyWishlistId?: string; deletedAt?: string }) =>
    it.legacyWishlistId === "wishlist-old-1" && !it.deletedAt,
  );
  check("主路径按 legacyWishlistId 找不到 (模拟 v1.x 老数据)", byLegacy == null);

  // 3) 兜底查找 (按 w.id) 应该找到
  // UI 上 item.id = w.legacyWishlistId ?? w.id = (空) ?? "workspace-uuid-orphan-1" = "workspace-uuid-orphan-1"
  const fallback = await findWorkspaceWishlistById(db, "workspace-uuid-orphan-1");
  check("兜底按 w.id 找到孤儿记录", fallback != null && fallback.id === "workspace-uuid-orphan-1");
  check("兜底记录未软删", fallback != null && fallback.deletedAt == null);

  // 4) 不存在的 id 兜底也找不到
  const missing = await findWorkspaceWishlistById(db, "does-not-exist");
  check("完全不存在的 id 兜底查找仍返回 undefined", missing == null);

  // 5) 软删孤儿记录
  if (!fallback) throw new Error("fallback not found");
  const softResult = await softDeleteWorkspaceWishlist(db, ctx, fallback);
  check("softDeleteWorkspaceWishlist 返回 bridged=true", softResult.bridged === true, JSON.stringify(softResult));

  // 6) 软删后, 记录存在但 deletedAt 已设
  const after = await db.wishlistItems.get("workspace-uuid-orphan-1");
  check("软删后, 记录仍存在 (软删除)", after != null);
  check("软删后, deletedAt 已设置", typeof after?.deletedAt === "string");
  check("软删后, revision 自增", after?.revision === 2);

  // 7) 软删入队 outbox
  const outbox = await db.syncOutbox.toArray();
  const lastOutbox = outbox[outbox.length - 1];
  check("软删后, syncOutbox 入队 delete 操作",
    lastOutbox?.operation === "delete" && lastOutbox?.entityId === "workspace-uuid-orphan-1");

  // 8) 软删后再按 w.id 兜底查找, 应该返回 undefined (deletedAt 已设)
  const afterFallback = await findWorkspaceWishlistById(db, "workspace-uuid-orphan-1");
  check("软删后, 兜底查找已过滤 deletedAt", afterFallback == null);

  // 9) 主路径记录走 softDeleteWorkspaceWishlist 同样能软删
  const mainRec: WishlistRec = {
    id: "workspace-uuid-2",
    userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    originDeviceId: "device-v1",
    legacyWishlistId: "wishlist-local-2",
    status: "interested",
    payload: { id: "wishlist-local-2", name: "正常种草", imageDataUrl: "" },
  };
  await db.wishlistItems.put(mainRec as never);
  const found2 = await db.wishlistItems.get("workspace-uuid-2");
  if (!found2) throw new Error("main not found");
  const mainResult = await softDeleteWorkspaceWishlist(db, ctx, found2);
  check("主路径记录走 softDeleteWorkspaceWishlist 也 bridged=true", mainResult.bridged === true, JSON.stringify(mainResult));
  const after2 = await db.wishlistItems.get("workspace-uuid-2");
  check("主路径记录软删后 deletedAt 已设置", typeof after2?.deletedAt === "string");

  db.close();
  await Dexie.delete(dbName);

  // sanity check: bridgeWishlistDelete 仍然可调用
  const { bridgeWishlistDelete } = await import("../src/lib/cloud-sync/wishlist-bridge");
  check("bridgeWishlistDelete 仍是函数", typeof bridgeWishlistDelete === "function");

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
