import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  AssetDownloadAuthorizeRequest,
  AssetDownloadAuthorizeResponse,
  AssetManifestRequest,
  AssetManifestResponse,
  AssetUploadAuthorizeRequest,
  AssetUploadAuthorizeResponse,
  AssetUploadCompleteRequest,
  AssetUploadCompleteResponse,
  AssetVariant,
} from "@wardrobe/cloud-contracts";
import {
  AssetDownloadAuthorizeResponseSchema,
  AssetManifestItemSchema,
  AssetManifestResponseSchema,
  AssetUploadAuthorizeResponseSchema,
  AssetUploadCompleteResponseSchema,
} from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import { assets } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import {
  createCosPutObjectPresignedUrl,
  createCosGetObjectPresignedUrl,
  verifyCosObject,
  createCosDeleteObjectPresignedUrl,
  loadCosConfig,
  type CosConfig,
} from "../storage/cos.js";

export class AssetApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type AssetRow = typeof assets.$inferSelect;

export class AssetService {
  constructor(
    private readonly db?: NodePgDatabase<typeof schema>,
    private readonly cosConfig: CosConfig | null = loadCosConfig(),
  ) {}

  async authorizeUpload(input: AssetUploadAuthorizeRequest & { userId: string; deviceId: string }): Promise<AssetUploadAuthorizeResponse> {
    if (!this.cosConfig) {
      throw new AssetApiError(503, "cos_not_configured", "Image upload is not configured");
    }

    const existing = await this.getAsset(input.assetId);
    await assertAssetCanBind(existing, input, verifyOwnerEntity);

    const now = new Date();
    const objectKey = buildAssetObjectKey(input.userId, input.assetId, input.variant, input.sha256, input.mimeType);
    const expiresAt = new Date(now.getTime() + this.cosConfig.expiresSeconds * 1000).toISOString();
    const uploadUrl = createCosPutObjectPresignedUrl({
      config: this.cosConfig,
      objectKey,
      now,
    });

    await this.upsertUpload(input, objectKey, now, existing);

    return AssetUploadAuthorizeResponseSchema.parse({
      assetId: input.assetId,
      variant: input.variant,
      method: "PUT",
      uploadUrl,
      objectKey,
      expiresAt,
      headers: { "Content-Type": input.mimeType },
    });
  }

  async completeUpload(input: AssetUploadCompleteRequest & { userId: string }): Promise<AssetUploadCompleteResponse> {
    const existing = await this.getAsset(input.assetId);
    if (!existing || existing.userId !== input.userId) {
      throw new AssetApiError(404, "asset_not_found", "Asset was not found");
    }

    const expected = getUploadPayload(existing.payload, input.variant);
    if (
      !expected ||
      expected.objectKey !== input.objectKey ||
      expected.sha256 !== input.sha256 ||
      expected.mimeType !== input.mimeType ||
      expected.sizeBytes !== input.sizeBytes
    ) {
      throw new AssetApiError(409, "asset_upload_mismatch", "Asset upload metadata does not match authorization");
    }

    if (this.cosConfig) {
      await verifyCosObject({
        config: this.cosConfig,
        objectKey: input.objectKey,
        expectedSizeBytes: input.sizeBytes,
        expectedMimeType: input.mimeType,
      });
    }

    const now = new Date();
    const payload = mergeUploadPayload(existing.payload, input.variant, {
      ...expected,
      width: input.width,
      height: input.height,
      completedAt: now.toISOString(),
      status: "uploaded",
    });
    const otherVariant = input.variant === "original" ? "thumbnail" : "original";
    const otherPayload = getUploadPayload(existing.payload, otherVariant);
    const globalStatus = otherPayload && otherPayload.status === "uploaded" ? "uploaded" : "uploading";
    await this.database()
      .update(assets)
      .set({
        uploadStatus: globalStatus,
        ...(input.variant === "thumbnail" ? { storageKey: input.objectKey } : {}),
        updatedAt: now,
        payload,
      })
      .where(and(eq(assets.id, input.assetId), eq(assets.userId, input.userId)));

    return AssetUploadCompleteResponseSchema.parse({
      status: "ok",
      assetId: input.assetId,
      variant: input.variant,
      uploadStatus: "uploaded",
    });
  }

  async authorizeDownload(input: AssetDownloadAuthorizeRequest & { userId: string }): Promise<AssetDownloadAuthorizeResponse> {
    if (!this.cosConfig) {
      throw new AssetApiError(503, "cos_not_configured", "Image download is not configured");
    }

    const existing = await this.getAsset(input.assetId);
    if (!existing || existing.userId !== input.userId) {
      throw new AssetApiError(404, "asset_not_found", "Asset was not found");
    }

    const variantMeta = getUploadPayload(existing.payload, input.variant);
    if (!variantMeta || variantMeta.status !== "uploaded" || !variantMeta.objectKey) {
      throw new AssetApiError(404, "asset_variant_not_uploaded", "Asset variant is not uploaded yet");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.cosConfig.expiresSeconds * 1000).toISOString();
    const downloadUrl = createCosGetObjectPresignedUrl({
      config: this.cosConfig,
      objectKey: variantMeta.objectKey as string,
      now,
    });

    return AssetDownloadAuthorizeResponseSchema.parse({
      assetId: input.assetId,
      variant: input.variant,
      method: "GET",
      downloadUrl,
      objectKey: variantMeta.objectKey,
      expiresAt,
      sha256: variantMeta.sha256,
      mimeType: variantMeta.mimeType,
      sizeBytes: variantMeta.sizeBytes,
      width: variantMeta.width,
      height: variantMeta.height,
    });
  }

  async getManifest(input: AssetManifestRequest & { userId: string }): Promise<AssetManifestResponse> {
    const db = this.database();
    const cursor = input.cursor ? parseManifestCursor(input.cursor) : null;

    const baseWhere = and(eq(assets.userId, input.userId), sql`${assets.deletedAt} IS NULL`);
    let query = db
      .select()
      .from(assets)
      .where(
        cursor
          ? and(
              baseWhere,
              sql`(${assets.updatedAt}, ${assets.id}) > (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)`,
            )
          : baseWhere,
      )
      .orderBy(sql`${assets.updatedAt} ASC, ${assets.id} ASC`)
      .limit(input.limit + 1);

    const rows = await query;

    const hasMore = rows.length > input.limit;
    const items = (hasMore ? rows.slice(0, input.limit) : rows).map((row) => {
      const originalPayload = getUploadPayload(row.payload, "original");
      const thumbnailPayload = getUploadPayload(row.payload, "thumbnail");
      const originalReady = originalPayload && originalPayload.status === "uploaded";
      const thumbnailReady = thumbnailPayload && thumbnailPayload.status === "uploaded";
      const derivedStatus: "uploading" | "uploaded" | "failed" =
        originalReady && (!thumbnailPayload || thumbnailReady) ? "uploaded"
        : !originalPayload && !thumbnailPayload ? "uploading"
        : "uploading";
      return {
        assetId: row.id,
        ownerEntityType: row.ownerEntityType,
        ownerEntityId: row.ownerEntityId,
        uploadStatus: derivedStatus,
        ...(originalReady ? {
          original: {
            sha256: originalPayload.sha256 as string,
            mimeType: originalPayload.mimeType as string,
            sizeBytes: originalPayload.sizeBytes as number,
            width: originalPayload.width as number | undefined,
            height: originalPayload.height as number | undefined,
          },
        } : {}),
        ...(thumbnailReady ? {
          thumbnail: {
            sha256: thumbnailPayload.sha256 as string,
            mimeType: thumbnailPayload.mimeType as string,
            sizeBytes: thumbnailPayload.sizeBytes as number,
            width: thumbnailPayload.width as number | undefined,
            height: thumbnailPayload.height as number | undefined,
          },
        } : {}),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    const lastItem = rows[input.limit - 1];
    return AssetManifestResponseSchema.parse({
      items,
      ...(hasMore && lastItem ? { nextCursor: formatManifestCursor(lastItem) } : {}),
    });
  }

  private async getAsset(assetId: string): Promise<AssetRow | null> {
    const [row] = await this.database().select().from(assets).where(eq(assets.id, assetId)).limit(1);
    return row ?? null;
  }

  private async upsertUpload(
    input: AssetUploadAuthorizeRequest & { userId: string; deviceId: string },
    objectKey: string,
    now: Date,
    existing: AssetRow | null,
  ): Promise<void> {
    const payload = mergeUploadPayload(existing?.payload, input.variant, {
      objectKey,
      sha256: input.sha256,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      authorizedAt: now.toISOString(),
      status: "authorized",
    });
    const keyColumn = input.variant === "original" ? "originalObjectKey" : "thumbnailObjectKey";

    if (existing) {
      await this.database()
        .update(assets)
        .set({
          ownerEntityType: input.ownerEntityType,
          ownerEntityId: input.ownerEntityId,
          mimeType: input.variant === "original" ? input.mimeType : existing.mimeType,
          sha256: input.variant === "original" ? input.sha256 : existing.sha256,
          sizeBytes: input.variant === "original" ? input.sizeBytes : existing.sizeBytes,
          width: input.variant === "original" ? input.width ?? null : existing.width,
          height: input.variant === "original" ? input.height ?? null : existing.height,
          [keyColumn]: objectKey,
          uploadStatus: "uploading",
          updatedAt: now,
          payload,
        })
        .where(and(eq(assets.id, input.assetId), eq(assets.userId, input.userId)));
      return;
    }

    await this.database().insert(assets).values({
      id: input.assetId,
      userId: input.userId,
      ownerEntityType: input.ownerEntityType,
      ownerEntityId: input.ownerEntityId,
      originDeviceId: input.deviceId,
      mimeType: input.variant === "original" ? input.mimeType : null,
      sha256: input.variant === "original" ? input.sha256 : null,
      sizeBytes: input.variant === "original" ? input.sizeBytes : null,
      width: input.variant === "original" ? input.width ?? null : null,
      height: input.variant === "original" ? input.height ?? null : null,
      originalObjectKey: input.variant === "original" ? objectKey : null,
      thumbnailObjectKey: input.variant === "thumbnail" ? objectKey : null,
      uploadStatus: "uploading",
      payload,
      createdAt: now,
      updatedAt: now,
    });
  }

  private database(): NodePgDatabase<typeof schema> {
    return this.db ?? getDb();
  }
}

export function buildAssetObjectKey(userId: string, assetId: string, variant: AssetVariant, sha256: string, mimeType: string): string {
  return `users/${userId}/assets/${assetId}/${variant}-${sha256.slice(0, 16)}.${extensionForMimeType(mimeType)}`;
}

async function assertAssetCanBind(
  existing: AssetRow | null,
  input: AssetUploadAuthorizeRequest & { userId: string },
  verifyOwner: (ownerEntityType: string, ownerEntityId: string, userId: string) => Promise<void>,
): Promise<void> {
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new AssetApiError(404, "asset_not_found", "Asset was not found");
    }
    if (existing.ownerEntityType !== input.ownerEntityType || existing.ownerEntityId !== input.ownerEntityId) {
      throw new AssetApiError(409, "asset_owner_mismatch", "Asset already belongs to a different entity");
    }
    return;
  }
  await verifyOwner(input.ownerEntityType, input.ownerEntityId, input.userId);
}

async function verifyOwnerEntity(
  ownerEntityType: string,
  ownerEntityId: string,
  userId: string,
): Promise<void> {
  const { getTableForEntityType } = await import("../sync/entity-tables.js");
  const table = getTableForEntityType(ownerEntityType as Parameters<typeof getTableForEntityType>[0]);
  const rows = await getDb()
    .select({ id: (table as any).id, userId: (table as any).userId, deletedAt: (table as any).deletedAt })
    .from(table as any)
    .where(and(eq((table as any).id, ownerEntityId), eq((table as any).userId, userId)))
    .limit(1);
  if (!rows[0]) {
    throw new AssetApiError(404, "owner_entity_not_found", "Owner entity does not exist or does not belong to this account");
  }
  if (rows[0].deletedAt) {
    throw new AssetApiError(409, "owner_entity_deleted", "Cannot bind asset to a deleted entity");
  }
}

function mergeUploadPayload(payload: unknown, variant: AssetVariant, value: Record<string, unknown>): Record<string, unknown> {
  const base = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const uploads = base.uploads && typeof base.uploads === "object" && !Array.isArray(base.uploads) ? base.uploads as Record<string, unknown> : {};
  return { ...base, uploads: { ...uploads, [variant]: value } };
}

function getUploadPayload(payload: unknown, variant: AssetVariant): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const uploads = (payload as Record<string, unknown>).uploads;
  if (!uploads || typeof uploads !== "object" || Array.isArray(uploads)) return null;
  const entry = (uploads as Record<string, unknown>)[variant];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  return entry as Record<string, unknown>;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "img";
}

export { createCosDeleteObjectPresignedUrl };

interface ManifestCursor {
  updatedAt: string;
  id: string;
}

export function formatManifestCursor(row: { updatedAt: Date; id: string }): string {
  const payload: ManifestCursor = { updatedAt: row.updatedAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseManifestCursor(encoded: string): ManifestCursor | null {
  try {
    const obj = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof obj.updatedAt === "string" && typeof obj.id === "string") {
      return obj as ManifestCursor;
    }
    return null;
  } catch {
    return null;
  }
}
