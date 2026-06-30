import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type {
  WorkspaceDetailResponse,
  WorkspaceEntity,
  WorkspaceListResponse,
  WorkspaceOverviewResponse,
  WorkspaceWearSummaryResponse,
} from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import {
  assets,
  garments,
  locations,
  outfitPlans,
  outfits,
  profiles,
  syncChanges,
  tripPlans,
  wearEvents,
  wishlistItems,
} from "../db/schema.js";
import type * as schema from "../db/schema.js";
import { WorkspaceApiError } from "./errors.js";

export const WORKSPACE_RESOURCES = {
  garments: { table: garments, entityType: "garment" },
  outfits: { table: outfits, entityType: "outfit" },
  wishlist: { table: wishlistItems, entityType: "wishlistItem" },
  locations: { table: locations, entityType: "closetLocation" },
  "trip-plans": { table: tripPlans, entityType: "tripPlan", dateColumn: tripPlans.startDate },
  "outfit-plans": { table: outfitPlans, entityType: "outfitPlan", dateColumn: outfitPlans.planDate },
  "wear-events": { table: wearEvents, entityType: "wearEvent", dateColumn: wearEvents.wornAt },
  profiles: { table: profiles, entityType: "profile" },
} as const;

export type WorkspaceResource = keyof typeof WORKSPACE_RESOURCES;
type EntityRow = {
  id: string; userId: string; revision: number; payload: unknown;
  createdAt: Date; updatedAt: Date; deletedAt: Date | null;
};

export class WorkspaceQueryService {
  constructor(private readonly injectedDb?: NodePgDatabase<typeof schema>) {}

  async list(input: { resource: WorkspaceResource; userId: string; cursor?: string; limit: number; startDate?: string; endDate?: string; requestId?: string }): Promise<WorkspaceListResponse> {
    const descriptor = WORKSPACE_RESOURCES[input.resource];
    const table = descriptor.table as AnyPgTable & Record<string, any>;
    const cursor = input.cursor ? decodeWorkspaceCursor(input.cursor) : null;
    if (input.cursor && !cursor) throw new WorkspaceApiError(400, "invalid_request", "分页游标无效");
    const conditions: any[] = [eq(table.userId, input.userId), isNull(table.deletedAt)];
    if (cursor) conditions.push(sql`(${table.updatedAt}, ${table.id}) < (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)`);
    const dateColumn = "dateColumn" in descriptor ? descriptor.dateColumn : undefined;
    if (dateColumn && input.startDate) conditions.push(sql`${dateColumn} >= ${input.startDate}`);
    if (dateColumn && input.endDate) conditions.push(input.resource === "wear-events"
      ? sql`${dateColumn} < (${input.endDate}::date + interval '1 day')`
      : sql`${dateColumn} <= ${input.endDate}`);
    const rows = await this.database().select().from(table).where(and(...conditions)).orderBy(desc(table.updatedAt), desc(table.id)).limit(input.limit + 1) as EntityRow[];
    const pageRows = rows.slice(0, input.limit);
    const entities = await this.toEntities(pageRows, input.userId, descriptor.entityType);
    return {
      items: entities,
      ...(rows.length > input.limit && pageRows.at(-1) ? { nextCursor: encodeWorkspaceCursor(pageRows.at(-1)!) } : {}),
      serverRevision: await this.serverRevision(input.userId),
      ...(input.requestId ? { requestId: input.requestId } : {}),
    };
  }

  async detail(input: { resource: WorkspaceResource; id: string; userId: string; requestId?: string }): Promise<WorkspaceDetailResponse> {
    const descriptor = WORKSPACE_RESOURCES[input.resource];
    const table = descriptor.table as AnyPgTable & Record<string, any>;
    const [row] = await this.database().select().from(table).where(and(eq(table.id, input.id), eq(table.userId, input.userId), isNull(table.deletedAt))).limit(1) as EntityRow[];
    if (!row) throw new WorkspaceApiError(404, "not_found", "数据不存在");
    const [data] = await this.toEntities([row], input.userId, descriptor.entityType);
    return { data, ...(input.requestId ? { requestId: input.requestId } : {}) };
  }

  async overview(userId: string, requestId?: string): Promise<WorkspaceOverviewResponse> {
    const resources = Object.keys(WORKSPACE_RESOURCES) as WorkspaceResource[];
    const collections = await Promise.all(resources.map((resource) => this.readAll(resource, userId)));
    const by = Object.fromEntries(resources.map((resource, index) => [resource, collections[index]])) as Record<WorkspaceResource, WorkspaceEntity[]>;
    return {
      garments: by.garments, outfits: by.outfits, wishlistItems: by.wishlist,
      locations: by.locations, tripPlans: by["trip-plans"], outfitPlans: by["outfit-plans"],
      wearEvents: by["wear-events"], profiles: by.profiles,
      serverRevision: await this.serverRevision(userId),
      ...(requestId ? { requestId } : {}),
    };
  }

  async wearSummary(userId: string, requestId?: string): Promise<WorkspaceWearSummaryResponse> {
    const events = await this.readAll("wear-events", userId);
    const garmentWearCounts: Record<string, number> = {};
    const outfitWearCounts: Record<string, number> = {};
    for (const event of events) {
      const garmentId = typeof event.payload.garmentId === "string" ? event.payload.garmentId : undefined;
      const outfitId = typeof event.payload.outfitId === "string" ? event.payload.outfitId : undefined;
      if (garmentId) garmentWearCounts[garmentId] = (garmentWearCounts[garmentId] ?? 0) + 1;
      if (outfitId) outfitWearCounts[outfitId] = (outfitWearCounts[outfitId] ?? 0) + 1;
    }
    return { garmentWearCounts, outfitWearCounts, recentEvents: events.slice(0, 200), serverRevision: await this.serverRevision(userId), ...(requestId ? { requestId } : {}) };
  }

  async serverRevision(userId: string): Promise<number> {
    const [row] = await this.database().select({ value: sql<number>`coalesce(max(${syncChanges.changeSeq}), 0)` }).from(syncChanges).where(eq(syncChanges.userId, userId));
    return Number(row?.value ?? 0);
  }

  private async toEntities(rows: EntityRow[], userId: string, entityType: string): Promise<WorkspaceEntity[]> {
    if (!rows.length) return [];
    const assetRows = await this.database().select().from(assets).where(and(
      eq(assets.userId, userId),
      eq(assets.ownerEntityType, entityType as NonNullable<typeof assets.$inferSelect.ownerEntityType>),
      inArray(assets.ownerEntityId, rows.map((row) => row.id)),
      isNull(assets.deletedAt),
    ));
    const refs = new Map<string, Record<string, any>>();
    for (const asset of assetRows) {
      if (!asset.ownerEntityId || !asset.fieldName) continue;
      const uploads = asRecord(asRecord(asset.payload).uploads);
      const original = asRecord(uploads.original);
      const thumbnail = asRecord(uploads.thumbnail);
      const variants = (["original", "thumbnail"] as const).filter((variant) => asRecord(uploads[variant]).status === "uploaded");
      if (!variants.length) continue;
      const primary = original.status === "uploaded" ? original : thumbnail;
      const ownerRefs = refs.get(asset.ownerEntityId) ?? {};
      ownerRefs[asset.fieldName] = {
        assetId: asset.id, variants,
        sha256: String(primary.sha256 ?? asset.sha256), mimeType: String(primary.mimeType ?? asset.mimeType),
        ...(asset.width ? { width: asset.width } : {}), ...(asset.height ? { height: asset.height } : {}),
        variantSha256: Object.fromEntries(variants.map((variant) => [variant, String(asRecord(uploads[variant]).sha256)])),
      };
      refs.set(asset.ownerEntityId, ownerRefs);
    }
    return rows.map((row) => ({
      id: row.id, revision: row.revision, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      payload: asRecord(row.payload), ...(refs.get(row.id) ? { assetRefs: refs.get(row.id) } : {}),
    }));
  }

  private async readAll(resource: WorkspaceResource, userId: string): Promise<WorkspaceEntity[]> {
    const items: WorkspaceEntity[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.list({ resource, userId, limit: 200, cursor });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }

  private database(): NodePgDatabase<typeof schema> { return this.injectedDb ?? getDb(); }
}

export function encodeWorkspaceCursor(row: { updatedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ updatedAt: row.updatedAt.toISOString(), id: row.id })).toString("base64url");
}

export function decodeWorkspaceCursor(value: string): { updatedAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof parsed.updatedAt === "string" && typeof parsed.id === "string" ? parsed : null;
  } catch { return null; }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
