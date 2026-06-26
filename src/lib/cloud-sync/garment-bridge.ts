// src/lib/cloud-sync/garment-bridge.ts
// v1.1.37 cloud 1B B5a: garment create 桥接到账号工作区 + Outbox
//
// 衣橱单品创建后 best-effort 镜像到账号工作区 + 同一事务 enqueue syncOutbox；
// 读取仍走旧 Dexie db.ts，B8 旧 Dexie 导入完成后才切换全量读写到工作区。
// B5d 补齐 update / delete；读取仍走旧 Dexie，B8 旧 Dexie 导入完成后再切主源。

"use client";

import type { WardrobeItem } from "@/lib/types";
import { createWorkspaceUuidV7, getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import { imageAssetInputsForGarment, prepareEntityImageAssets, putPreparedEntityImageAssets, withCloudAssetRefs, type CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { deleteGarment, writeGarment } from "@/lib/cloud-sync/sync-engine";
import type { WorkspaceGarmentRecord } from "@/lib/account-workspace-db";

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
    const existing = await findWorkspaceGarmentByLegacyId(db, item.id);
    const garmentRecord = {
      id: existing?.id ?? createWorkspaceUuidV7(),
      legacyItemId: typeof item.id === "number" ? item.id : undefined,
      locationId: item.locationId,
      name: item.name,
    } as Omit<WorkspaceGarmentRecord, "userId" | "originDeviceId" | "revision" | "createdAt" | "updatedAt">;
    const assets = await prepareEntityImageAssets(db, {
      workspace: ctx.workspace,
      originDeviceId: ctx.deviceId,
      ownerEntityType: "garment",
      ownerEntityId: garmentRecord.id,
      images: imageAssetInputsForGarment(item),
    });
    const payload = toCloudGarmentPayload(item, assets.assetRefs);
    await writeGarment(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing?.revision ?? 0,
        payload: { payload },
      },
      { ...garmentRecord, payload },
      existing ? "update" : "create",
    );
    await putPreparedEntityImageAssets(db, assets);
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
    const existing = await findWorkspaceGarmentByLegacyId(db, legacyItemId);
    if (!existing) return { bridged: false, reason: "workspace_garment_not_found" };
    await deleteGarment(
      db,
      {
        workspace: ctx.workspace,
        originDeviceId: ctx.deviceId,
        baseRevision: existing.revision,
        payload: {},
      },
      existing.id,
      existing.revision,
    );
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
  delete safe.imageDataUrl;
  delete safe.sourceImageDataUrl;
  delete safe.thumbnailDataUrl;
  delete safe.referenceOutfitImages;
  return withCloudAssetRefs(safe, assetRefs);
}

async function findWorkspaceGarmentByLegacyId(
  db: ReturnType<typeof getAccountWorkspaceDb>,
  legacyItemId: WardrobeItem["id"],
): Promise<WorkspaceGarmentRecord | undefined> {
  if (typeof legacyItemId !== "number") return undefined;
  const garments = await db.garments.toArray();
  return garments.find((garment) => garment.legacyItemId === legacyItemId && !garment.deletedAt);
}
