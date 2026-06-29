"use client";

import type { WishlistItem } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb, type WorkspaceWishlistItemRecord } from "@/lib/account-workspace-db";
import { imageAssetInputsForWishlist, prepareEntityImageAssets, putPreparedEntityImageAssets, withCloudAssetRefs, type CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import type { CloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { currentWorkspaceGuard, deleteWishlistItem, isGuardCurrent, writeWishlistItem } from "@/lib/cloud-sync/sync-engine";

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
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    await writeWishlistItem(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing?.revision ?? 0,
        payload: payload,
      },
      {
        ...wishlistRecord,
        payload,
      },
      existing ? "update" : "create",
    );
    await putPreparedEntityImageAssets(db, ctx.workspace, assets);
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
    if (!existing) {
      if (typeof console !== "undefined") {
        console.warn("[wishlist-bridge] bridgeWishlistDelete: 工作区中找不到 legacyWishlistId 匹配项, 已按 w.id 兜底查找", { legacyWishlistId });
      }
      const fallback = await findWorkspaceWishlistById(db, legacyWishlistId);
      if (!fallback) return { bridged: false, reason: "workspace_wishlist_not_found" };
      return await softDeleteWorkspaceWishlist(db, ctx, fallback);
    }
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
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

/**
 * 按 w.id 兜底查找未软删的工作区种草。
 * v2.0.6 之前的老数据同步到工作区时, WorkspaceWishlistItemRecord.legacyWishlistId 可能为空,
 * 导致按 legacyWishlistId 找记录时永远 not_found, 删除静默失败。此 fallback 用于这一种情况。
 */
export async function findWorkspaceWishlistById(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  id: string,
): Promise<WorkspaceWishlistItemRecord | undefined> {
  const items = await db.wishlistItems.toArray();
  return items.find((item) => item.id === id && !item.deletedAt);
}

/**
 * 软删工作区种草的小封装, 复用 deleteWishlistItem + 守卫检查, bridgeWishlistDelete 主路径与 fallback 路径共用。
 */
export async function softDeleteWorkspaceWishlist(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  ctx: CloudBridgeContext,
  record: WorkspaceWishlistItemRecord,
): Promise<BridgeWishlistResult> {
  if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
  await deleteWishlistItem(
    db,
    {
      workspace: ctx.workspace,
      originDeviceId: ctx.deviceId,
      baseRevision: record.revision,
      payload: {},
    },
    record,
  );
  return { bridged: true };
}
