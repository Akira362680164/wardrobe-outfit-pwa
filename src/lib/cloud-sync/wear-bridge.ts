"use client";

import { createWorkspaceUuidV7, getAccountWorkspaceDb, type WorkspaceGarmentRecord, type WorkspaceOutfitRecord } from "@/lib/account-workspace-db";
import { getWardrobeDb } from "@/lib/db";
import { bridgeGarmentUpdate } from "@/lib/cloud-sync/garment-bridge";
import { bridgeOutfitUpsert } from "@/lib/cloud-sync/outfit-bridge";
import { bridgeOutfitPlanDelete, bridgeOutfitPlanUpsert } from "@/lib/cloud-sync/plan-bridge";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { deleteWearEvent, writeWearEvent } from "@/lib/cloud-sync/sync-engine";
import type { OutfitWearSyncResult } from "@/lib/outfit-wear-sync";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";

export interface BridgeWearResult {
  bridged: boolean;
  reason?: "no_workspace" | "write_failed";
}

export async function bridgeWearEventsForGarment(item: WardrobeItem): Promise<BridgeWearResult> {
  if (typeof item.id !== "number") return { bridged: false, reason: "write_failed" };
  const workspace = await loadWearWorkspace();
  if (!workspace) return { bridged: false, reason: "no_workspace" };
  const garment = await findWorkspaceGarmentByLegacyId(workspace.db, item.id);
  return bridgeWearEvents({
    ...workspace,
    source: "garment",
    legacyId: String(item.id),
    garmentId: garment?.id,
    dates: item.wornDates ?? [],
  });
}

export async function bridgeWearEventsForOutfit(outfit: SavedOutfit): Promise<BridgeWearResult> {
  const workspace = await loadWearWorkspace();
  if (!workspace) return { bridged: false, reason: "no_workspace" };
  const workspaceOutfit = await findWorkspaceOutfitByLegacyId(workspace.db, outfit.id);
  return bridgeWearEvents({
    ...workspace,
    source: "outfit",
    legacyId: outfit.id,
    outfitId: workspaceOutfit?.id,
    dates: outfit.wornDates ?? [],
  });
}

export async function bridgeWearSyncResult(result: OutfitWearSyncResult): Promise<void> {
  const oldDb = getWardrobeDb();
  const touchedEntryIds = Array.from(new Set([...(result.touchedEntryIds ?? []), ...result.changedEntryIds]));
  const [outfits, items, entries] = await Promise.all([
    oldDb.outfits.bulkGet(result.updatedOutfitIds),
    oldDb.items.bulkGet(result.updatedItemIds),
    touchedEntryIds.length > 0 ? oldDb.outfitPlanEntries.bulkGet(touchedEntryIds) : Promise.resolve([]),
  ]);

  for (const outfit of outfits) {
    if (!outfit) continue;
    void bridgeOutfitUpsert(outfit);
    void bridgeWearEventsForOutfit(outfit);
  }
  for (const item of items) {
    if (!item) continue;
    void bridgeGarmentUpdate(item);
    void bridgeWearEventsForGarment(item);
  }
  for (const entry of entries) {
    if (entry) void bridgeOutfitPlanUpsert(entry);
  }
  for (const id of result.deletedEntryIds ?? []) {
    void bridgeOutfitPlanDelete(id);
  }
}

async function loadWearWorkspace() {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return null;
  return { ctx, db: getAccountWorkspaceDb(ctx.workspace) };
}

async function bridgeWearEvents(input: {
  ctx: NonNullable<Awaited<ReturnType<typeof loadCloudBridgeContext>>>;
  db: ReturnType<typeof getAccountWorkspaceDb>;
  source: "garment" | "outfit";
  legacyId: string;
  garmentId?: string;
  outfitId?: string;
  dates: string[];
}): Promise<BridgeWearResult> {
  try {
    const activeDates = new Set(input.dates);
    const prefix = `${input.source}:${input.legacyId}:`;
    const existing = (await input.db.wearEvents.toArray()).filter((event) => event.legacyWearEventKey?.startsWith(prefix) && !event.deletedAt);
    const existingByKey = new Map(existing.map((event) => [event.legacyWearEventKey, event]));

    for (const date of activeDates) {
      const legacyWearEventKey = `${prefix}${date}`;
      const current = existingByKey.get(legacyWearEventKey);
      const wornAt = toWornAtIso(date);
      await writeWearEvent(
        input.db,
        {
          workspace: input.ctx.workspace,
          originDeviceId: input.ctx.deviceId,
          baseRevision: current?.revision ?? 0,
          payload: {
            garmentId: input.garmentId,
            outfitId: input.outfitId,
            wornAt,
            payload: { legacyWearEventKey, source: input.source, legacyId: input.legacyId, date },
          },
        },
        {
          id: current?.id ?? createWorkspaceUuidV7(),
          legacyWearEventKey,
          garmentId: input.garmentId,
          outfitId: input.outfitId,
          wornAt,
          payload: { legacyWearEventKey, source: input.source, legacyId: input.legacyId, date },
        },
        current ? "update" : "create",
      );
    }

    for (const event of existing) {
      const date = event.legacyWearEventKey?.slice(prefix.length);
      if (date && activeDates.has(date)) continue;
      await deleteWearEvent(
        input.db,
        {
          workspace: input.ctx.workspace,
          originDeviceId: input.ctx.deviceId,
          baseRevision: event.revision,
          payload: {},
        },
        event,
      );
    }
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") console.warn("[wear-bridge] bridgeWearEvents failed:", err);
    return { bridged: false, reason: "write_failed" };
  }
}

function toWornAtIso(dateKey: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? `${dateKey}T00:00:00.000Z` : new Date(dateKey).toISOString();
}

async function findWorkspaceGarmentByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyItemId: number,
): Promise<WorkspaceGarmentRecord | undefined> {
  const garments = await db.garments.toArray();
  return garments.find((garment) => garment.legacyItemId === legacyItemId && !garment.deletedAt);
}

async function findWorkspaceOutfitByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyOutfitId: string,
): Promise<WorkspaceOutfitRecord | undefined> {
  const outfits = await db.outfits.toArray();
  return outfits.find((outfit) => outfit.legacyOutfitId === legacyOutfitId && !outfit.deletedAt);
}
