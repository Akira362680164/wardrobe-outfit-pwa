// services/wardrobe-api/src/sync/service.ts
// v1.1.37 cloud 1B B4: sync engine service.
// 负责 bootstrap / push / pull / resolve-conflict 四类同步协议。
// 服务端写业务表 + sync_changes 都走 Drizzle 事务保证原子性；
// push 路径上对每条 mutation 做 userId 归属校验 + baseRevision 检查 + 幂等 mutationId 派发。

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  garments,
  outfits,
  outfitItems,
  wishlistItems,
  wearEvents,
  tripPlans,
  outfitPlans,
  assets,
  locations,
  syncChanges,
  syncMutations,
} from "../db/schema.js";
import { getDb } from "../db/client.js";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../db/schema.js";
import {
  AssetManifestEntrySchema,
  BootstrapRequestSchema,
  BootstrapResponseSchema,
  PullRequestSchema,
  PullResponseSchema,
  PushRequestSchema,
  PushResponseSchema,
  ResolveConflictRequestSchema,
  ResolveConflictResponseSchema,
  SyncAssetSchema,
  SyncChangeSchema,
  SyncEntityBundleSchema,
  SyncEntitySchema,
  SyncGarmentSchema,
  SyncOutfitItemSchema,
  SyncOutfitPlanSchema,
  SyncTripPlanSchema,
  SyncWearEventSchema,
  type AssetManifestEntry,
  type BootstrapRequest,
  type BootstrapResponse,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ResolveConflictRequest,
  type ResolveConflictResponse,
  type SyncChange,
  type SyncEntity,
  type SyncEntityBundle,
  type SyncEntityType,
  type SyncEntityType as SyncEntityTypeContract,
} from "@wardrobe/cloud-contracts";

import { getTableForEntityType, listSyncEntityTables } from "./entity-tables.js";
import { encodeCursor, decodeCursor } from "./cursor.js";

const BOOTSTRAP_BATCH_LIMIT = 500;
const PULL_BATCH_LIMIT = 500;

// P0-N02: payload 中不得覆盖的服务端控制字段
const PROTECTED_COLUMNS = new Set([
  "id", "userId", "revision", "originDeviceId",
  "createdAt", "updatedAt", "deletedAt",
]);

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!PROTECTED_COLUMNS.has(key)) {
      safe[key] = value;
    }
  }
  return safe;
}

export class SyncApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface SyncServiceDeps {
  // 预留依赖注入边界：单元测试可以传 mock；当前只有 Postgres 实现。
  fetchBundle: (userId: string, db: NodePgDatabase<typeof schema>) => Promise<SyncEntityBundle>;
  fetchAssetManifest: (userId: string, db: NodePgDatabase<typeof schema>) => Promise<AssetManifestEntry[]>;
}

export class SyncService {
  constructor(private readonly deps: SyncServiceDeps = {
    fetchBundle: defaultFetchBundle,
    fetchAssetManifest: defaultFetchAssetManifest,
  }) {}

  async bootstrap(input: BootstrapRequest & { userId: string }): Promise<BootstrapResponse> {
    const parsed = BootstrapRequestSchema.parse(input);
    const db = getDb();
    const userId = input.userId;

    // B4 实现：单批返回该用户全部结构化数据；后续可按 pageToken 分批。
    // B4 不实现业务增量分批：bootstrap 是首次拉齐，必须保证客户端拿到全量。
    const [entities, assetManifest, cursorRow] = await Promise.all([
      this.deps.fetchBundle(userId, db),
      this.deps.fetchAssetManifest(userId, db),
      db
        .select({ maxSeq: sql<number>`coalesce(max(${syncChanges.changeSeq}), 0)` })
        .from(syncChanges)
        .where(eq(syncChanges.userId, userId)),
    ]);

    return BootstrapResponseSchema.parse({
      serverCursor: encodeCursor(cursorRow[0]?.maxSeq ?? 0, new Date().toISOString()),
      entities,
      assetManifest,
      hasMore: false,
    });
  }

  async push(input: PushRequest & { userId: string; deviceId: string }): Promise<PushResponse> {
    const parsed = PushRequestSchema.parse(input);
    const db = getDb();
    const userId = input.userId;
    const deviceId = input.deviceId;

    if (parsed.mutations.length === 0) {
      return PushResponseSchema.parse({ results: [] });
    }

    const results: PushResponse["results"] = [];

    // 每条 mutation 独立事务，便于个别失败不阻塞其他。
    for (const mutation of parsed.mutations) {
      // 归属 + 类型兜底（schema 已 parse，但二次校验是 server-side defense in depth）。
      if (mutation.entityId.length === 0) {
        results.push({
          mutationId: mutation.mutationId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          status: "rejected",
          errorCode: "INVALID_ENTITY_ID",
        });
        continue;
      }

      try {
        const result = await db.transaction(async (tx) => {
          // 1. 幂等：mutationId + userId 唯一
          const [existing] = await tx
            .select()
            .from(syncMutations)
            .where(
              and(
                eq(syncMutations.userId, userId),
                eq(syncMutations.mutationId, mutation.mutationId),
              ),
            )
            .limit(1);

          if (existing) {
            return {
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              status: existing.status as "accepted" | "conflict" | "rejected",
              serverRevision: existing.resultRevision ?? undefined,
              errorCode: existing.errorCode ?? undefined,
            } satisfies PushResponse["results"][number];
          }

          // 2. 取得 entityType 对应的 drizzle table
          const table = getTableForEntityType(mutation.entityType);

          // 3. 查实体当前状态 + 跨账号校验
          const existingEntities = await tx
            .select({ id: (table as any).id, revision: (table as any).revision, userId: (table as any).userId })
            .from(table as any)
            .where(eq((table as any).id, mutation.entityId))
            .limit(1);

          const existingEntity = existingEntities[0];
          if (existingEntity && existingEntity.userId !== userId) {
            throw new SyncApiError(403, "CROSS_ACCOUNT_ACCESS", "Mutation targets another account");
          }

          // P0-N03: 严格操作状态机
          const operation = mutation.operation;
          if (operation === "create" && existingEntity) {
            // create 命中已存在实体 → 拒绝
            const [nextSeqRow] = await tx
              .insert(syncMutations)
              .values({
                userId,
                mutationId: mutation.mutationId,
                entityType: mutation.entityType,
                entityId: mutation.entityId,
                operation: mutation.operation,
                baseRevision: mutation.baseRevision ?? null,
                status: "rejected",
                errorCode: "ENTITY_ALREADY_EXISTS",
                payload: mutation.payload ?? {},
              })
              .returning();
            return {
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              status: "rejected" as const,
              errorCode: "ENTITY_ALREADY_EXISTS",
              serverRevision: existingEntity.revision,
            };
          }
          if ((operation === "update" || operation === "delete") && !existingEntity) {
            return {
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              status: "rejected" as const,
              errorCode: "ENTITY_NOT_FOUND",
            };
          }
          // revision 检查（create 实体不存在时跳过）
          if (existingEntity && existingEntity.revision !== mutation.baseRevision) {
            await tx.insert(syncMutations).values({
              userId,
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              operation: mutation.operation,
              baseRevision: mutation.baseRevision ?? null,
              status: "conflict",
              errorCode: "REVISION_MISMATCH",
              payload: mutation.payload ?? {},
            });
            return {
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              status: "conflict" as const,
              errorCode: "REVISION_MISMATCH",
              serverRevision: existingEntity.revision,
            };
          }

          // 4. 应用 mutation：serverRevision 基于服务端当前值
          const serverRevision = existingEntity ? existingEntity.revision + 1 : 1;
          const now = new Date();
          const safePayload = sanitizePayload((mutation.payload ?? {}) as Record<string, unknown>);

          if (operation === "delete") {
            await tx
              .update(table as any)
              .set({ deletedAt: now, updatedAt: now, revision: serverRevision })
              .where(eq((table as any).id, mutation.entityId));
          } else if (existingEntity) {
            // update：safePayload 在前，服务端字段在后覆盖
            await tx
              .update(table as any)
              .set({
                ...safePayload,
                userId,
                updatedAt: now,
                revision: serverRevision,
              })
              .where(eq((table as any).id, mutation.entityId));
          } else {
            // create：safePayload 在前，服务端字段在后覆盖
            await tx.insert(table as any).values({
              ...safePayload,
              id: mutation.entityId,
              userId,
              originDeviceId: deviceId,
              createdAt: now,
              updatedAt: now,
              revision: serverRevision,
            });
          }

          // 5. 写 sync_changes（advisory lock 保护并发序号分配）
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`,
          );
          const [seqRow] = await tx
            .select({ nextSeq: sql<number>`coalesce(max(${syncChanges.changeSeq}), 0) + 1` })
            .from(syncChanges)
            .where(eq(syncChanges.userId, userId));
          const nextSeq = Number(seqRow?.nextSeq ?? 1);

          await tx.insert(syncChanges).values({
            userId,
            changeSeq: nextSeq,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            operation: mutation.operation,
            revision: serverRevision,
            payload: mutation.payload ?? {},
            createdAt: now,
          });

          // 6. 写 sync_mutations（accepted）
          await tx.insert(syncMutations).values({
            userId,
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            operation: mutation.operation,
            baseRevision: mutation.baseRevision ?? null,
            status: "accepted",
            resultRevision: serverRevision,
            payload: mutation.payload ?? {},
          });

          return {
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            status: "accepted" as const,
            serverRevision,
          };
        });
        results.push(result);
      } catch (error) {
        if (error instanceof SyncApiError && error.statusCode === 403) {
          results.push({
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            status: "rejected",
            errorCode: error.code,
          });
          continue;
        }
        // 事务失败（除了 cross-account）作为 conflict 返回，让客户端保留 outbox
        results.push({
          mutationId: mutation.mutationId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          status: "rejected",
          errorCode: "SERVER_ERROR",
        });
      }
    }

    // 返回 serverCursor（max changeSeq）
    const [cursorRow] = await db
      .select({ maxSeq: sql<number>`coalesce(max(${syncChanges.changeSeq}), 0)` })
      .from(syncChanges)
      .where(eq(syncChanges.userId, userId));

    return PushResponseSchema.parse({
      results,
      serverCursor: encodeCursor(cursorRow?.maxSeq ?? 0, new Date().toISOString()),
    });
  }

  async pull(input: PullRequest & { userId: string }): Promise<PullResponse> {
    const parsed = PullRequestSchema.parse(input);
    const db = getDb();
    const userId = input.userId;

    const cursorSeq = parsed.cursor ? decodeCursor(parsed.cursor).seq : 0;
    const limit = Math.min(parsed.limit ?? PULL_BATCH_LIMIT, PULL_BATCH_LIMIT);

    const rows = await db
      .select()
      .from(syncChanges)
      .where(
        and(
          eq(syncChanges.userId, userId),
          sql`${syncChanges.changeSeq} > ${cursorSeq}`,
        ),
      )
      .orderBy(asc(syncChanges.changeSeq))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const lastSeq = slice.length > 0 ? Number(slice[slice.length - 1].changeSeq) : cursorSeq;

    const changes: SyncChange[] = slice.map((row) =>
      SyncChangeSchema.parse({
        cursor: encodeCursor(Number(row.changeSeq), row.createdAt.toISOString()),
        entityType: row.entityType,
        entityId: row.entityId,
        operation: row.operation,
        revision: row.revision,
        payload: row.payload as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      }),
    );

    return PullResponseSchema.parse({
      changes,
      nextCursor: encodeCursor(lastSeq, new Date().toISOString()),
      hasMore,
    });
  }

  async resolveConflict(input: ResolveConflictRequest & { userId: string }): Promise<ResolveConflictResponse> {
    const parsed = ResolveConflictRequestSchema.parse(input);
    const db = getDb();
    const userId = input.userId;

    const [conflict] = await db
      .select()
      .from(syncMutations)
      .where(
        and(
          eq(syncMutations.userId, userId),
          eq(syncMutations.mutationId, parsed.conflictId),
        ),
      )
      .limit(1);

    if (!conflict) {
      throw new SyncApiError(404, "CONFLICT_NOT_FOUND", "Conflict record not found");
    }

    if (conflict.status !== "conflict") {
      return ResolveConflictResponseSchema.parse({ status: "ok" });
    }

    if (parsed.resolution === "use_cloud") {
      // 删除 outbox 记录（业务侧会通过 syncState 重新拉取 server 状态）
      await db
        .delete(syncMutations)
        .where(
          and(
            eq(syncMutations.userId, userId),
            eq(syncMutations.mutationId, parsed.conflictId),
          ),
        );
    }
    // keep_local 由客户端生成新 mutation 再走 push 路径，service 端不直接处理。

    return ResolveConflictResponseSchema.parse({ status: "ok" });
  }

  // P1-N12: 定期清理过期记录
  async cleanup(): Promise<{ deletedChanges: number; deletedMutations: number }> {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [changesResult, mutationsResult] = await Promise.all([
      db.delete(syncChanges).where(sql`${syncChanges.createdAt} < ${thirtyDaysAgo.toISOString()}`).returning(),
      db.delete(syncMutations).where(sql`${syncMutations.createdAt} < ${sevenDaysAgo.toISOString()}`).returning(),
    ]);

    return {
      deletedChanges: changesResult.length,
      deletedMutations: mutationsResult.length,
    };
  }
}

// 默认实现：8 张表全部读，组成 SyncEntityBundle 返回
async function defaultFetchBundle(userId: string, db: NodePgDatabase<typeof schema>): Promise<SyncEntityBundle> {
  const [
    garmentRows,
    outfitRows,
    outfitItemRows,
    wishlistRows,
    wearEventRows,
    tripPlanRows,
    outfitPlanRows,
    assetRows,
    locationRows,
  ] = await Promise.all([
    db.select().from(garments).where(eq(garments.userId, userId)),
    db.select().from(outfits).where(eq(outfits.userId, userId)),
    db.select().from(outfitItems).where(eq(outfitItems.userId, userId)),
    db.select().from(wishlistItems).where(eq(wishlistItems.userId, userId)),
    db.select().from(wearEvents).where(eq(wearEvents.userId, userId)),
    db.select().from(tripPlans).where(eq(tripPlans.userId, userId)),
    db.select().from(outfitPlans).where(eq(outfitPlans.userId, userId)),
    db.select().from(assets).where(eq(assets.userId, userId)),
    db.select().from(locations).where(eq(locations.userId, userId)),
  ]);

  return SyncEntityBundleSchema.parse({
    garments: garmentRows.map(toGarmentSyncEntity),
    outfits: outfitRows.map(toSyncEntity),
    outfitItems: outfitItemRows.map(toOutfitItemSyncEntity),
    wishlistItems: wishlistRows.map(toSyncEntity),
    wearEvents: wearEventRows.map(toWearEventSyncEntity),
    tripPlans: tripPlanRows.map(toTripPlanSyncEntity),
    outfitPlans: outfitPlanRows.map(toOutfitPlanSyncEntity),
    assets: assetRows.map(toAssetSyncEntity),
    closetLocations: locationRows.map(toSyncEntity),
  });
}

async function defaultFetchAssetManifest(userId: string, db: NodePgDatabase<typeof schema>): Promise<AssetManifestEntry[]> {
  const rows = await db
    .select()
    .from(assets)
    .where(eq(assets.userId, userId));

  return rows.map((row) =>
    AssetManifestEntrySchema.parse({
      assetId: row.id,
      ownerEntityType: row.ownerEntityType as SyncEntityTypeContract,
      ownerEntityId: row.ownerEntityId,
      sha256: row.sha256 ?? undefined,
      thumbnailReady: Boolean(row.storageKey),
    }),
  );
}

// P0-N04: 每种实体专用序列化器，合并专用列 + payload
function toGarmentSyncEntity(row: typeof garments.$inferSelect): z.infer<typeof SyncGarmentSchema> {
  return SyncGarmentSchema.parse({
    id: row.id,
    userId: row.userId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    wardrobeId: row.wardrobeId ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? {},
  });
}

function toOutfitItemSyncEntity(row: typeof outfitItems.$inferSelect): z.infer<typeof SyncOutfitItemSchema> {
  return SyncOutfitItemSchema.parse({
    id: row.id,
    userId: row.userId,
    outfitId: row.outfitId,
    garmentId: row.garmentId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    sortOrder: row.sortOrder ?? undefined,
  });
}

function toWearEventSyncEntity(row: typeof wearEvents.$inferSelect): z.infer<typeof SyncWearEventSchema> {
  return SyncWearEventSchema.parse({
    id: row.id,
    userId: row.userId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    garmentId: row.garmentId ?? undefined,
    outfitId: row.outfitId ?? undefined,
    wornAt: row.wornAt.toISOString(),
    payload: (row.payload as Record<string, unknown>) ?? {},
  });
}

function toTripPlanSyncEntity(row: typeof tripPlans.$inferSelect): z.infer<typeof SyncTripPlanSchema> {
  return SyncTripPlanSchema.parse({
    id: row.id,
    userId: row.userId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? {},
  });
}

function toOutfitPlanSyncEntity(row: typeof outfitPlans.$inferSelect): z.infer<typeof SyncOutfitPlanSchema> {
  return SyncOutfitPlanSchema.parse({
    id: row.id,
    userId: row.userId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    tripPlanId: row.tripPlanId ?? undefined,
    outfitId: row.outfitId ?? undefined,
    planDate: row.planDate ?? undefined,
    payload: (row.payload as Record<string, unknown>) ?? {},
  });
}

function toAssetSyncEntity(row: typeof assets.$inferSelect): z.infer<typeof SyncAssetSchema> {
  return SyncAssetSchema.parse({
    id: row.id,
    userId: row.userId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    ownerEntityType: row.ownerEntityType as SyncEntityTypeContract,
    ownerEntityId: row.ownerEntityId,
    sha256: row.sha256 ?? undefined,
    mimeType: row.mimeType ?? undefined,
    storageKey: row.storageKey ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    originalObjectKey: row.originalObjectKey ?? undefined,
    thumbnailObjectKey: row.thumbnailObjectKey ?? undefined,
    uploadStatus: row.uploadStatus,
    payload: (row.payload as Record<string, unknown>) ?? {},
  });
}

function toSyncEntity(row: {
  id: string;
  userId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  originDeviceId: string;
  payload?: unknown;
}): SyncEntity {
  return SyncEntitySchema.parse({
    id: row.id,
    userId: row.userId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    originDeviceId: row.originDeviceId,
    payload: (row.payload as Record<string, unknown>) ?? {},
  });
}

// re-export sync 协议类型，方便 routes 和测试
export type { SyncEntityType, SyncChange, BootstrapResponse, PushResponse, PullResponse, ResolveConflictResponse };
