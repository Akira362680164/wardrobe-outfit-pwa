"use client";

import { DEFAULT_LOCATIONS, type ClosetLocation } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb, type WorkspaceLocationRecord } from "@/lib/account-workspace-db";
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
    | "workspace_location_not_found"
    | "write_failed";
}

export async function bridgeLocationUpsert(location: ClosetLocation): Promise<BridgeLocationResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceLocationById(db, location.id);
    const recordId = existing?.id ?? createWorkspaceUuidV7();
    const payload: Record<string, unknown> = {
      name: location.name,
      note: location.note,
      sortOrder: location.sortOrder,
      dexieId: location.id,
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
        name: location.name,
        note: location.note,
        sortOrder: location.sortOrder,
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

export async function ensureDefaultWorkspaceLocation(
  workspace: AccountWorkspaceRecord,
  deviceId: string,
): Promise<BridgeLocationResult> {
  try {
    const db = getAccountWorkspaceDb(workspace);
    const hasActiveLocation = await db.locations.filter((location) => !location.deletedAt).count();
    if (hasActiveLocation > 0) return { bridged: true };

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
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[location-bridge] ensureDefaultWorkspaceLocation failed:", err);
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
