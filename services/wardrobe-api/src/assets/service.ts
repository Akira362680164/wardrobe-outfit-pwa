import { randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  AssetDeleteResponse,
  AssetManifestRequest,
  AssetManifestResponse,
  AssetUploadHeaders,
  AssetUploadParams,
  AssetUploadResponse,
  AssetVariant,
  TemporaryAssetSessionRequest,
  TemporaryAssetSession,
  TemporaryAssetSessionStatus,
  TemporaryAssetUploadResponse,
} from "@wardrobe/cloud-contracts";
import {
  AssetDeleteResponseSchema,
  AssetManifestResponseSchema,
  AssetUploadResponseSchema,
  TemporaryAssetSessionSchema,
  TemporaryAssetSessionStatusSchema,
  TemporaryAssetUploadResponseSchema,
} from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import { assetBindings, assets, garments, outfits, wishlistItems, locations, tripPlans, outfitPlans, wearEvents, profiles } from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { StorageProviderError, type StorageProvider } from "../storage/provider.js";

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
type UploadMetadata = {
  ownerEntityType: AssetUploadHeaders["x-asset-owner-entity-type"];
  ownerEntityId: string;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
};

export class AssetService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly db?: NodePgDatabase<typeof schema>,
  ) {}

  async createTemporarySession(input: TemporaryAssetSessionRequest & { userId: string; deviceId: string; requestId?: string }): Promise<TemporaryAssetSession> {
    const existing = await this.database().select().from(assets).where(and(
      eq(assets.userId, input.userId), eq(assets.clientMutationId, input.clientMutationId),
      isNull(assets.ownerEntityId), isNull(assets.deletedAt),
    ));
    if (existing.length) return this.temporarySessionResponse(existing, input.requestId);
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const values = input.slots.map((slot) => ({
      id: randomUUID(), userId: input.userId, originDeviceId: input.deviceId,
      temporarySessionId: sessionId, clientMutationId: input.clientMutationId,
      temporaryEntityType: input.entityType, fieldName: slot.fieldName, temporaryVariant: slot.variant,
      expiresAt, uploadStatus: "pending", payload: { expected: slot, uploads: {} },
    }));
    await this.database().insert(assets).values(values);
    return TemporaryAssetSessionSchema.parse({
      sessionId, clientMutationId: input.clientMutationId, expiresAt: expiresAt.toISOString(),
      assets: values.map((row, index) => ({ ...input.slots[index], assetId: row.id, uploadStatus: "pending" })),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
  }

  async getTemporarySession(input: { sessionId: string; userId: string; requestId?: string }): Promise<TemporaryAssetSessionStatus> {
    const rows = await this.database().select().from(assets).where(and(eq(assets.userId, input.userId), eq(assets.temporarySessionId, input.sessionId), isNull(assets.deletedAt)));
    if (!rows.length) throw new AssetApiError(404, "asset_session_not_found", "临时图片会话不存在");
    const session = this.temporarySessionResponse(rows, input.requestId);
    return TemporaryAssetSessionStatusSchema.parse({ ...session, ready: session.assets.every((asset) => asset.uploadStatus === "uploaded") });
  }

  async uploadTemporary(input: { sessionId: string; assetId: string; bytes: Buffer; mimeType: string; userId: string; requestId?: string }): Promise<TemporaryAssetUploadResponse> {
    const [row] = await this.database().select().from(assets).where(and(
      eq(assets.id, input.assetId), eq(assets.userId, input.userId), eq(assets.temporarySessionId, input.sessionId),
      isNull(assets.ownerEntityId), isNull(assets.deletedAt),
    )).limit(1);
    if (!row) throw new AssetApiError(404, "asset_not_found", "临时图片不存在");
    if (!row.expiresAt || row.expiresAt <= new Date()) throw new AssetApiError(410, "asset_session_expired", "临时图片会话已过期");
    const expected = asRecord(asRecord(row.payload).expected);
    if (input.mimeType !== expected.mimeType) throw new AssetApiError(422, "asset_invalid_mime_type", "图片类型与会话声明不一致");
    const variant = row.temporaryVariant as "original" | "thumbnail";
    const storageKey = buildAssetStorageKey(input.userId, input.assetId, variant, String(expected.sha256), input.mimeType);
    try {
      await this.storage.save({ storageKey, bytes: input.bytes, expectedSha256: String(expected.sha256), expectedSizeBytes: Number(expected.sizeBytes), mimeType: input.mimeType });
    } catch (error) { throw mapStorageError(error); }
    const now = new Date();
    const metadata = { storageKey, sha256: expected.sha256, mimeType: expected.mimeType, sizeBytes: expected.sizeBytes, width: expected.width, height: expected.height, completedAt: now.toISOString(), status: "uploaded" };
    await this.database().update(assets).set({
      uploadStatus: "uploaded", sha256: String(expected.sha256), mimeType: input.mimeType, sizeBytes: Number(expected.sizeBytes),
      width: typeof expected.width === "number" ? expected.width : null, height: typeof expected.height === "number" ? expected.height : null,
      originalStorageKey: variant === "original" ? storageKey : null, thumbnailStorageKey: variant === "thumbnail" ? storageKey : null,
      payload: mergeUploadPayload(row.payload, variant, metadata), updatedAt: now,
    }).where(eq(assets.id, row.id));
    return TemporaryAssetUploadResponseSchema.parse({
      status: "uploaded", asset: { ...expected, assetId: row.id, uploadStatus: "uploaded" },
      ...(input.requestId ? { requestId: input.requestId } : {}),
    });
  }

  async abandonTemporarySession(input: { sessionId: string; userId: string; requestId?: string }) {
    const rows = await this.database().select().from(assets).where(and(eq(assets.userId, input.userId), eq(assets.temporarySessionId, input.sessionId), isNull(assets.ownerEntityId), isNull(assets.deletedAt)));
    if (!rows.length) throw new AssetApiError(404, "asset_session_not_found", "临时图片会话不存在");
    const now = new Date();
    await this.database().update(assets).set({ deletedAt: now, uploadStatus: "deleted", updatedAt: now }).where(and(eq(assets.userId, input.userId), eq(assets.temporarySessionId, input.sessionId), isNull(assets.ownerEntityId)));
    await Promise.all(rows.flatMap((row) => [row.originalStorageKey, row.thumbnailStorageKey]).filter((key): key is string => Boolean(key)).map((key) => this.storage.delete(key).catch(() => {})));
    return { status: "abandoned" as const, sessionId: input.sessionId, ...(input.requestId ? { requestId: input.requestId } : {}) };
  }

  async upload(input: AssetUploadParams & UploadMetadata & { bytes: Buffer; userId: string; deviceId: string }): Promise<AssetUploadResponse> {
    const existing = await this.getAsset(input.assetId);
    await assertAssetCanBind(this.database(), existing, input);

    const storageKey = buildAssetStorageKey(input.userId, input.assetId, input.variant, input.sha256, input.mimeType);
    const oldStorageKey = existing ? getVariantStorageKey(existing, input.variant) : null;
    try {
      await this.storage.save({
        storageKey,
        bytes: input.bytes,
        expectedSha256: input.sha256,
        expectedSizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
      });
    } catch (error) {
      throw mapStorageError(error);
    }

    const now = new Date();
    const payload = mergeUploadPayload(existing?.payload, input.variant, {
      storageKey,
      sha256: input.sha256,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      completedAt: now.toISOString(),
      status: "uploaded",
    });

    try {
      await this.database().transaction(async (tx) => {
        const otherVariant = input.variant === "original" ? "thumbnail" : "original";
        const otherReady = getUploadPayload(existing?.payload, otherVariant)?.status === "uploaded";
        const globalStatus = otherReady || !getUploadPayload(existing?.payload, otherVariant) ? "uploaded" : "uploading";
        const keyColumn = input.variant === "original" ? "originalStorageKey" : "thumbnailStorageKey";
        if (existing) {
          await tx.update(assets).set({
            ownerEntityType: input.ownerEntityType,
            ownerEntityId: input.ownerEntityId,
            ...(input.variant === "original" ? {
              mimeType: input.mimeType,
              sha256: input.sha256,
              sizeBytes: input.sizeBytes,
              width: input.width ?? null,
              height: input.height ?? null,
            } : {}),
            [keyColumn]: storageKey,
            uploadStatus: globalStatus,
            updatedAt: now,
            payload,
          }).where(and(eq(assets.id, input.assetId), eq(assets.userId, input.userId)));
        } else {
          await tx.insert(assets).values({
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
            originalStorageKey: input.variant === "original" ? storageKey : null,
            thumbnailStorageKey: input.variant === "thumbnail" ? storageKey : null,
            uploadStatus: "uploaded",
            payload,
            createdAt: now,
            updatedAt: now,
          });
        }
      });
    } catch {
      if (storageKey !== oldStorageKey) await this.storage.delete(storageKey).catch(() => {});
      throw new AssetApiError(500, "asset_upload_failed", "图片元数据保存失败，请稍后重试");
    }

    if (oldStorageKey && oldStorageKey !== storageKey) {
      await this.storage.delete(oldStorageKey).catch(() => {});
    }

    return AssetUploadResponseSchema.parse({
      status: "ok",
      assetId: input.assetId,
      variant: input.variant,
      uploadStatus: "uploaded",
      sha256: input.sha256,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      updatedAt: now.toISOString(),
    });
  }

  async download(input: { assetId: string; variant: AssetVariant; userId: string }) {
    const existing = await this.getOwnedAsset(input.assetId, input.userId);
    if (existing.deletedAt) throw new AssetApiError(404, "asset_not_found", "图片资产不存在");
    const [binding] = await this.database().select({ id: assetBindings.id }).from(assetBindings).where(and(
      eq(assetBindings.assetId, input.assetId), eq(assetBindings.userId, input.userId),
    )).limit(1);
    if (!binding) throw new AssetApiError(404, "asset_not_found", "图片资产不存在");
    const metadata = getUploadPayload(existing.payload, input.variant);
    const storageKey = getVariantStorageKey(existing, input.variant);
    if (!metadata || metadata.status !== "uploaded" || !storageKey) {
      throw new AssetApiError(404, "asset_variant_not_uploaded", "图片版本尚未上传完成");
    }
    try {
      const result = await this.storage.openReadStream(storageKey);
      return {
        ...result,
        sha256: String(metadata.sha256),
        mimeType: String(metadata.mimeType),
      };
    } catch (error) {
      if (isMissingStorageError(error)) {
        await this.markVariantMissing(existing, input.variant, "LOCAL_FILE_MISSING");
        throw new AssetApiError(404, "asset_file_missing", "图片文件缺失，需要从原设备重新上传");
      }
      throw mapStorageError(error);
    }
  }

  async deleteAsset(input: { assetId: string; userId: string }): Promise<AssetDeleteResponse> {
    const existing = await this.getOwnedAsset(input.assetId, input.userId);
    const deletedAt = existing.deletedAt ?? new Date();
    if (!existing.deletedAt) {
      await this.database().update(assets).set({
        deletedAt,
        uploadStatus: "deleted",
        updatedAt: deletedAt,
      }).where(and(eq(assets.id, input.assetId), eq(assets.userId, input.userId)));
    }
    const keys = [existing.originalStorageKey, existing.thumbnailStorageKey].filter((value): value is string => Boolean(value));
    try {
      await Promise.all(keys.map((key) => this.storage.delete(key)));
    } catch (error) {
      throw new AssetApiError(500, "asset_delete_failed", "图片文件清理失败，请稍后重试");
    }
    return AssetDeleteResponseSchema.parse({ status: "ok", assetId: input.assetId, deletedAt: deletedAt.toISOString() });
  }

  async deleteAssetsForOwner(input: { ownerEntityType: string; ownerEntityId: string; userId: string }): Promise<void> {
    const rows = await this.database().select({ id: assets.id }).from(assets).where(and(
      eq(assets.userId, input.userId),
      eq(assets.ownerEntityType, input.ownerEntityType as NonNullable<AssetRow["ownerEntityType"]>),
      eq(assets.ownerEntityId, input.ownerEntityId),
      sql`${assets.deletedAt} IS NULL`,
    ));
    for (const row of rows) await this.deleteAsset({ assetId: row.id, userId: input.userId });
  }

  async getManifest(input: AssetManifestRequest & { userId: string }): Promise<AssetManifestResponse> {
    const cursor = input.cursor ? parseManifestCursor(input.cursor) : null;
    const baseWhere = and(eq(assets.userId, input.userId), sql`${assets.deletedAt} IS NULL`, sql`${assets.ownerEntityId} IS NOT NULL`, sql`${assets.ownerEntityType} IS NOT NULL`);
    const rows = await this.database().select().from(assets).where(
      cursor ? and(baseWhere, sql`(${assets.updatedAt}, ${assets.id}) > (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)`) : baseWhere,
    ).orderBy(sql`${assets.updatedAt} ASC, ${assets.id} ASC`).limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const items = [];
    for (const row of pageRows) {
      const original = await this.availableVariant(row, "original");
      const thumbnail = await this.availableVariant(row, "thumbnail");
      items.push({
        assetId: row.id,
        ownerEntityType: row.ownerEntityType,
        ownerEntityId: row.ownerEntityId,
        uploadStatus: original || thumbnail ? "uploaded" as const : "failed" as const,
        ...(original ? { original } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    const lastItem = pageRows.at(-1);
    return AssetManifestResponseSchema.parse({
      items,
      ...(hasMore && lastItem ? { nextCursor: formatManifestCursor(lastItem) } : {}),
    });
  }

  private async availableVariant(row: AssetRow, variant: AssetVariant) {
    const metadata = getUploadPayload(row.payload, variant);
    const storageKey = getVariantStorageKey(row, variant);
    if (!metadata || metadata.status !== "uploaded" || !storageKey) return null;
    const stored = await this.storage.stat(storageKey).catch(() => ({ exists: false }));
    if (!stored.exists) {
      await this.markVariantMissing(row, variant, "LOCAL_FILE_MISSING");
      return null;
    }
    return {
      sha256: String(metadata.sha256),
      mimeType: String(metadata.mimeType),
      sizeBytes: Number(metadata.sizeBytes),
      ...(typeof metadata.width === "number" ? { width: metadata.width } : {}),
      ...(typeof metadata.height === "number" ? { height: metadata.height } : {}),
    };
  }

  private async markVariantMissing(row: AssetRow, variant: AssetVariant, errorCode: string): Promise<void> {
    const current = getUploadPayload(row.payload, variant) ?? {};
    const payload = mergeUploadPayload(row.payload, variant, { ...current, status: "failed", errorCode });
    await this.database().update(assets).set({ uploadStatus: "failed", payload, updatedAt: new Date() })
      .where(and(eq(assets.id, row.id), eq(assets.userId, row.userId)));
  }

  private async getAsset(assetId: string): Promise<AssetRow | null> {
    const [row] = await this.database().select().from(assets).where(eq(assets.id, assetId)).limit(1);
    return row ?? null;
  }

  private async getOwnedAsset(assetId: string, userId: string): Promise<AssetRow> {
    const existing = await this.getAsset(assetId);
    if (!existing || existing.userId !== userId) throw new AssetApiError(404, "asset_not_found", "图片资产不存在");
    return existing;
  }

  private database(): NodePgDatabase<typeof schema> {
    return this.db ?? getDb();
  }

  private temporarySessionResponse(rows: AssetRow[], requestId?: string): TemporaryAssetSession {
    const first = rows[0];
    return TemporaryAssetSessionSchema.parse({
      sessionId: first.temporarySessionId, clientMutationId: first.clientMutationId, expiresAt: first.expiresAt?.toISOString(),
      assets: rows.map((row) => ({ ...asRecord(asRecord(row.payload).expected), assetId: row.id, uploadStatus: row.uploadStatus })),
      ...(requestId ? { requestId } : {}),
    });
  }
}

export function buildAssetStorageKey(userId: string, assetId: string, variant: AssetVariant, sha256: string, mimeType: string): string {
  return `users/${userId}/assets/${assetId}/${variant}-${sha256.slice(0, 16)}.${extensionForMimeType(mimeType)}`;
}

async function assertAssetCanBind(
  db: NodePgDatabase<typeof schema>,
  existing: AssetRow | null,
  input: UploadMetadata & { userId: string },
): Promise<void> {
  if (existing) {
    if (existing.userId !== input.userId) throw new AssetApiError(404, "asset_not_found", "图片资产不存在");
    if (existing.ownerEntityType !== input.ownerEntityType || existing.ownerEntityId !== input.ownerEntityId) {
      throw new AssetApiError(409, "asset_owner_mismatch", "图片资产已绑定到其他数据");
    }
    return;
  }
  // Inline entity table lookup (replaces removed sync/entity-tables)
  const entityTables: Record<string, any> = {
    garment: garments, outfit: outfits, wishlistItem: wishlistItems,
    closetLocation: locations, tripPlan: tripPlans, outfitPlan: outfitPlans,
    wearEvent: wearEvents, profile: profiles,
  };
  const table = entityTables[input.ownerEntityType] ?? null;
  if (!table) throw new AssetApiError(400, 'invalid_entity_type', '不支持的实体类型: ' + input.ownerEntityType);
  const rows = await db.select({ id: (table as any).id, deletedAt: (table as any).deletedAt }).from(table as any)
    .where(and(eq((table as any).id, input.ownerEntityId), eq((table as any).userId, input.userId))).limit(1);
  if (!rows[0]) throw new AssetApiError(404, "owner_entity_not_found", "图片所属数据不存在");
  if (rows[0].deletedAt) throw new AssetApiError(409, "owner_entity_deleted", "已删除的数据不能绑定图片");
}

function getVariantStorageKey(row: AssetRow, variant: AssetVariant): string | null {
  return variant === "original" ? row.originalStorageKey : row.thumbnailStorageKey;
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
  return entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
}

function extensionForMimeType(mimeType: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[mimeType] ?? "bin";
}

function mapStorageError(error: unknown): AssetApiError {
  if (error instanceof AssetApiError) return error;
  if (error instanceof StorageProviderError) {
    const status = error.code === "asset_too_large" ? 413
      : ["asset_invalid_mime_type", "asset_magic_mismatch", "asset_size_mismatch", "asset_hash_mismatch"].includes(error.code) ? 422
      : error.code === "asset_file_missing" ? 404 : 503;
    return new AssetApiError(status, error.code, error.message);
  }
  return new AssetApiError(503, "asset_storage_unavailable", "图片存储暂时不可用");
}

function isMissingStorageError(error: unknown): boolean {
  return error instanceof StorageProviderError && error.code === "asset_file_missing";
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

interface ManifestCursor { updatedAt: string; id: string }

export function formatManifestCursor(row: { updatedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ updatedAt: row.updatedAt.toISOString(), id: row.id } satisfies ManifestCursor)).toString("base64url");
}

export function parseManifestCursor(encoded: string): ManifestCursor | null {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return typeof value.updatedAt === "string" && typeof value.id === "string" ? value : null;
  } catch {
    return null;
  }
}
