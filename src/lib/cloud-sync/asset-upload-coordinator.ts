// src/lib/cloud-sync/asset-upload-coordinator.ts
// v1.1.37 cloud 1C C2c: pending asset upload coordinator
//
// 扫描 workspace assets 表中 local_pending 的变体，
// 通过 COS 预签名 URL 直传，成功后通知 API complete-upload。
// 纯 best-effort：不阻塞实体保存；晚到回调做三重检查。

"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { AssetVariant } from "@wardrobe/cloud-contracts";

import type { AccountWorkspaceDatabase, WorkspaceAssetRecord, WorkspaceEntityType } from "@/lib/account-workspace-db";
import type { CloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import { loadWorkspaceRegistry } from "@/lib/workspace-registry";
import { requestAssetUploadUrl, requestAssetUploadComplete } from "@/lib/cloud-sync/cloud-assets-api";
import { imageDataUrlToBlob } from "@/lib/cloud-sync/asset-metadata";
import type { LocalAssetPayload, LocalAssetImageMetadata } from "@/lib/cloud-sync/asset-metadata";
import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";

export interface UploadCoordinatorDeps {
  authorizeUpload?: typeof requestAssetUploadUrl;
  completeUpload?: typeof requestAssetUploadComplete;
  putToUrl?: (url: string, blob: Blob, headers: Record<string, string>) => Promise<{ ok: boolean; status: number }>;
  dataUrlToBlob?: (dataUrl: string) => Promise<Blob>;
}

export interface UploadOneResult {
  assetId: string;
  variant: AssetVariant;
  status: "uploaded" | "failed";
  error?: string;
}

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
      if (!upload || upload.status !== "local_pending" || !upload.dataUrl) continue;
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
  const authorize = deps.authorizeUpload ?? requestAssetUploadUrl;
  const complete = deps.completeUpload ?? requestAssetUploadComplete;
  const putTo = deps.putToUrl ?? defaultPutToUrl;
  const toBlob = deps.dataUrlToBlob ?? imageDataUrlToBlob;

  try {
    await updateVariantStatus(db, ctx, record, variant, "uploading");

    const auth = await authorize({
      assetId: record.id,
      ownerEntityType: record.ownerEntityType as Exclude<WorkspaceEntityType, "asset">,
      ownerEntityId: record.ownerEntityId,
      variant,
      sha256: upload.sha256,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      width: upload.width,
      height: upload.height,
    }, options);

    const blob = await toBlob(upload.dataUrl);
    const putResult = await putTo(auth.uploadUrl, blob, auth.headers ?? {});
    if (!putResult.ok) {
      await updateVariantStatus(db, ctx, record, variant, "failed", `COS_PUT_${putResult.status}`);
      return { assetId: record.id, variant, status: "failed", error: `PUT ${putResult.status}` };
    }

    await complete({
      assetId: record.id,
      variant,
      objectKey: auth.objectKey,
      sha256: upload.sha256,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      width: upload.width,
      height: upload.height,
    }, options);

    await updateVariantStatus(db, ctx, record, variant, "uploaded");
    return { assetId: record.id, variant, status: "uploaded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateVariantStatusSafe(db, ctx, record, variant, "failed", "UPLOAD_NETWORK_ERROR");
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
  "UPLOAD_NETWORK_ERROR",
  "COS_PUT_500",
  "COS_PUT_502",
  "COS_PUT_503",
  "COS_PUT_504",
  "COS_PUT_408",
  "COS_PUT_429",
]);

function isAssetUploadErrorRetryable(errorCode: string): boolean {
  if (RETRYABLE_UPLOAD_ERRORS.has(errorCode)) return true;
  // 4xx COS errors (except 408/429) are non-retryable (auth, bad request)
  if (errorCode.startsWith("COS_PUT_4")) return false;
  // other errors are retryable by default (network, timeout, DNS)
  return true;
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
      if (v?.status === "local_pending") return true;
      if (v?.status === "failed" && v?.retryable === true && (v?.nextAttemptAt ?? "") <= now) return true;
      return false;
    });
  });
}

async function defaultPutToUrl(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number }> {
  if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
    const resp = await CapacitorHttp.request({
      method: "PUT",
      url,
      headers: { ...headers, "Content-Type": blob.type },
      data: blob,
    });
    return { ok: resp.status < 400, status: resp.status };
  }
  const resp = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": blob.type },
    body: blob,
  });
  return { ok: resp.ok, status: resp.status };
}
