import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Dexie from "dexie";
import {
  closeAccountWorkspaceDb,
  createWorkspaceUuidV7,
  getAccountWorkspaceDb,
  type WorkspaceSyncConflictRecord,
  type WorkspaceSyncOutboxRecord,
} from "../src/lib/account-workspace-db";
import type { CloudSyncRequestOptions } from "../src/lib/cloud-sync/cloud-sync-api";
import {
  getSyncState,
  listOpenSyncConflicts,
  listPendingOutbox,
  resolveSyncConflict,
  setPullCursor,
} from "../src/lib/cloud-sync/sync-engine";
import {
  saveWorkspaceRegistry,
  type AccountWorkspaceRecord,
} from "../src/lib/workspace-registry";
import type {
  ResolveConflictRequest,
  ResolveConflictResponse,
} from "@wardrobe/cloud-contracts";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  },
});

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

function makeWorkspace(dbName: string): AccountWorkspaceRecord {
  return {
    userId: "018f6f02-7b7a-7a20-8d1d-000000000101",
    userIdHash: "testhash",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: "2026-06-26T12:00:00.000Z",
    lastOpenedAt: "2026-06-26T12:00:00.000Z",
    deviceId: "device-b7",
    offlineAccessUntil: "2026-07-01T00:00:00.000Z",
  };
}

function makeOutbox(workspace: AccountWorkspaceRecord, mutationId: string, entityId: string): WorkspaceSyncOutboxRecord {
  return {
    mutationId,
    userId: workspace.userId,
    entityType: "garment",
    entityId,
    operation: "update",
    payload: { name: "本机版本" },
    baseRevision: 1,
    status: "conflict",
    attemptCount: 1,
    lastErrorCode: "REVISION_MISMATCH",
    createdAt: "2026-06-26T12:01:00.000Z",
    updatedAt: "2026-06-26T12:02:00.000Z",
  };
}

function makeConflict(workspace: AccountWorkspaceRecord, outbox: WorkspaceSyncOutboxRecord, id: string): WorkspaceSyncConflictRecord {
  return {
    id,
    userId: workspace.userId,
    entityType: outbox.entityType,
    entityId: outbox.entityId,
    localMutationId: outbox.mutationId,
    serverRevision: 4,
    payload: { status: "conflict", serverRevision: 4 },
    createdAt: "2026-06-26T12:03:00.000Z",
  };
}

async function main() {
  const dbName = `wardrobe_account_b7_${Date.now()}`;
  await Dexie.delete(dbName);
  const workspace = makeWorkspace(dbName);
  saveWorkspaceRegistry({
    version: 1,
    activeUserId: workspace.userId,
    activeDbName: workspace.dbName,
    activeWorkspaceGeneration: workspace.activeWorkspaceGeneration,
    updatedAt: workspace.lastOpenedAt,
    workspaces: { [workspace.userId]: workspace },
  });

  const db = getAccountWorkspaceDb(workspace);
  await db.open();
  const entityId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:00.000Z"));
  const mutationId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:01.000Z"));
  const conflictId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:02.000Z"));
  const outbox = makeOutbox(workspace, mutationId, entityId);
  const conflict = makeConflict(workspace, outbox, conflictId);
  await db.syncOutbox.add(outbox);
  await db.syncConflicts.add(conflict);

  console.log("\n=== Cloud Sync Conflicts B7 ===");
  const engineSource = read("src/lib/cloud-sync/sync-engine.ts");
  const accountViewSource = read("src/components/auth/account-views.tsx");
  check("冲突时保留原 outbox payload", !/payload,\\n\\s*updatedAt/.test(engineSource));
  check("账号页不暴露同步冲突处理界面", !/同步冲突/.test(accountViewSource) && !/保留本机/.test(accountViewSource) && !/采用云端/.test(accountViewSource));

  const open = await listOpenSyncConflicts(workspace);
  check("列出未解决本地冲突", open.length === 1 && open[0].id === conflict.id);

  const calls: string[] = [];
  const resolveRemote = async (
    request: ResolveConflictRequest,
    _options: CloudSyncRequestOptions,
  ): Promise<ResolveConflictResponse> => {
    calls.push(`${request.conflictId}:${request.resolution}`);
    return { status: "ok" };
  };

  const keepLocal = await resolveSyncConflict({
    workspace,
    accessToken: "token",
    deviceId: workspace.deviceId,
    conflictId: conflict.id,
    resolution: "keep_local",
    resolveRemote,
  });
  const afterKeepOutbox = await db.syncOutbox.toArray();
  const afterKeepConflict = await db.syncConflicts.get(conflict.id);
  check("保留本机生成新 pending mutation", keepLocal.resolved && Boolean(keepLocal.mutationId) && afterKeepOutbox.length === 1 && afterKeepOutbox[0].mutationId === keepLocal.mutationId && afterKeepOutbox[0].status === "pending");
  check("保留本机沿用本机 payload 并改用 server revision", JSON.stringify(afterKeepOutbox[0].payload) === JSON.stringify(outbox.payload) && afterKeepOutbox[0].baseRevision === 4);
  check("保留本机标记冲突已解决", Boolean(afterKeepConflict?.resolvedAt));

  const cloudMutationId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:03.000Z"));
  const cloudConflictId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:04.000Z"));
  const cloudOutbox = makeOutbox(workspace, cloudMutationId, entityId);
  const cloudConflict = makeConflict(workspace, cloudOutbox, cloudConflictId);
  await db.syncOutbox.add(cloudOutbox);
  await db.syncConflicts.add(cloudConflict);
  const useCloud = await resolveSyncConflict({
    workspace,
    accessToken: "token",
    deviceId: workspace.deviceId,
    conflictId: cloudConflict.id,
    resolution: "use_cloud",
    resolveRemote,
  });
  const discarded = await db.syncOutbox.get(cloudMutationId);
  const afterCloudConflict = await db.syncConflicts.get(cloudConflict.id);
  check("采用云端丢弃本地冲突 mutation", useCloud.resolved && discarded === undefined);
  check("采用云端标记冲突已解决", Boolean(afterCloudConflict?.resolvedAt));
  check("两种解决动作都调用云端 resolve-conflict", calls.includes(`${mutationId}:keep_local`) && calls.includes(`${cloudMutationId}:use_cloud`));

  const pendingMutationId = createWorkspaceUuidV7(new Date("2026-06-26T12:00:05.000Z"));
  await db.syncOutbox.add({ ...makeOutbox(workspace, pendingMutationId, entityId), status: "pending", createdAt: "2026-06-26T12:05:00.000Z" });
  check("pending outbox 查询不依赖不存在的复合索引", (await listPendingOutbox(db, workspace.userId)).some((item) => item.mutationId === pendingMutationId));
  await setPullCursor(db, workspace.userId, "cursor-b7");
  check("sync state 查询不依赖不存在的复合索引", (await getSyncState(db, workspace.userId))?.pullCursor === "cursor-b7");

  closeAccountWorkspaceDb(dbName);
  await Dexie.delete(dbName);

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
