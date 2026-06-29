"use client";

import { getAccountWorkspaceDb } from "@/lib/account-workspace-db";
import type { CloudAssetReferenceMap } from "@/lib/cloud-sync/asset-bridge";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import type { LocalAssetPayload } from "@/lib/cloud-sync/asset-metadata";

export async function buildGarmentAssetDiagnosticSnapshot() {
  const ctx = await loadCloudBridgeContext();
  if (!ctx) return { available: false, reason: "WORKSPACE_UNAVAILABLE", records: [] };

  const db = getAccountWorkspaceDb(ctx.workspace);
  const [assets, garments] = await Promise.all([
    db.assets.filter((asset) => !asset.deletedAt && asset.ownerEntityType === "garment").toArray(),
    db.garments.filter((garment) => !garment.deletedAt).toArray(),
  ]);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const referenced = garments.flatMap((garment) => {
    const payload = garment.payload as Record<string, unknown> | undefined;
    const refs = payload?.cloudAssetRefs as CloudAssetReferenceMap | undefined;
    return Object.entries(refs ?? {}).map(([sourceFieldName, cloudAssetRef]) => ({
      entityId: garment.id,
      sourceFieldName,
      cloudAssetRef,
      asset: assetById.get(cloudAssetRef.assetId),
    }));
  });
  const referencedIds = new Set(referenced.map((entry) => entry.cloudAssetRef.assetId));
  const orphaned = assets.filter((asset) => !referencedIds.has(asset.id)).map((asset) => ({
    entityId: asset.ownerEntityId,
    sourceFieldName: (asset.payload as LocalAssetPayload | undefined)?.source?.fieldName,
    cloudAssetRef: undefined,
    asset,
  }));
  const records = [...referenced, ...orphaned].slice(0, 200).map(({ entityId, sourceFieldName, cloudAssetRef, asset }) => {
    const payload = asset?.payload as LocalAssetPayload | undefined;
    const summarizeVariant = (variant: "original" | "thumbnail") => {
      const upload = payload?.uploads?.[variant];
      return upload ? {
        status: upload.status,
        sha256: upload.sha256,
        sizeBytes: upload.sizeBytes,
        mimeType: upload.mimeType,
        attemptCount: upload.attemptCount ?? 0,
        lastErrorCode: upload.lastErrorCode,
        lastErrorAt: upload.lastErrorAt,
        nextAttemptAt: upload.nextAttemptAt,
      } : { status: "missing" };
    };
    return {
      entityId,
      assetId: cloudAssetRef?.assetId ?? asset?.id,
      sourceFieldName,
      cloudAssetRef: cloudAssetRef ? {
        assetId: cloudAssetRef.assetId,
        variants: cloudAssetRef.variants,
        sha256: cloudAssetRef.sha256,
        variantSha256: cloudAssetRef.variantSha256,
      } : null,
      original: summarizeVariant("original"),
      thumbnail: summarizeVariant("thumbnail"),
    };
  });

  return {
    available: true,
    workspaceUserHash: ctx.workspace.userIdHash,
    totalGarmentAssets: records.length,
    pendingUploadCount: records.reduce((count, record) => count + Number(record.original.status === "local_pending") + Number(record.thumbnail.status === "local_pending"), 0),
    failedUploadCount: records.reduce((count, record) => count + Number(record.original.status === "failed") + Number(record.thumbnail.status === "failed"), 0),
    records,
  };
}
