"use client";

import type { AssetVariant } from "@wardrobe/cloud-contracts";

import type { AccountWorkspaceDatabase, WorkspaceEntityType } from "@/lib/account-workspace-db";
import type { AccountWorkspaceRecord } from "@/lib/workspace-registry";
import {
  prepareLocalAsset,
  putPreparedLocalAsset,
  type AssetOwnerEntityType,
  type PreparedLocalAsset,
  type PrepareLocalAssetDependencies,
} from "@/lib/cloud-sync/asset-metadata";
import { enqueueOutboxMutation } from "@/lib/cloud-sync/sync-engine";

export interface EntityImageAssetInput {
  fieldName: string;
  dataUrl?: string;
  thumbnailDataUrl?: string;
  generateThumbnail?: boolean;
  localUri?: string;
}

export interface CloudAssetReference {
  assetId: string;
  sourceFieldName: string;
  variants: AssetVariant[];
  sha256: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export type CloudAssetReferenceMap = Record<string, CloudAssetReference>;

export interface PreparedEntityImageAssets {
  assetRefs: CloudAssetReferenceMap;
  preparedAssets: PreparedLocalAsset[];
}

export async function prepareEntityImageAssets(
  db: AccountWorkspaceDatabase,
  input: {
    workspace: Pick<AccountWorkspaceRecord, "userId">;
    originDeviceId: string;
    ownerEntityType: AssetOwnerEntityType;
    ownerEntityId: string;
    images: EntityImageAssetInput[];
    now?: Date;
  },
  deps: PrepareLocalAssetDependencies = {},
): Promise<PreparedEntityImageAssets> {
  const assetRefs: CloudAssetReferenceMap = {};
  const preparedAssets: PreparedLocalAsset[] = [];
  for (const image of input.images) {
    if (!isImageDataUrl(image.dataUrl)) continue;
    const existing = await findExistingAssetForField(db, input.workspace.userId, input.ownerEntityType, input.ownerEntityId, image.fieldName);
    const prepared = await prepareLocalAsset({
      workspace: input.workspace,
      originDeviceId: input.originDeviceId,
      ownerEntityType: input.ownerEntityType,
      ownerEntityId: input.ownerEntityId,
      sourceDataUrl: image.dataUrl,
      thumbnailDataUrl: image.thumbnailDataUrl,
      generateThumbnail: image.generateThumbnail,
      assetId: existing?.id,
      localUri: image.localUri,
      sourceFieldName: image.fieldName,
      now: input.now,
    }, deps);
    preparedAssets.push(prepared);
    assetRefs[image.fieldName] = toCloudAssetReference(image.fieldName, prepared);
  }
  return { assetRefs, preparedAssets };
}

export async function putPreparedEntityImageAssets(
  db: AccountWorkspaceDatabase,
  workspace: AccountWorkspaceRecord,
  prepared: PreparedEntityImageAssets,
): Promise<void> {
  for (const asset of prepared.preparedAssets) {
    const existing = await db.assets.get(asset.assetId);
    const isNew = !existing || existing.deletedAt;
    await putPreparedLocalAsset(db, asset);
    await enqueueOutboxMutation(db, {
      workspace,
      entityType: "asset",
      entityId: asset.assetId,
      operation: isNew ? "create" : "update",
      payload: asset.record.payload,
      baseRevision: existing?.revision ?? 0,
    });
  }
}

export function withCloudAssetRefs<T extends Record<string, unknown>>(
  payload: T,
  assetRefs: CloudAssetReferenceMap | undefined,
): T & { cloudAssetRefs?: CloudAssetReferenceMap } {
  if (!assetRefs || Object.keys(assetRefs).length === 0) return payload;
  return { ...payload, cloudAssetRefs: assetRefs };
}

export function imageAssetInputsForGarment(input: {
  imageDataUrl?: string;
  thumbnailDataUrl?: string;
}): EntityImageAssetInput[] {
  return [{ fieldName: "imageDataUrl", dataUrl: input.imageDataUrl, thumbnailDataUrl: input.thumbnailDataUrl }];
}

export function imageAssetInputsForWishlist(input: {
  imageDataUrl?: string;
  thumbnailDataUrl?: string;
}): EntityImageAssetInput[] {
  return [{ fieldName: "imageDataUrl", dataUrl: input.imageDataUrl, thumbnailDataUrl: input.thumbnailDataUrl }];
}

export function imageAssetInputsForOutfit(input: {
  coverImageDataUrl?: string;
  previewImageDataUrl?: string;
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  autoCoverImageDataUrl?: string;
  outfitRealImages?: Array<{ id: string; imageDataUrl?: string; thumbnailDataUrl?: string }>;
}): EntityImageAssetInput[] {
  const images: EntityImageAssetInput[] = [
    { fieldName: "coverImageDataUrl", dataUrl: input.coverImageDataUrl, thumbnailDataUrl: input.thumbnailDataUrl },
    { fieldName: "previewImageDataUrl", dataUrl: input.previewImageDataUrl, thumbnailDataUrl: input.thumbnailDataUrl },
    { fieldName: "sourceImageDataUrl", dataUrl: input.sourceImageDataUrl },
    { fieldName: "autoCoverImageDataUrl", dataUrl: input.autoCoverImageDataUrl, thumbnailDataUrl: input.thumbnailDataUrl },
  ];
  for (const realImage of input.outfitRealImages ?? []) {
    images.push({
      fieldName: `outfitRealImages.${realImage.id}.imageDataUrl`,
      dataUrl: realImage.imageDataUrl,
      thumbnailDataUrl: realImage.thumbnailDataUrl,
    });
  }
  return images;
}

function toCloudAssetReference(sourceFieldName: string, prepared: PreparedLocalAsset): CloudAssetReference {
  const original = prepared.uploadVariants.find((variant) => variant.variant === "original") ?? prepared.uploadVariants[0];
  return {
    assetId: prepared.assetId,
    sourceFieldName,
    variants: prepared.uploadVariants.map((variant) => variant.variant),
    sha256: original.metadata.sha256,
    mimeType: original.metadata.mimeType,
    width: original.metadata.width,
    height: original.metadata.height,
  };
}

async function findExistingAssetForField(
  db: AccountWorkspaceDatabase,
  userId: string,
  ownerEntityType: WorkspaceEntityType,
  ownerEntityId: string,
  fieldName: string,
) {
  const assets = await db.assets
    .where("ownerEntityId")
    .equals(ownerEntityId)
    .filter((asset) => asset.userId === userId && asset.ownerEntityType === ownerEntityType && sourceFieldNameOf(asset.payload) === fieldName && !asset.deletedAt)
    .toArray();
  return assets[0];
}

function sourceFieldNameOf(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const source = (payload as Record<string, unknown>).source;
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const fieldName = (source as Record<string, unknown>).fieldName;
  return typeof fieldName === "string" ? fieldName : undefined;
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(value);
}
