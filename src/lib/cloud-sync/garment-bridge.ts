// src/lib/cloud-sync/garment-bridge.ts
// v1.1.37 cloud 1B B5a: garment create 桥接到账号工作区 + Outbox
//
// 衣橱单品创建后 best-effort 镜像到账号工作区 + 同一事务 enqueue syncOutbox；
// 读取仍走旧 Dexie db.ts，B8 旧 Dexie 导入完成后才切换全量读写到工作区。
// B5d 补齐 update / delete；读取仍走旧 Dexie，B8 旧 Dexie 导入完成后再切主源。

"use client";

import type { WardrobeItem } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb, runWorkspaceWrite } from "@/lib/account-workspace-db";
import { imageAssetInputsForGarment, prepareEntityImageAssets, withCloudAssetRefs, type CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import { putPreparedLocalAsset } from "@/lib/cloud-sync/asset-metadata";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { schedulePendingUploads } from "@/lib/cloud-sync/asset-upload-coordinator";
import { currentWorkspaceGuard, deleteGarment, enqueueOutboxMutation, isGuardCurrent } from "@/lib/cloud-sync/sync-engine";
import type { WorkspaceGarmentRecord } from "@/lib/account-workspace-db";
import { resolveWorkspaceGarmentItemId } from "@/lib/cloud-sync/hash-workspace-id";
import type { AccountWorkspaceRecord } from "@/lib/workspace-registry";

export interface BridgeGarmentResult {
  bridged: boolean;
  reason?:
    | "sync_disabled"
    | "no_workspace"
    | "no_session"
    | "registry_mismatch"
    | "workspace_garment_not_found"
    | "write_failed";
}

export async function bridgeGarmentCreate(item: WardrobeItem): Promise<BridgeGarmentResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    const existing = await findWorkspaceGarmentByItemId(db, item.id);
    const garmentId = existing?.id ?? createWorkspaceUuidV7();
    const garmentBase = {
      id: garmentId,
      legacyItemId: typeof item.id === "number" ? item.id : undefined,
      locationId: item.locationId,
      name: item.name,
    };
    // 资产 prepare 在事务外（涉及缩略图生成等重操作）
    const assets = await prepareEntityImageAssets(db, {
      workspace: ctx.workspace,
      originDeviceId: ctx.deviceId,
      ownerEntityType: "garment",
      ownerEntityId: garmentId,
      images: imageAssetInputsForGarment(item),
    });
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    const payload = toCloudGarmentPayload(item, assets.assetRefs);
    const operation = existing ? "update" : "create";
    const baseRevision = existing?.revision ?? 0;
    const now = new Date().toISOString();

    // P1-N11: 实体 + 资产 + Outbox 在同一 Dexie 事务中落库
    await runWorkspaceWrite(db, ["garments", "assets", "syncOutbox"], async () => {
      const garmentRecord: WorkspaceGarmentRecord = {
        ...garmentBase,
        userId: ctx.workspace.userId,
        originDeviceId: ctx.deviceId,
        revision: baseRevision + 1,
        createdAt: now,
        updatedAt: now,
        payload,
      } as WorkspaceGarmentRecord;
      await db.garments.put(garmentRecord);
      await enqueueOutboxMutation(db, {
        workspace: ctx.workspace,
        entityType: "garment",
        entityId: garmentId,
        operation,
        payload: { ...payload, legacyItemId: garmentBase.legacyItemId },
        baseRevision,
      });
      for (const asset of assets.preparedAssets) {
        await putPreparedLocalAsset(db, asset);
      }
    });
    schedulePendingUploads(db);
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[garment-bridge] bridgeGarmentCreate failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export async function bridgeGarmentUpdate(item: WardrobeItem): Promise<BridgeGarmentResult> {
  if (typeof item.id !== "number") return { bridged: false, reason: "workspace_garment_not_found" };
  return bridgeGarmentCreate(item);
}

export async function bridgeGarmentDelete(legacyItemId: number): Promise<BridgeGarmentResult> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { bridged: false, reason: "no_workspace" };

  try {
    const db = getAccountWorkspaceDb(ctx.workspace);
    if (!isGuardCurrent(currentWorkspaceGuard(ctx.workspace))) return { bridged: false, reason: "no_workspace" };
    const deleted = await deleteWorkspaceGarmentByItemId(db, ctx.workspace, ctx.deviceId, legacyItemId);
    if (!deleted) return { bridged: false, reason: "workspace_garment_not_found" };
    return { bridged: true };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[garment-bridge] bridgeGarmentDelete failed:", err);
    }
    return { bridged: false, reason: "write_failed" };
  }
}

export function toCloudGarmentPayload(item: WardrobeItem, assetRefs?: CloudAssetReferenceMap): Record<string, unknown> {
  const safe = { ...item } as Record<string, unknown>;
  // 去除 base64 图片：同步 payload 只存 cloudAssetRefs 引用，图片通过 asset 机制上传
  delete safe.imageDataUrl;
  delete safe.thumbnailDataUrl;
  delete safe.sourceImageDataUrl;
  return withCloudAssetRefs(safe, assetRefs);
}

export async function findWorkspaceGarmentByItemId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyItemId: WardrobeItem["id"],
): Promise<WorkspaceGarmentRecord | undefined> {
  if (typeof legacyItemId !== "number") return undefined;
  const garments = await db.garments.toArray();
  return garments.find((garment) => resolveWorkspaceGarmentItemId(garment) === legacyItemId && !garment.deletedAt);
}

export async function deleteWorkspaceGarmentByItemId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  workspace: AccountWorkspaceRecord,
  deviceId: string,
  itemId: number,
): Promise<boolean> {
  const existing = await findWorkspaceGarmentByItemId(db, itemId);
  if (!existing) return false;
  await deleteGarment(
    db,
    {
      workspace,
      originDeviceId: deviceId,
      baseRevision: existing.revision,
      payload: {},
    },
    existing.id,
    existing.revision,
  );
  return true;
}
