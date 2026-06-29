"use client";

import type { SavedOutfit } from "@/lib/types";
import { getAccountWorkspaceDb, createWorkspaceUuidV7, type WorkspaceGarmentRecord, type WorkspaceOutfitRecord } from "@/lib/account-workspace-db";
import { imageAssetInputsForOutfit, prepareEntityImageAssets, putPreparedEntityImageAssets, withCloudAssetRefs, type CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { schedulePendingUploads } from "@/lib/cloud-sync/asset-upload-coordinator";
import { currentWorkspaceGuard, deleteOutfitBundle, isGuardCurrent, writeOutfitBundle } from "@/lib/cloud-sync/sync-engine";
import { resolveWorkspaceGarmentItemId } from "@/lib/cloud-sync/hash-workspace-id";

export interface BridgeOutfitResult {
  bridged: boolean;
  reason?:
    | "sync_disabled"
    | "no_workspace"
    | "workspace_outfit_not_found"
    | "write_failed";
}

export async function bridgeOutfitUpsert(outfit: SavedOutfit): Promise<BridgeOutfitResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existingOutfit = await findWorkspaceOutfitByLegacyId(db, outfit.id);
    const workspaceOutfitId = existingOutfit?.id ?? createWorkspaceUuidV7();
    const workspaceGarments = await db.garments.toArray();
    const garmentByLegacyId = buildLegacyGarmentMap(workspaceGarments);
    const activeExistingItems = (await db.outfitItems.where("outfitId").equals(workspaceOutfitId).toArray())
      .filter((item) => !item.deletedAt);
    const existingItemByGarmentId = new Map(activeExistingItems.map((item) => [item.garmentId, item]));
    const nextGarmentIds = new Set<string>();
    const outfitItems = outfit.itemIds.flatMap((legacyItemId, index) => {
      const garment = garmentByLegacyId.get(legacyItemId);
      if (!garment) return [];
      nextGarmentIds.add(garment.id);
      const existing = existingItemByGarmentId.get(garment.id);
      return [{
        id: existing?.id,
        outfitId: workspaceOutfitId,
        garmentId: garment.id,
        sortOrder: index,
        baseRevision: existing?.revision,
      }];
    });
    const removedOutfitItems = activeExistingItems.filter((item) => !nextGarmentIds.has(item.garmentId));
    const assets = await prepareEntityImageAssets(db, {
      workspace: ctx.workspace,
      originDeviceId: ctx.deviceId,
      ownerEntityType: "outfit",
      ownerEntityId: workspaceOutfitId,
      images: imageAssetInputsForOutfit(outfit),
    });
    const payload = toCloudOutfitPayload(outfit, assets.assetRefs);
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };

    await writeOutfitBundle(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existingOutfit?.revision ?? 0,
        payload: payload,
      },
      {
        operation: existingOutfit ? "update" : "create",
        outfit: {
          id: workspaceOutfitId,
          legacyOutfitId: outfit.id,
          name: outfit.name,
          payload,
        },
        outfitItems,
        removedOutfitItems,
      },
    );
    await putPreparedEntityImageAssets(db, ctx.workspace, assets);
    schedulePendingUploads(db);
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[outfit-bridge] bridgeOutfitUpsert failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeOutfitDelete(legacyOutfitId: string): Promise<BridgeOutfitResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existingOutfit = await findWorkspaceOutfitByLegacyId(db, legacyOutfitId);
    if (!existingOutfit) return { bridged: false, reason: "workspace_outfit_not_found" };
    const activeItems = (await db.outfitItems.where("outfitId").equals(existingOutfit.id).toArray())
      .filter((item) => !item.deletedAt);
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await deleteOutfitBundle(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existingOutfit.revision,
        payload: {},
      },
      existingOutfit,
      activeItems,
    );
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[outfit-bridge] bridgeOutfitDelete failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export function toCloudOutfitPayload(outfit: SavedOutfit, assetRefs?: CloudAssetReferenceMap): Record<string, unknown> {
  const { itemIds, ...safe } = outfit as SavedOutfit & Record<string, unknown>;
  delete safe.coverImageDataUrl;
  delete safe.previewImageDataUrl;
  delete safe.sourceImageDataUrl;
  delete safe.thumbnailDataUrl;
  delete safe.autoCoverImageDataUrl;
  (safe as Record<string, unknown>).outfitRealImages = outfit.outfitRealImages?.map(({ imageDataUrl: _image, thumbnailDataUrl: _thumbnail, ...metadata }) => metadata);
  return withCloudAssetRefs({
    ...safe,
    legacyOutfitId: outfit.id,
    legacyItemIds: itemIds,
  } as Record<string, unknown>, assetRefs);
}

async function findWorkspaceOutfitByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyOutfitId: string,
): Promise<WorkspaceOutfitRecord | undefined> {
  const outfits = await db.outfits.toArray();
  return outfits.find((outfit) => outfit.legacyOutfitId === legacyOutfitId && !outfit.deletedAt);
}

function buildLegacyGarmentMap(garments: WorkspaceGarmentRecord[]): Map<number, WorkspaceGarmentRecord> {
  const map = new Map<number, WorkspaceGarmentRecord>();
  for (const garment of garments) {
    if (!garment.deletedAt) {
      map.set(resolveWorkspaceGarmentItemId(garment), garment);
    }
  }
  return map;
}
