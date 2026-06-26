// Phase 1B B1: account workspace registry guardrails
import { strict as assert } from "node:assert";
import {
  WORKSPACE_REGISTRY_STORAGE_KEY,
  isAccountWorkspaceEnabled,
  isCloudSyncEnabled,
  isWorkspaceOfflineAuthorized,
  isWorkspaceResponseCurrent,
  loadWorkspaceRegistry,
  markWorkspaceLoggedOut,
  openWorkspaceForUser,
  stableUserIdHash,
  workspaceDbNameForUser,
} from "../src/lib/workspace-registry";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

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

console.log("\n=== Workspace Registry ===");

const storage = new MemoryStorage();
const userA = { id: "user-a-uuid", maskedPhone: "138****0001" };
const userB = { id: "user-b-uuid", maskedPhone: "139****0002" };
const hashA = stableUserIdHash(userA.id);
const dbNameA = workspaceDbNameForUser(userA.id);

check("stableUserIdHash 对同一 userId 稳定", hashA === stableUserIdHash(userA.id));
check("stableUserIdHash 对不同 userId 不同", hashA !== stableUserIdHash(userB.id));
check("dbName 使用账号稳定哈希", dbNameA === `wardrobe_account_${hashA}`);

const openedA = openWorkspaceForUser({
  user: userA,
  deviceId: "device-1",
  offlineAccessUntil: "2027-01-01T00:00:00.000Z",
  openedAt: "2026-06-26T10:00:00.000Z",
}, storage);
const reopenedA = openWorkspaceForUser({
  user: userA,
  deviceId: "device-1",
  openedAt: "2026-06-26T10:05:00.000Z",
}, storage);
const openedB = openWorkspaceForUser({
  user: userB,
  deviceId: "device-1",
  offlineAccessUntil: "2027-01-02T00:00:00.000Z",
  openedAt: "2026-06-26T10:10:00.000Z",
}, storage);
const registry = loadWorkspaceRegistry(storage);

check("同一账号 reopen 保持同一 dbName", openedA.dbName === reopenedA.dbName);
check("不同账号使用不同 dbName", openedA.dbName !== openedB.dbName);
check("registry 记录 active workspace", registry.activeUserId === userB.id && registry.activeDbName === openedB.dbName);
check("registry 持久化到固定 localStorage key", storage.getItem(WORKSPACE_REGISTRY_STORAGE_KEY) !== null);
check("reopen 只更新 lastOpenedAt", reopenedA.createdAt === openedA.createdAt && reopenedA.lastOpenedAt > openedA.lastOpenedAt);
check("离线授权有效时允许本机工作区", isWorkspaceOfflineAuthorized(openedA, new Date("2026-06-26T12:00:00.000Z")));

const loggedOut = markWorkspaceLoggedOut(userB.id, storage, "2026-06-26T10:20:00.000Z");
const loggedOutB = loggedOut.workspaces[userB.id];
check("主动退出保留工作区记录", Boolean(loggedOutB) && loggedOutB.dbName === openedB.dbName);
check("主动退出清 active workspace", loggedOut.activeUserId === undefined && loggedOut.activeDbName === undefined);
check("主动退出写标记并失效离线授权", loggedOutB.explicitlyLoggedOutAt === "2026-06-26T10:20:00.000Z" && !isWorkspaceOfflineAuthorized(loggedOutB));
check("主动退出递增 generation", loggedOutB.activeWorkspaceGeneration === openedB.activeWorkspaceGeneration + 1);

const reloggedB = openWorkspaceForUser({
  user: userB,
  deviceId: "device-1",
  offlineAccessUntil: "2027-01-03T00:00:00.000Z",
  openedAt: "2026-06-26T10:30:00.000Z",
}, storage);
check("在线重新登录清除主动退出标记", reloggedB.explicitlyLoggedOutAt === undefined && isWorkspaceOfflineAuthorized(reloggedB));

check("迟到响应三重检查通过当前 workspace", isWorkspaceResponseCurrent(reloggedB, {
  userId: userB.id,
  dbName: reloggedB.dbName,
  workspaceGeneration: reloggedB.activeWorkspaceGeneration,
}));
check("迟到响应 userId 不匹配时拒绝", !isWorkspaceResponseCurrent(reloggedB, {
  userId: userA.id,
  dbName: reloggedB.dbName,
  workspaceGeneration: reloggedB.activeWorkspaceGeneration,
}));
check("迟到响应 dbName 不匹配时拒绝", !isWorkspaceResponseCurrent(reloggedB, {
  userId: userB.id,
  dbName: openedA.dbName,
  workspaceGeneration: reloggedB.activeWorkspaceGeneration,
}));
check("迟到响应 generation 不匹配时拒绝", !isWorkspaceResponseCurrent(reloggedB, {
  userId: userB.id,
  dbName: reloggedB.dbName,
  workspaceGeneration: reloggedB.activeWorkspaceGeneration + 1,
}));

process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED = "true";
process.env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED = "false";
check("workspace 开关可独立打开", isAccountWorkspaceEnabled() && !isCloudSyncEnabled());

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
