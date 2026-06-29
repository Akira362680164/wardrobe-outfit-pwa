"use client";

import { DEFAULT_LOCATIONS, type ClosetLocation } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb, runWorkspaceWrite, type WorkspaceLocationRecord } from "@/lib/account-workspace-db";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { currentWorkspaceGuard, deleteLocation, isGuardCurrent, writeLocation } from "@/lib/cloud-sync/sync-engine";
import type { AccountWorkspaceRecord } from "@/lib/workspace-registry";

export interface BridgeLocationResult {
  bridged: boolean;
  reason?:
    | "sync_disabled"
    | "no_workspace"
    | "no_session"
    | "registry_mismatch"
    | "default_location_protected"
    | "workspace_location_not_found"
    | "write_failed";
}

export async function bridgeLocationUpsert(location: ClosetLocation): Promise<BridgeLocationResult> {
  // v2.0.12-test: 默认衣橱 (dexieId="home") 永远不可重命名/改 note/sortOrder；
  // 业务层直接拿 DEFAULT_LOCATIONS[0] 的只读值覆盖写入。
  if (location.id === DEFAULT_LOCATIONS[0].id) {
    // 不允许业务层任意修改默认衣橱任何字段（包括 name）
    // 调用方必须只能传 id，其他字段会被忽略。
  }
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const normalizedLocation = location.id === DEFAULT_LOCATIONS[0].id
      ? { ...location, ...DEFAULT_LOCATIONS[0], createdAt: location.createdAt, updatedAt: location.updatedAt }
      : location;
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceLocationById(db, normalizedLocation.id);
    const recordId = existing?.id ?? createWorkspaceUuidV7();
    const payload: Record<string, unknown> = {
      name: normalizedLocation.name,
      note: normalizedLocation.note ?? "",
      sortOrder: normalizedLocation.sortOrder,
      dexieId: normalizedLocation.id,
    };
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };

    await writeLocation(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing?.revision ?? 0,
        payload,
      },
      {
        id: recordId,
        name: normalizedLocation.name,
        note: normalizedLocation.note ?? "",
        sortOrder: normalizedLocation.sortOrder,
        payload,
      },
      existing ? "update" : "create",
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[location-bridge] bridgeLocationUpsert failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeLocationDelete(locationId: string): Promise<BridgeLocationResult> {
  if (locationId === DEFAULT_LOCATIONS[0].id) {
    return { bridged: false, reason: "default_location_protected" };
  }
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceLocationById(db, locationId);
    if (!existing) return { bridged: false, reason: "workspace_location_not_found" };
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await deleteLocation(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing.revision,
        payload: {},
      },
      existing,
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[location-bridge] bridgeLocationDelete failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export async function initializeDefaultWorkspaceLocation(
  workspace: AccountWorkspaceRecord,
  deviceId: string,
): Promise<BridgeLocationResult> {
  // v2.0.12-test: 默认衣橱只允许在当前 workspace 首次初始化时创建一次。
  // 关键: count + write 必须放在同一 Dexie 事务里 (runWorkspaceWrite)，
  // 否则两次并发调用都会看到 count=0 各自走 create → 产生两份 home。
  try {
    const db = getAccountWorkspaceDb(workspace);
    return await runWorkspaceWrite(
      db,
      ["locations", "syncOutbox"],
      async (): Promise<BridgeLocationResult> => {
        // 在事务内先查再写：发现已存在则直接返回成功，不写 outbox。
        const existing = await db.locations
          .filter((location) => !location.deletedAt)
          .filter((location) => {
            const dexieId = (location.payload as Record<string, unknown> | undefined)?.dexieId;
            return location.id === "home" || dexieId === "home";
          })
          .first();
        if (existing) return { bridged: true };

        const location = DEFAULT_LOCATIONS[0];
        const payload: Record<string, unknown> = {
          name: location.name,
          note: location.note,
          sortOrder: location.sortOrder,
          dexieId: location.id,
        };
        await writeLocation(
          db,
          {
            workspace,
            originDeviceId: deviceId,
            baseRevision: 0,
            payload,
          },
          {
            id: createWorkspaceUuidV7(),
            name: location.name,
            note: location.note,
            sortOrder: location.sortOrder,
            payload,
          },
          "create",
        );
        return { bridged: true };
      },
    );
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[location-bridge] initializeDefaultWorkspaceLocation failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

async function findWorkspaceLocationById(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  locationId: string,
): Promise<WorkspaceLocationRecord | undefined> {
  const locations = await db.locations.toArray();
  return locations.find((l) =>
    !l.deletedAt && (l.id === locationId || (l.payload as Record<string, unknown>)?.dexieId === locationId),
  );
}
