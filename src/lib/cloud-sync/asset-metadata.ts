"use client";

import type { AssetVariant } from "@wardrobe/cloud-contracts";

import {
  createWorkspaceUuidV7,
  type AccountWorkspaceDatabase,
  type WorkspaceAssetRecord,
  type WorkspaceEntityType,
} from "@/lib/account-workspace-db";
import type { AccountWorkspaceRecord } from "@/lib/workspace-registry";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";

export type AssetOwnerEntityType = Exclude<WorkspaceEntityType, "asset">;
export type LocalAssetUploadStatus = "local_pending" | "uploading" | "uploaded" | "failed";

export interface LocalAssetImageMetadata {
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface LocalAssetUploadVariant {
  variant: AssetVariant;
  dataUrl: string;
  metadata: LocalAssetImageMetadata;
}

export interface LocalAssetPayload {
  uploads: Partial<Record<AssetVariant, LocalAssetImageMetadata & {
    status: LocalAssetUploadStatus;
    dataUrl?: string;
    attemptCount?: number;
    lastErrorCode?: string;
    lastErrorAt?: string;
    retryable?: boolean;
    nextAttemptAt?: string;
  }>>;
  source?: {
    kind: "legacy_entity_image" | "local_uri";
    localUri?: string;
    fieldName?: string;
  };
  thumbnailStatus: "ready" | "failed" | "missing";
  thumbnailErrorMessage?: string;
  thumbnailErrorTag?: string;
}

export interface PreparedLocalAsset {
  assetId: string;
  record: WorkspaceAssetRecord;
  uploadVariants: LocalAssetUploadVariant[];
}

export interface PrepareLocalAssetInput {
  workspace: Pick<AccountWorkspaceRecord, "userId">;
  originDeviceId: string;
  ownerEntityType: AssetOwnerEntityType;
  ownerEntityId: string;
  sourceDataUrl: string;
  thumbnailDataUrl?: string;
  assetId?: string;
  localUri?: string;
  sourceFieldName?: string;
  now?: Date;
  generateThumbnail?: boolean;
}

export interface PrepareLocalAssetDependencies {
  createThumbnail?: (sourceDataUrl: string) => Promise<string | undefined>;
  readImageSize?: (dataUrl: string) => Promise<{ width?: number; height?: number }>;
}

export async function prepareLocalAsset(input: PrepareLocalAssetInput, deps: PrepareLocalAssetDependencies = {}): Promise<PreparedLocalAsset> {
  const assetId = input.assetId ?? createWorkspaceUuidV7(input.now);
  const now = (input.now ?? new Date()).toISOString();
  const original = await buildUploadVariant("original", input.sourceDataUrl, deps);
  const thumbnail = await resolveThumbnailVariant(input, deps);
  const uploads: LocalAssetPayload["uploads"] = {
    original: { ...original.metadata, dataUrl: original.dataUrl, status: "local_pending" },
  };
  if (thumbnail.variant) {
    uploads.thumbnail = { ...thumbnail.variant.metadata, dataUrl: thumbnail.variant.dataUrl, status: "local_pending" };
  }

  const payload: LocalAssetPayload = {
    uploads,
    thumbnailStatus: thumbnail.status,
    ...(thumbnail.errorMessage ? { thumbnailErrorMessage: thumbnail.errorMessage } : {}),
    ...(thumbnail.errorTag ? { thumbnailErrorTag: thumbnail.errorTag } : {}),
    ...(input.localUri || input.sourceFieldName
      ? {
          source: {
            kind: input.localUri ? "local_uri" : "legacy_entity_image",
            ...(input.localUri ? { localUri: input.localUri } : {}),
            ...(input.sourceFieldName ? { fieldName: input.sourceFieldName } : {}),
          },
        }
      : {}),
  };

  const uploadVariants = thumbnail.variant ? [original, thumbnail.variant] : [original];
  const record: WorkspaceAssetRecord = {
    id: assetId,
    userId: input.workspace.userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    originDeviceId: input.originDeviceId,
    ownerEntityType: input.ownerEntityType,
    ownerEntityId: input.ownerEntityId,
    localUri: input.localUri,
    sha256: original.metadata.sha256,
    mimeType: original.metadata.mimeType,
    width: original.metadata.width,
    height: original.metadata.height,
    payload,
  } as WorkspaceAssetRecord;

  return { assetId, record, uploadVariants };
}

export async function putPreparedLocalAsset(db: AccountWorkspaceDatabase, prepared: PreparedLocalAsset): Promise<void> {
  await db.assets.put(prepared.record);
}

export async function buildUploadVariant(
  variant: AssetVariant,
  dataUrl: string,
  deps: Pick<PrepareLocalAssetDependencies, "readImageSize"> = {},
): Promise<LocalAssetUploadVariant> {
  const blob = await imageDataUrlToBlob(dataUrl);
  const size = await readImageSizeSafe(dataUrl, deps.readImageSize);
  return {
    variant,
    dataUrl,
    metadata: {
      sha256: await sha256Hex(blob),
      mimeType: parseImageDataUrlMimeType(dataUrl),
      sizeBytes: blob.size,
      ...size,
    },
  };
}

export async function imageDataUrlToBlob(dataUrl: string): Promise<Blob> {
  assertImageDataUrl(dataUrl);
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("cloud-assets: dataURL 解析失败");
  return response.blob();
}

export function parseImageDataUrlMimeType(dataUrl: string): string {
  assertImageDataUrl(dataUrl);
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i.exec(dataUrl);
  if (!match?.[1]) throw new Error("cloud-assets: 无法读取图片 MIME 类型");
  return match[1].toLowerCase();
}

export async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("cloud-assets: 当前环境不支持 SHA-256");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveThumbnailVariant(
  input: PrepareLocalAssetInput,
  deps: PrepareLocalAssetDependencies,
): Promise<{ status: LocalAssetPayload["thumbnailStatus"]; variant?: LocalAssetUploadVariant; errorMessage?: string; errorTag?: string }> {
  let dataUrl = input.thumbnailDataUrl;
  let errorMessage: string | undefined;
  let errorTag: string | undefined;
  if (!dataUrl && input.generateThumbnail) {
    if (deps.createThumbnail) {
      dataUrl = await deps.createThumbnail(input.sourceDataUrl);
    } else {
      const result = await generateThumbnailSafe(input.sourceDataUrl);
      dataUrl = result.thumbnailDataUrl;
      errorMessage = result.errorMessage;
      errorTag = result.errorTag;
    }
  }
  if (!dataUrl) {
    return errorMessage ? { status: "failed", errorMessage, errorTag } : { status: "missing" };
  }
  return { status: "ready", variant: await buildUploadVariant("thumbnail", dataUrl, deps) };
}

async function readImageSizeSafe(
  dataUrl: string,
  injected?: (dataUrl: string) => Promise<{ width?: number; height?: number }>,
): Promise<{ width?: number; height?: number }> {
  if (injected) return sanitizeImageSize(await injected(dataUrl));
  if (typeof Image === "undefined") return {};
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(sanitizeImageSize({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }));
    img.onerror = () => resolve({});
    img.src = dataUrl;
  });
}

function sanitizeImageSize(size: { width?: number; height?: number }): { width?: number; height?: number } {
  const width = Number.isFinite(size.width) && size.width! > 0 ? Math.round(size.width!) : undefined;
  const height = Number.isFinite(size.height) && size.height! > 0 ? Math.round(size.height!) : undefined;
  return { ...(width ? { width } : {}), ...(height ? { height } : {}) };
}

function assertImageDataUrl(dataUrl: string): void {
  if (typeof dataUrl !== "string" || !/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(dataUrl)) {
    throw new Error("cloud-assets: 输入不是合法的图片 dataURL");
  }
}
