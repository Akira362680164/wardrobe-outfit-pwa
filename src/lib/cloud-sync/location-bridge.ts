"use client";

import { DEFAULT_LOCATIONS, type ClosetLocation } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb, runWorkspaceWrite, type WorkspaceLocationRecord } from "@/lib/account-workspace-db";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { currentWorkspaceGuard, deleteLocation, enqueueOutboxMutation, isGuardCurrent, writeLocation } from "@/lib/cloud-sync/sync-engine";
import type { AccountWorkspaceRecord } from "@/lib/workspace-registry";

const defaultLocationLocks = new Map<string, Promise<void>>();

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
  return withDefaultLocationLock(workspace.dbName, async () => normalizeDefaultWorkspaceLocation(workspace, deviceId));
}

export async function normalizeDefaultWorkspaceLocation(
  workspace: AccountWorkspaceRecord,
  deviceId: string,
): Promise<BridgeLocationResult> {
  try {
    const db = getAccountWorkspaceDb(workspace);
    const location = DEFAULT_LOCATIONS[0];
    const payload: Record<string, unknown> = {
      name: location.name,
      note: location.note,
      sortOrder: location.sortOrder,
      dexieId: location.id,
    };
    await runWorkspaceWrite(
      db,
      ["locations", "garments", "syncOutbox"],
      async () => {
        const homes = (await db.locations.toArray())
          .filter((record) => !record.deletedAt && locationDexieId(record) === "home")
          .sort((a, b) => b.revision - a.revision || b.updatedAt.localeCompare(a.updatedAt));
        const canonical = homes[0];
        const now = new Date().toISOString();

        if (!canonical) {
          const id = createWorkspaceUuidV7();
          await db.locations.put({
            id,
            userId: workspace.userId,
            originDeviceId: deviceId,
            revision: 1,
            createdAt: now,
            updatedAt: now,
            name: location.name,
            note: location.note,
            sortOrder: location.sortOrder,
            payload,
          });
          await enqueueOutboxMutation(db, { workspace, entityType: "closetLocation", entityId: id, operation: "create", payload, baseRevision: 0 });
          return;
        }

        const needsNormalization = canonical.name !== location.name
          || canonical.note !== location.note
          || canonical.sortOrder !== location.sortOrder;
        if (needsNormalization) {
          await db.locations.update(canonical.id, {
            name: location.name,
            note: location.note,
            sortOrder: location.sortOrder,
            payload,
            revision: canonical.revision + 1,
            updatedAt: now,
          });
          await enqueueOutboxMutation(db, {
            workspace,
            entityType: "closetLocation",
            entityId: canonical.id,
            operation: "update",
            payload,
            baseRevision: canonical.revision,
          });
        }

        for (const duplicate of homes.slice(1)) {
          const garments = await db.garments.filter((garment) => !garment.deletedAt && garment.locationId === duplicate.id).toArray();
          for (const garment of garments) {
            const garmentPayload = (garment.payload ?? {}) as Record<string, unknown>;
            const nextPayload = { ...garmentPayload, locationId: "home" };
            await db.garments.update(garment.id, { locationId: "home", payload: nextPayload, revision: garment.revision + 1, updatedAt: now });
            await enqueueOutboxMutation(db, {
              workspace,
              entityType: "garment",
              entityId: garment.id,
              operation: "update",
              payload: nextPayload,
              baseRevision: garment.revision,
            });
          }
          await db.locations.update(duplicate.id, { deletedAt: now, revision: duplicate.revision + 1, updatedAt: now });
          await enqueueOutboxMutation(db, {
            workspace,
            entityType: "closetLocation",
            entityId: duplicate.id,
            operation: "delete",
            payload: {},
            baseRevision: duplicate.revision,
          });
        }
      },
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[location-bridge] initializeDefaultWorkspaceLocation failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

async function withDefaultLocationLock<T>(dbName: string, task: () => Promise<T>): Promise<T> {
  const previous = defaultLocationLocks.get(dbName) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  defaultLocationLocks.set(dbName, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (defaultLocationLocks.get(dbName) === queued) defaultLocationLocks.delete(dbName);
  }
}

function locationDexieId(location: WorkspaceLocationRecord): string | undefined {
  const payload = location.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const dexieId = (payload as Record<string, unknown>).dexieId;
  return typeof dexieId === "string" ? dexieId : undefined;
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
