import { createHash, createHmac } from "node:crypto";

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

export class AssetApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface CosUploadConfig {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  expiresSeconds: number;
  protocol: "https" | "http";
}

type AssetRow = typeof assets.$inferSelect;

export class AssetService {
  constructor(
    private readonly db?: NodePgDatabase<typeof schema>,
    private readonly cosConfig: CosUploadConfig | null = loadCosUploadConfig(),
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

    // P1-N08: 向 COS 发 HEAD 验证对象已上传且尺寸/类型匹配
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
    // P1-N10: 只有所有已授权变体都已 uploaded 才设全局 uploaded
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

    // P1-N10: 排除已删除资产
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
      // P1-N10: 只返回真正 uploaded 的变体
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

export function loadCosUploadConfig(env: Record<string, string | undefined> = process.env): CosUploadConfig | null {
  const bucket = env.COS_BUCKET?.trim();
  const region = env.COS_REGION?.trim();
  const secretId = env.COS_SECRET_ID?.trim();
  const secretKey = env.COS_SECRET_KEY?.trim();
  if (!bucket || !region || !secretId || !secretKey) return null;
  return {
    bucket,
    region,
    secretId,
    secretKey,
    expiresSeconds: Math.min(Math.max(Number(env.COS_UPLOAD_EXPIRES_SECONDS ?? 600) || 600, 60), 3600),
    protocol: env.COS_PROTOCOL === "http" ? "http" : "https",
  };
}

export function buildAssetObjectKey(userId: string, assetId: string, variant: AssetVariant, sha256: string, mimeType: string): string {
  return `users/${userId}/assets/${assetId}/${variant}-${sha256.slice(0, 16)}.${extensionForMimeType(mimeType)}`;
}

export function createCosPutObjectPresignedUrl(input: {
  config: CosUploadConfig;
  objectKey: string;
  now: Date;
}): string {
  const start = Math.floor(input.now.getTime() / 1000);
  const end = start + input.config.expiresSeconds;
  const keyTime = `${start};${end}`;
  const host = `${input.config.bucket}.cos.${input.config.region}.myqcloud.com`;
  const uri = `/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const httpString = `put\n${uri}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(input.config.secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${input.config.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
  const url = new URL(`${input.config.protocol}://${host}${uri}`);
  url.searchParams.set("sign", authorization);
  return url.toString();
}

// P1-N08: 向 COS 发 HEAD 请求验证对象存在且元数据匹配
async function verifyCosObject(input: {
  config: CosUploadConfig;
  objectKey: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
}): Promise<void> {
  const now = new Date();
  const host = `${input.config.bucket}.cos.${input.config.region}.myqcloud.com`;
  const uri = `/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const headUrl = createCosHeadObjectPresignedUrl({
    config: input.config,
    objectKey: input.objectKey,
    now,
  });

  const response = await fetch(headUrl, { method: "HEAD" });
  if (!response.ok) {
    throw new AssetApiError(422, "asset_upload_incomplete", `COS object not found or not accessible (status ${response.status})`);
  }
  const contentLength = response.headers.get("content-length");
  const contentType = response.headers.get("content-type");
  if (contentLength && Number(contentLength) !== input.expectedSizeBytes) {
    throw new AssetApiError(422, "asset_size_mismatch", `COS object size ${contentLength} does not match expected ${input.expectedSizeBytes}`);
  }
  if (contentType && contentType.toLowerCase() !== input.expectedMimeType.toLowerCase()) {
    throw new AssetApiError(422, "asset_type_mismatch", `COS object type ${contentType} does not match expected ${input.expectedMimeType}`);
  }
}

function createCosHeadObjectPresignedUrl(input: {
  config: CosUploadConfig;
  objectKey: string;
  now: Date;
}): string {
  const start = Math.floor(input.now.getTime() / 1000);
  const end = start + 300; // HEAD 只需 5 分钟有效期
  const keyTime = `${start};${end}`;
  const host = `${input.config.bucket}.cos.${input.config.region}.myqcloud.com`;
  const uri = `/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const httpString = `head\n${uri}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(input.config.secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${input.config.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
  const url = new URL(`${input.config.protocol}://${host}${uri}`);
  url.searchParams.set("sign", authorization);
  return url.toString();
}

export function createCosGetObjectPresignedUrl(input: {
  config: CosUploadConfig;
  objectKey: string;
  now: Date;
}): string {
  const start = Math.floor(input.now.getTime() / 1000);
  const end = start + input.config.expiresSeconds;
  const keyTime = `${start};${end}`;
  const host = `${input.config.bucket}.cos.${input.config.region}.myqcloud.com`;
  const uri = `/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const httpString = `get\n${uri}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(input.config.secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${input.config.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
  const url = new URL(`${input.config.protocol}://${host}${uri}`);
  url.searchParams.set("sign", authorization);
  return url.toString();
}

// P1-N09: 新 asset 也需验证 owner 实体存在且属于当前用户
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

// 7.1: COS DELETE Object 预签名 URL，供清理流程使用
export function createCosDeleteObjectPresignedUrl(input: {
  config: CosUploadConfig;
  objectKey: string;
  now: Date;
}): string {
  const start = Math.floor(input.now.getTime() / 1000);
  const end = start + 300;
  const keyTime = `${start};${end}`;
  const host = `${input.config.bucket}.cos.${input.config.region}.myqcloud.com`;
  const uri = `/${input.objectKey.split("/").map(encodeURIComponent).join("/")}`;
  const httpString = `delete\n${uri}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signKey = hmacSha1Hex(input.config.secretKey, keyTime);
  const signature = hmacSha1Hex(signKey, stringToSign);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${input.config.secretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    "q-header-list=host",
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
  const url = new URL(`${input.config.protocol}://${host}${uri}`);
  url.searchParams.set("sign", authorization);
  return url.toString();
}

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function hmacSha1Hex(key: string, value: string): string {
  return createHmac("sha1", key).update(value).digest("hex");
}

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
