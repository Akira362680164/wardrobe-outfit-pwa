// src/lib/cloud-sync/asset-upload-coordinator.ts
// v1.1.37 cloud 1C C2c: pending asset upload coordinator
//
// 扫描 workspace assets 表中 local_pending 的变体，
// 通过自有 API 上传二进制内容，服务端一次完成文件与元数据落盘。
// 纯 best-effort：不阻塞实体保存；晚到回调做三重检查。

"use client";

import type { AssetVariant } from "@wardrobe/cloud-contracts";

import type { AccountWorkspaceDatabase, WorkspaceAssetRecord, WorkspaceEntityType } from "@/lib/account-workspace-db";
import type { CloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import { loadWorkspaceRegistry } from "@/lib/workspace-registry";
import { uploadAssetContent } from "@/lib/cloud-sync/cloud-assets-api";
import { imageDataUrlToBlob } from "@/lib/cloud-sync/asset-metadata";
import type { LocalAssetPayload, LocalAssetImageMetadata } from "@/lib/cloud-sync/asset-metadata";
import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";
import { CloudSyncApiError } from "@/lib/cloud-sync/cloud-sync-api";

export interface UploadCoordinatorDeps {
  uploadContent?: typeof uploadAssetContent;
  dataUrlToBlob?: (dataUrl: string) => Promise<Blob>;
}

export interface UploadOneResult {
  assetId: string;
  variant: AssetVariant;
  status: "uploaded" | "failed";
  error?: string;
}

type LocalAssetUploadEntry = NonNullable<LocalAssetPayload["uploads"][AssetVariant]>;

export async function uploadPendingAssets(
  db: AccountWorkspaceDatabase,
  deps: UploadCoordinatorDeps = {},
): Promise<UploadOneResult[]> {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return [];

  const session = await loadAuthSessionSnapshot();
  if (!session.accessToken) return [];

  const options: CloudSyncRequestOptions = { accessToken: session.accessToken, deviceId: ctx.deviceId };
  const pending = await findPendingAssets(db);
  if (pending.length === 0) return [];

  const results: UploadOneResult[] = [];
  for (const record of pending) {
    const payload = record.payload as LocalAssetPayload | undefined;
    if (!payload?.uploads) continue;
    for (const [variantKey, upload] of Object.entries(payload.uploads)) {
      if (!upload || !upload.dataUrl || !isUploadDue(upload)) continue;
      const result = await uploadOneVariant(
        db, ctx, record, variantKey as AssetVariant,
        { ...upload, dataUrl: upload.dataUrl }, options, deps,
      );
      results.push(result);
    }
  }
  return results;
}

export function schedulePendingUploads(db: AccountWorkspaceDatabase): void {
  void uploadPendingAssets(db).catch(() => {});
}

async function uploadOneVariant(
  db: AccountWorkspaceDatabase,
  ctx: CloudBridgeContext,
  record: WorkspaceAssetRecord,
  variant: AssetVariant,
  upload: LocalAssetImageMetadata & { dataUrl: string },
  options: CloudSyncRequestOptions,
  deps: UploadCoordinatorDeps,
): Promise<UploadOneResult> {
  const uploadContent = deps.uploadContent ?? uploadAssetContent;
  const toBlob = deps.dataUrlToBlob ?? imageDataUrlToBlob;

  try {
    await updateVariantStatus(db, ctx, record, variant, "uploading");

    const blob = await toBlob(upload.dataUrl);
    await uploadContent({
      params: { assetId: record.id, variant },
      metadata: {
        "x-asset-owner-entity-type": record.ownerEntityType as Exclude<WorkspaceEntityType, "asset" | "closetLocation" | "profile">,
        "x-asset-owner-entity-id": record.ownerEntityId,
        "x-asset-sha256": upload.sha256,
        "x-asset-size-bytes": upload.sizeBytes,
        "x-asset-width": upload.width,
        "x-asset-height": upload.height,
      },
      blob,
    }, options);

    await updateVariantStatus(db, ctx, record, variant, "uploaded");
    return { assetId: record.id, variant, status: "uploaded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateVariantStatusSafe(db, ctx, record, variant, "failed", classifyUploadError(err));
    return { assetId: record.id, variant, status: "failed", error: message };
  }
}

async function updateVariantStatus(
  db: AccountWorkspaceDatabase,
  ctx: CloudBridgeContext,
  record: WorkspaceAssetRecord,
  variant: AssetVariant,
  status: "uploading" | "uploaded" | "failed",
  errorCode?: string,
): Promise<void> {
  if (!guardAllowsWrite(ctx)) return;
  const fresh = await db.assets.get(record.id);
  if (!fresh || fresh.deletedAt) return;
  const payload = (fresh.payload ?? {}) as LocalAssetPayload;
  const uploads = { ...payload.uploads };
  const entry = uploads[variant];
  if (entry) {
    const next: typeof entry = { ...entry, status };
    if (status !== "failed") {
      delete next.lastErrorCode;
      delete next.lastErrorAt;
      delete next.retryable;
      delete next.nextAttemptAt;
    }
    if (status === "failed" && errorCode != null) {
      next.attemptCount = (entry.attemptCount ?? 0) + 1;
      next.lastErrorCode = errorCode;
      next.lastErrorAt = new Date().toISOString();
      next.retryable = isAssetUploadErrorRetryable(errorCode);
      if (next.retryable) {
        const ms = computeAssetUploadBackoffMs(next.attemptCount);
        next.nextAttemptAt = new Date(Date.now() + ms).toISOString();
      }
    }
    uploads[variant] = next;
  }
  await db.assets.update(record.id, {
    payload: { ...payload, uploads },
    revision: (fresh.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  });
}

async function updateVariantStatusSafe(
  db: AccountWorkspaceDatabase,
  ctx: CloudBridgeContext,
  record: WorkspaceAssetRecord,
  variant: AssetVariant,
  status: "failed",
  errorCode?: string,
): Promise<void> {
  try {
    await updateVariantStatus(db, ctx, record, variant, status, errorCode);
  } catch {
    // best-effort: status update failure must not throw
  }
}

function guardAllowsWrite(ctx: CloudBridgeContext): boolean {
  const registry = loadWorkspaceRegistry();
  if (registry.activeUserId !== ctx.workspace.userId) return false;
  if (registry.activeDbName !== ctx.workspace.dbName) return false;
  if (registry.activeWorkspaceGeneration !== ctx.workspace.activeWorkspaceGeneration) return false;
  return true;
}

const RETRYABLE_UPLOAD_ERRORS = new Set([
  "ASSET_UPLOAD_NETWORK_ERROR",
  "ASSET_UPLOAD_TIMEOUT",
  "ASSET_UPLOAD_RATE_LIMITED",
  "ASSET_UPLOAD_SERVER_ERROR",
]);

function isAssetUploadErrorRetryable(errorCode: string): boolean {
  if (RETRYABLE_UPLOAD_ERRORS.has(errorCode)) return true;
  return RETRYABLE_UPLOAD_ERRORS.has(errorCode);
}

function computeAssetUploadBackoffMs(attemptCount: number): number {
  const steps = [30_000, 60_000, 120_000, 300_000];
  const idx = Math.min(attemptCount - 1, steps.length - 1);
  return steps[idx] ?? 300_000;
}

async function findPendingAssets(db: AccountWorkspaceDatabase): Promise<WorkspaceAssetRecord[]> {
  const all = await db.assets.filter((r) => !r.deletedAt).toArray();
  const now = new Date().toISOString();
  return all.filter((r) => {
    const payload = r.payload as LocalAssetPayload | undefined;
    if (!payload?.uploads) return false;
    return Object.values(payload.uploads).some((v) => {
      return v ? isUploadDue(v, now) : false;
    });
  });
}

function isUploadDue(upload: LocalAssetUploadEntry, now = new Date().toISOString()): boolean {
  if (upload.status === "local_pending") return true;
  return upload.status === "failed"
    && upload.retryable === true
    && (upload.nextAttemptAt ?? "") <= now;
}

function classifyUploadError(error: unknown): string {
  if (!(error instanceof CloudSyncApiError)) return "ASSET_UPLOAD_NETWORK_ERROR";
  if (error.status === 401 || error.status === 403) return "ASSET_UPLOAD_AUTH_ERROR";
  if (error.status === 408) return "ASSET_UPLOAD_TIMEOUT";
  if (error.status === 429) return "ASSET_UPLOAD_RATE_LIMITED";
  if ([500, 502, 503, 504].includes(error.status)) return "ASSET_UPLOAD_SERVER_ERROR";
  return "ASSET_UPLOAD_VALIDATION_ERROR";
}
