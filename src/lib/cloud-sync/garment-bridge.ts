// src/lib/cloud-sync/garment-bridge.ts
// v1.1.37 cloud 1B B5a: garment create 桥接到账号工作区 + Outbox
//
// 衣橱单品创建后 best-effort 镜像到账号工作区 + 同一事务 enqueue syncOutbox；
// 读取仍走旧 Dexie db.ts，B8 旧 Dexie 导入完成后才切换全量读写到工作区。
// update / delete 暂未桥接，留给 B5d 或 B6 状态机。

"use client";

import type { WardrobeItem } from "@/lib/types";
import {
  isAccountWorkspaceEnabled,
  isCloudSyncEnabled,
  loadWorkspaceRegistry,
  type AccountWorkspaceRecord,
} from "@/lib/workspace-registry";
import { getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import { writeGarment } from "@/lib/cloud-sync/sync-engine";
import type { WorkspaceGarmentRecord } from "@/lib/account-workspace-db";

export interface BridgeGarmentResult {
  bridged: boolean;
  reason?:
    | "sync_disabled"
    | "no_workspace"
    | "no_session"
    | "registry_mismatch"
    | "write_failed";
}

interface BridgeContext {
  workspace: AccountWorkspaceRecord;
  deviceId: string;
}

async function loadBridgeContext(): Promise<BridgeContext | null> {
  if (!isAccountWorkspaceEnabled() || !isCloudSyncEnabled()) return null;
  const registry = loadWorkspaceRegistry();
  const activeUserId = registry.activeUserId;
  const activeDbName = registry.activeDbName;
  const activeGen = registry.activeWorkspaceGeneration;
  if (!activeUserId || !activeDbName || activeGen == null) return null;
  const workspace = registry.workspaces[activeUserId];
  if (!workspace) return null;
  if (workspace.dbName !== activeDbName || workspace.activeWorkspaceGeneration !== activeGen) return null;
  const session = await loadAuthSessionSnapshot();
  if (!session.accessToken || !session.user) return null;
  if (session.user.id !== workspace.userId) return null;
  return { workspace, deviceId: session.deviceId };
}

export async function bridgeGarmentCreate(item: WardrobeItem): Promise<BridgeGarmentResult> {
  const ctx = await loadBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const payload = item as unknown as Record<string, unknown>;
    await writeGarment(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: 0,
        payload,
      },
      {
        legacyItemId: typeof item.id === "number" ? item.id : undefined,
        payload,
      } as Omit<WorkspaceGarmentRecord, "userId" | "originDeviceId" | "revision" | "createdAt" | "updatedAt">,
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[garment-bridge] bridgeGarmentCreate failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}