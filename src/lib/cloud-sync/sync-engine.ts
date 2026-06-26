// src/lib/cloud-sync/sync-engine.ts
// v1.1.37 cloud 1B B4: 客户端同步引擎（Outbox + push/pull/apply/三检查/退避）
// B4 把客户端同步核心压到一个文件：
//   1. workspace-guard   三重检查（userId / dbName / activeWorkspaceGeneration）
//   2. outbox            本地写入自动 enqueue，pending/pushing/applied/conflict/failed
//   3. workspace-writes  写本地 + outbox 同一事务
//   4. apply-remote      写远端 changes 到本地（带三重检查）
//   5. backoff           15/30/60/120/300s 重试
//   6. sync-engine       顶层：bootstrap / syncOnce(push+pull) / 触发器
// B4 不切换业务页面（wardrobe-app.tsx 不动），仅暴露 syncOnce() 供 B5/B6 调用。

"use client";

import { isAccountWorkspaceEnabled, isCloudSyncEnabled, isWorkspaceResponseCurrent, type AccountWorkspaceRecord } from "@/lib/workspace-registry";
import {
  type AccountWorkspaceDatabase,
  type WorkspaceEntityType,
  type WorkspaceGarmentRecord,
  type WorkspaceOutfitRecord,
  type WorkspaceOutfitItemRecord,
  type WorkspaceWishlistItemRecord,
  type WorkspaceWearEventRecord,
  type WorkspaceTripPlanRecord,
  type WorkspaceOutfitPlanRecord,
  type WorkspaceAssetRecord,
  type WorkspaceSyncOutboxRecord,
  type WorkspaceSyncStateRecord,
  type WorkspaceSyncConflictRecord,
  type WorkspaceSyncEntity,
  runWorkspaceWrite,
  createWorkspaceUuidV7,
  ACCOUNT_WORKSPACE_TABLE_NAMES,
} from "@/lib/account-workspace-db";
import { getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import {
  CloudSyncApiError,
  requestBootstrap,
  requestPull,
  requestPush,
  requestResolveConflict,
} from "@/lib/cloud-sync/cloud-sync-api";
import { isNetworkOnline } from "@/lib/cloud-sync/connectivity";
import type {
  BootstrapResponse,
  PullResponse,
  PushMutation,
  PushResponse,
  SyncChange,
  SyncEntity,
  SyncEntityType as SyncEntityTypeContract,
} from "@wardrobe/cloud-contracts";

// ============================================================
// workspace-guard: 三重检查（userId / dbName / activeWorkspaceGeneration）
// ============================================================

export interface WorkspaceGuardSnapshot {
  userId: string;
  dbName: string;
  workspaceGeneration: number;
}

export function currentWorkspaceGuard(workspace: AccountWorkspaceRecord): WorkspaceGuardSnapshot {
  return {
    userId: workspace.userId,
    dbName: workspace.dbName,
    workspaceGeneration: workspace.activeWorkspaceGeneration,
  };
}

export function isGuardCurrent(
  workspace: AccountWorkspaceRecord,
  response: WorkspaceGuardSnapshot,
): boolean {
  return isWorkspaceResponseCurrent(workspace, response);
}

// ============================================================
// outbox: 本地写入的"待推送"队列
// ============================================================

export interface EnqueueOutboxInput {
  workspace: AccountWorkspaceRecord;
  entityType: WorkspaceEntityType;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  baseRevision?: number;
}

export async function enqueueOutboxMutation(
  db: AccountWorkspaceDatabase,
  input: EnqueueOutboxInput,
): Promise<WorkspaceSyncOutboxRecord> {
  const now = new Date().toISOString();
  const record: WorkspaceSyncOutboxRecord = {
    mutationId: createWorkspaceUuidV7(),
    userId: input.workspace.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    baseRevision: input.baseRevision,
    status: "pending",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.syncOutbox.add(record);
  return record;
}

export async function listPendingOutbox(
  db: AccountWorkspaceDatabase,
  userId: string,
  limit = 100,
): Promise<WorkspaceSyncOutboxRecord[]> {
  return db.syncOutbox
    .where("[userId+status]")
    .equals([userId, "pending"] as unknown as [string, string])
    .limit(limit)
    .toArray();
}

export async function markOutboxApplied(
  db: AccountWorkspaceDatabase,
  mutationId: string,
): Promise<void> {
  await db.syncOutbox.update(mutationId, { status: "applied", updatedAt: new Date().toISOString() });
}

export async function markOutboxConflict(
  db: AccountWorkspaceDatabase,
  mutationId: string,
  errorCode: string,
  payload: unknown,
): Promise<void> {
  await db.syncOutbox.update(mutationId, {
    status: "conflict",
    attemptCount: (await db.syncOutbox.get(mutationId))?.attemptCount ?? 0,
    lastErrorCode: errorCode,
    payload,
    updatedAt: new Date().toISOString(),
  } as Partial<WorkspaceSyncOutboxRecord>);
}

export async function markOutboxFailed(
  db: AccountWorkspaceDatabase,
  mutationId: string,
  errorCode: string,
): Promise<void> {
  const existing = await db.syncOutbox.get(mutationId);
  if (!existing) return;
  await db.syncOutbox.update(mutationId, {
    status: "failed",
    attemptCount: existing.attemptCount + 1,
    lastErrorCode: errorCode,
    updatedAt: new Date().toISOString(),
  });
}

export async function recordConflict(
  db: AccountWorkspaceDatabase,
  input: {
    entityType: WorkspaceEntityType;
    entityId: string;
    localMutationId: string;
    serverRevision?: number;
    payload: unknown;
    userId: string;
  },
): Promise<WorkspaceSyncConflictRecord> {
  const now = new Date().toISOString();
  const record: WorkspaceSyncConflictRecord = {
    id: createWorkspaceUuidV7(),
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    localMutationId: input.localMutationId,
    serverRevision: input.serverRevision,
    payload: input.payload,
    createdAt: now,
  };
  await db.syncConflicts.add(record);
  return record;
}

// ============================================================
// sync-state: pull cursor 持久化
// ============================================================

export async function getSyncState(
  db: AccountWorkspaceDatabase,
  userId: string,
): Promise<WorkspaceSyncStateRecord | null> {
  const rows = await db.syncState.where("[userId+id]").equals([userId, "default"] as unknown as [string, string]).toArray();
  return rows[0] ?? null;
}

export async function setPullCursor(
  db: AccountWorkspaceDatabase,
  userId: string,
  pullCursor: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getSyncState(db, userId);
  if (existing) {
    await db.syncState.update("default", { pullCursor: pullCursor ?? undefined, updatedAt: now } as Partial<WorkspaceSyncStateRecord>);
    return;
  }
  await db.syncState.add({
    id: "default",
    userId,
    pullCursor: pullCursor ?? undefined,
    updatedAt: now,
  });
}

export async function setLastPullAt(
  db: AccountWorkspaceDatabase,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getSyncState(db, userId);
  if (existing) {
    await db.syncState.update("default", { lastPullAt: now, updatedAt: now } as Partial<WorkspaceSyncStateRecord>);
    return;
  }
  await db.syncState.add({ id: "default", userId, lastPullAt: now, updatedAt: now });
}

export async function setLastPushAt(
  db: AccountWorkspaceDatabase,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getSyncState(db, userId);
  if (existing) {
    await db.syncState.update("default", { lastPushAt: now, updatedAt: now } as Partial<WorkspaceSyncStateRecord>);
    return;
  }
  await db.syncState.add({ id: "default", userId, lastPushAt: now, updatedAt: now });
}

// ============================================================
// workspace-writes: 写本地工作区 + 自动 enqueue outbox
// 供 B5 业务页面迁移时使用；B4 仅暴露，B5 接入。
// ============================================================

export interface WriteContext {
  workspace: AccountWorkspaceRecord;
  originDeviceId: string;
  baseRevision: number;
  payload: Record<string, unknown>;
}

export async function writeGarment(
  db: AccountWorkspaceDatabase,
  ctx: WriteContext,
  garment: Omit<WorkspaceGarmentRecord, "userId" | "originDeviceId" | "revision" | "createdAt" | "updatedAt">,
): Promise<WorkspaceGarmentRecord> {
  const now = new Date().toISOString();
  const record: WorkspaceGarmentRecord = {
    ...garment,
    id: garment.id ?? createWorkspaceUuidV7(),
    userId: ctx.workspace.userId,
    originDeviceId: ctx.originDeviceId,
    revision: ctx.baseRevision + 1,
    createdAt: now,
    updatedAt: now,
    ...ctx.payload,
  } as WorkspaceGarmentRecord;

  await runWorkspaceWrite(
    db,
    ["garments", "syncOutbox"],
    async () => {
      await db.garments.put(record);
      await enqueueOutboxMutation(db, {
        workspace: ctx.workspace,
        entityType: "garment",
        entityId: record.id,
        operation: "create",
        payload: ctx.payload,
        baseRevision: ctx.baseRevision,
      });
    },
  );
  return record;
}

export async function deleteGarment(
  db: AccountWorkspaceDatabase,
  ctx: WriteContext,
  garmentId: string,
  currentRevision: number,
): Promise<void> {
  await runWorkspaceWrite(
    db,
    ["garments", "syncOutbox"],
    async () => {
      await db.garments.update(garmentId, { deletedAt: new Date().toISOString(), revision: currentRevision + 1 });
      await enqueueOutboxMutation(db, {
        workspace: ctx.workspace,
        entityType: "garment",
        entityId: garmentId,
        operation: "delete",
        payload: {},
        baseRevision: currentRevision,
      });
    },
  );
}

// ============================================================
// apply-remote: 把 server pull results 写入本地（带三重检查）
// ============================================================

export interface ApplyRemoteOptions {
  workspace: AccountWorkspaceRecord;
}

const ENTITY_TABLE: Record<WorkspaceEntityType, keyof AccountWorkspaceDatabase> = {
  garment: "garments",
  outfit: "outfits",
  outfitItem: "outfitItems",
  wishlistItem: "wishlistItems",
  wearEvent: "wearEvents",
  tripPlan: "tripPlans",
  outfitPlan: "outfitPlans",
  asset: "assets",
};

export async function applyRemoteChanges(
  db: AccountWorkspaceDatabase,
  options: ApplyRemoteOptions,
  changes: SyncChange[],
): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;
  for (const change of changes) {
    if (!isGuardCurrent(options.workspace, currentWorkspaceGuard(options.workspace))) {
      // workspace 已被切换：跳过
      skipped++;
      continue;
    }
    const tableName = ENTITY_TABLE[change.entityType as WorkspaceEntityType];
    if (!tableName) {
      skipped++;
      continue;
    }
    const table = db[tableName] as { put: (record: unknown) => Promise<unknown>; delete: (id: string) => Promise<unknown> };
    const record = buildEntityRecord(change, options.workspace);
    if (change.operation === "delete") {
      await table.delete(change.entityId);
    } else {
      await table.put(record);
    }
    applied++;
  }
  return { applied, skipped };
}

function buildEntityRecord(change: SyncChange, workspace: AccountWorkspaceRecord): WorkspaceSyncEntity {
  const base = (change.payload as Record<string, unknown>) ?? {};
  return {
    id: change.entityId,
    userId: workspace.userId,
    revision: change.revision,
    createdAt: change.createdAt,
    updatedAt: change.createdAt,
    deletedAt: change.payload && typeof (change.payload as Record<string, unknown>).deletedAt === "string"
      ? ((change.payload as Record<string, unknown>).deletedAt as string)
      : undefined,
    originDeviceId: typeof base.originDeviceId === "string" ? (base.originDeviceId as string) : "remote",
    ...base,
  } as WorkspaceSyncEntity;
}

export async function applyBootstrap(
  db: AccountWorkspaceDatabase,
  options: ApplyRemoteOptions,
  response: BootstrapResponse,
): Promise<{ applied: number }> {
  let applied = 0;
  const { entities } = response;
  for (const list of [
    entities.garments,
    entities.outfits,
    entities.outfitItems,
    entities.wishlistItems,
    entities.wearEvents,
    entities.tripPlans,
    entities.outfitPlans,
    entities.assets,
  ]) {
    for (const e of list as SyncEntity[]) {
      if (!isGuardCurrent(options.workspace, currentWorkspaceGuard(options.workspace))) break;
      const tableName = ENTITY_TABLE[entityTypeForBundle(e, list as SyncEntity[])];
      const table = db[tableName] as { put: (record: unknown) => Promise<unknown> };
      await table.put({ ...e, userId: options.workspace.userId });
      applied++;
    }
  }
  return { applied };
}

function entityTypeForBundle(entity: SyncEntity, siblingList: SyncEntity[]): WorkspaceEntityType {
  // ponytail: small heuristic — we know list identity by object reference; default to garment for unknown.
  const known: WorkspaceEntityType[] = [
    "garment",
    "outfit",
    "outfitItem",
    "wishlistItem",
    "wearEvent",
    "tripPlan",
    "outfitPlan",
    "asset",
  ];
  for (const t of known) {
    if (ENTITY_TABLE[t] && siblingList.includes(entity)) return t;
  }
  return "garment";
}

// ============================================================
// backoff: 15/30/60/120/300s 退避（递增到 5 分钟）
// ============================================================

export const SYNC_BACKOFF_STEPS_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;

export function computeBackoffMs(attemptCount: number): number {
  if (attemptCount <= 0) return 0;
  const idx = Math.min(attemptCount - 1, SYNC_BACKOFF_STEPS_MS.length - 1);
  return SYNC_BACKOFF_STEPS_MS[idx];
}

// ============================================================
// sync-engine: 顶层 bootstrap / syncOnce(push+pull) 协调
// ============================================================

export interface SyncRunInput {
  workspace: AccountWorkspaceRecord;
  accessToken: string;
  deviceId: string;
}

export interface SyncRunResult {
  bootstrapped: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  skipped: boolean;
  reason?: string;
}

export async function runSyncOnce(input: SyncRunInput): Promise<SyncRunResult> {
  if (!isAccountWorkspaceEnabled() || !isCloudSyncEnabled()) {
    return { bootstrapped: false, pushed: 0, pulled: 0, conflicts: 0, skipped: true, reason: "sync_disabled" };
  }
  if (!isNetworkOnline()) {
    return { bootstrapped: false, pushed: 0, pulled: 0, conflicts: 0, skipped: true, reason: "offline" };
  }

  const db = getAccountWorkspaceDb(input.workspace);
  const guard = currentWorkspaceGuard(input.workspace);
  const requestOptions = { accessToken: input.accessToken, deviceId: input.deviceId };

  // 1. 推本地 outbox
  const pending = await listPendingOutbox(db, input.workspace.userId, 100);
  let pushed = 0;
  let conflicts = 0;
  if (pending.length > 0) {
    const pushMutations: PushMutation[] = pending.map((m) => ({
      mutationId: m.mutationId,
      entityType: m.entityType as SyncEntityTypeContract,
      entityId: m.entityId,
      operation: m.operation,
      baseRevision: m.baseRevision,
      payload: (m.payload as Record<string, unknown>) ?? {},
      createdAt: m.createdAt,
      attemptCount: m.attemptCount,
    }));
    try {
      const pushResponse: PushResponse = await requestPush(
        { deviceId: input.deviceId, mutations: pushMutations },
        requestOptions,
      );
      // 三重检查：server response 是否还能写入当前 workspace
      if (!isGuardCurrent(input.workspace, guard)) {
        return { bootstrapped: false, pushed, pulled: 0, conflicts, skipped: true, reason: "workspace_switched" };
      }
      for (let i = 0; i < pushResponse.results.length; i++) {
        const result = pushResponse.results[i];
        const original = pending[i];
        if (result.status === "accepted") {
          await markOutboxApplied(db, original.mutationId);
          pushed++;
        } else if (result.status === "conflict") {
          await markOutboxConflict(db, original.mutationId, result.errorCode ?? "REVISION_MISMATCH", result);
          await recordConflict(db, {
            entityType: original.entityType,
            entityId: original.entityId,
            localMutationId: original.mutationId,
            serverRevision: result.serverRevision,
            payload: result,
            userId: input.workspace.userId,
          });
          conflicts++;
        } else {
          await markOutboxFailed(db, original.mutationId, result.errorCode ?? "REJECTED");
        }
      }
      await setLastPushAt(db, input.workspace.userId);
    } catch (error) {
      if (error instanceof CloudSyncApiError) {
        if (error.status === 401 || error.status === 403) {
          // 认证失败：让上游清 token + 跳到登录页
          throw error;
        }
        if (error.status === 429) {
          return { bootstrapped: false, pushed, pulled: 0, conflicts, skipped: true, reason: "rate_limited" };
        }
      }
      // 网络/5xx：标记 pending 保持，return 等待下次重试
      return { bootstrapped: false, pushed, pulled: 0, conflicts, skipped: true, reason: "push_failed" };
    }
  }

  // 2. 拉远端 changes
  const state = await getSyncState(db, input.workspace.userId);
  let pulled = 0;
  try {
    const pullResponse: PullResponse = await requestPull(
      { cursor: state?.pullCursor ?? null, limit: 200 },
      requestOptions,
    );
    if (!isGuardCurrent(input.workspace, guard)) {
      return { bootstrapped: false, pushed, pulled, conflicts, skipped: true, reason: "workspace_switched" };
    }
    const result = await applyRemoteChanges(db, { workspace: input.workspace }, pullResponse.changes);
    pulled = result.applied;
    await setPullCursor(db, input.workspace.userId, pullResponse.nextCursor);
    await setLastPullAt(db, input.workspace.userId);
  } catch (error) {
    if (error instanceof CloudSyncApiError && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    return { bootstrapped: false, pushed, pulled, conflicts, skipped: true, reason: "pull_failed" };
  }

  return { bootstrapped: false, pushed, pulled, conflicts, skipped: false };
}

export async function runBootstrap(input: SyncRunInput): Promise<SyncRunResult> {
  if (!isAccountWorkspaceEnabled() || !isCloudSyncEnabled()) {
    return { bootstrapped: false, pushed: 0, pulled: 0, conflicts: 0, skipped: true, reason: "sync_disabled" };
  }
  if (!isNetworkOnline()) {
    return { bootstrapped: false, pushed: 0, pulled: 0, conflicts: 0, skipped: true, reason: "offline" };
  }
  const db = getAccountWorkspaceDb(input.workspace);
  const guard = currentWorkspaceGuard(input.workspace);
  try {
    const response: BootstrapResponse = await requestBootstrap(
      { deviceId: input.deviceId, workspaceSchemaVersion: input.workspace.schemaVersion },
      { accessToken: input.accessToken, deviceId: input.deviceId },
    );
    if (!isGuardCurrent(input.workspace, guard)) {
      return { bootstrapped: false, pushed: 0, pulled: 0, conflicts: 0, skipped: true, reason: "workspace_switched" };
    }
    const result = await applyBootstrap(db, { workspace: input.workspace }, response);
    await setPullCursor(db, input.workspace.userId, response.serverCursor);
    return { bootstrapped: true, pushed: 0, pulled: result.applied, conflicts: 0, skipped: false };
  } catch (error) {
    if (error instanceof CloudSyncApiError && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    return { bootstrapped: false, pushed: 0, pulled: 0, conflicts: 0, skipped: true, reason: "bootstrap_failed" };
  }
}

// 暴露 AccountWorkspaceRecord 给外部 helper
export type { AccountWorkspaceRecord };

// 给 B5 业务写入门使用
export { ACCOUNT_WORKSPACE_TABLE_NAMES, getAccountWorkspaceDb, runWorkspaceWrite, createWorkspaceUuidV7 };
