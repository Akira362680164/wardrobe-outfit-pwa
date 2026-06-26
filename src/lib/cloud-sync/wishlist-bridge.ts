"use client";

import type { WishlistItem } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb, type WorkspaceWishlistItemRecord } from "@/lib/account-workspace-db";
import { imageAssetInputsForWishlist, prepareEntityImageAssets, putPreparedEntityImageAssets, withCloudAssetRefs, type CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { deleteWishlistItem, writeWishlistItem } from "@/lib/cloud-sync/sync-engine";

export interface BridgeWishlistResult {
  bridged: boolean;
  reason?:
    | "sync_disabled"
    | "no_workspace"
    | "workspace_wishlist_not_found"
    | "write_failed";
}

export async function bridgeWishlistUpsert(item: WishlistItem): Promise<BridgeWishlistResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceWishlistByLegacyId(db, item.id);
    const wishlistRecord = {
      id: existing?.id ?? createWorkspaceUuidV7(),
      legacyWishlistId: item.id,
      status: item.status,
    };
    const assets = await prepareEntityImageAssets(db, {
      workspace: ctx.workspace,
      originDeviceId: ctx.deviceId,
      ownerEntityType: "wishlistItem",
      ownerEntityId: wishlistRecord.id,
      images: imageAssetInputsForWishlist(item),
    });
    const payload = toCloudWishlistPayload(item, assets.assetRefs);
    await writeWishlistItem(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing?.revision ?? 0,
        payload: { payload },
      },
      {
        ...wishlistRecord,
        payload,
      },
      existing ? "update" : "create",
    );
    await putPreparedEntityImageAssets(db, assets);
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[wishlist-bridge] bridgeWishlistUpsert failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeWishlistDelete(legacyWishlistId: string): Promise<BridgeWishlistResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceWishlistByLegacyId(db, legacyWishlistId);
    if (!existing) return { bridged: false, reason: "workspace_wishlist_not_found" };
    await deleteWishlistItem(
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
      console.warn("[wishlist-bridge] bridgeWishlistDelete failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export function toCloudWishlistPayload(item: WishlistItem, assetRefs?: CloudAssetReferenceMap): Record<string, unknown> {
  const safe = { ...item } as Record<string, unknown>;
  delete safe.imageDataUrl;
  delete safe.sourceImageDataUrl;
  delete safe.thumbnailDataUrl;
  delete safe.cropBox;
  return withCloudAssetRefs({
    ...safe,
    legacyWishlistId: item.id,
  } as Record<string, unknown>, assetRefs);
}

async function findWorkspaceWishlistByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyWishlistId: string,
): Promise<WorkspaceWishlistItemRecord | undefined> {
  const items = await db.wishlistItems.toArray();
  return items.find((item) => item.legacyWishlistId === legacyWishlistId && !item.deletedAt);
}
