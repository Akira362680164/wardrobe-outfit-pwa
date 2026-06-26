import { createHash, createHmac } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  AssetUploadAuthorizeRequest,
  AssetUploadAuthorizeResponse,
  AssetUploadCompleteRequest,
  AssetUploadCompleteResponse,
  AssetVariant,
} from "@wardrobe/cloud-contracts";
import {
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
    assertAssetCanBind(existing, input);

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

    const now = new Date();
    const payload = mergeUploadPayload(existing.payload, input.variant, {
      ...expected,
      width: input.width,
      height: input.height,
      completedAt: now.toISOString(),
      status: "uploaded",
    });
    await this.database()
      .update(assets)
      .set({
        uploadStatus: "uploaded",
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

function assertAssetCanBind(existing: AssetRow | null, input: AssetUploadAuthorizeRequest & { userId: string }): void {
  if (!existing) return;
  if (existing.userId !== input.userId) {
    throw new AssetApiError(404, "asset_not_found", "Asset was not found");
  }
  if (existing.ownerEntityType !== input.ownerEntityType || existing.ownerEntityId !== input.ownerEntityId) {
    throw new AssetApiError(409, "asset_owner_mismatch", "Asset already belongs to a different entity");
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

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function hmacSha1Hex(key: string, value: string): string {
  return createHmac("sha1", key).update(value).digest("hex");
}
