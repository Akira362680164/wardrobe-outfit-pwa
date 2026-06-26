"use client";

import Dexie from "dexie";
import {
  createWorkspaceUuidV7,
  getAccountWorkspaceDb,
  runWorkspaceWrite,
  type AccountWorkspaceDatabase,
  type WorkspaceGarmentRecord,
  type WorkspaceOutfitItemRecord,
  type WorkspaceOutfitPlanRecord,
  type WorkspaceOutfitRecord,
  type WorkspaceSyncEntity,
  type WorkspaceSyncOutboxRecord,
  type WorkspaceTripPlanRecord,
  type WorkspaceWearEventRecord,
  type WorkspaceWishlistItemRecord,
} from "@/lib/account-workspace-db";
import { currentWorkspaceGuard } from "@/lib/cloud-sync/sync-engine";
import { toCloudGarmentPayload } from "@/lib/cloud-sync/garment-bridge";
import { toCloudOutfitPayload } from "@/lib/cloud-sync/outfit-bridge";
import { toCloudOutfitPlanPayload, toCloudTripPlanPayload } from "@/lib/cloud-sync/plan-bridge";
import { toCloudWishlistPayload } from "@/lib/cloud-sync/wishlist-bridge";
import { getWardrobeDb } from "@/lib/db";
import {
  migrateItemRecord,
  migrateOutfitCalendarPlanRecord,
  migrateOutfitPlanEntryRecord,
  migratePlanPackingChecklistItemRecord,
  migrateSavedOutfitRecord,
  migrateWishlistItemRecord,
} from "@/lib/migrate";
import type {
  OutfitCalendarPlan,
  OutfitPlanEntry,
  PlanPackingChecklistItem,
  SavedOutfit,
  WardrobeItem,
  WishlistItem,
} from "@/lib/types";
import {
  isWorkspaceResponseCurrent,
  loadWorkspaceRegistry,
  type AccountWorkspaceRecord,
} from "@/lib/workspace-registry";

const LEGACY_WARDROBE_DB_NAME = "wardrobe-outfit-pwa";

export interface LegacyImportCounts {
  garments: number;
  outfits: number;
  outfitItems: number;
  wishlistItems: number;
  wearEvents: number;
  tripPlans: number;
  outfitPlans: number;
  packingChecklistItems: number;
}

export interface LegacyImportPreview {
  migrationId: string;
  sourceDatabaseFingerprint: string;
  hasLegacyData: boolean;
  imported: boolean;
  completedAt?: string;
  counts: LegacyImportCounts;
}

export interface LegacyImportResult extends LegacyImportPreview {
  status: "imported" | "already_imported" | "empty" | "workspace_switched";
}

interface LegacyWardrobeSource {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitCalendarPlans: OutfitCalendarPlan[];
  outfitPlanEntries: OutfitPlanEntry[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
}

interface PreparedEntity<T extends WorkspaceSyncEntity> {
  record: T;
  operation: "create" | "update";
  baseRevision: number;
  payload: unknown;
}

export async function getLegacyImportPreview(
  workspace: AccountWorkspaceRecord,
): Promise<LegacyImportPreview> {
  const source = await readLegacyWardrobeSource();
  const counts = countLegacySource(source);
  const sourceDatabaseFingerprint = fingerprintLegacySource(source, counts);
  const migrationId = legacyMigrationIdForWorkspace(workspace);
  const state = await getAccountWorkspaceDb(workspace).migrationState.get(migrationId);
  return {
    migrationId,
    sourceDatabaseFingerprint,
    hasLegacyData: hasLegacyData(counts),
    imported: state?.status === "completed" || Boolean(state?.completedAt),
    completedAt: state?.completedAt,
    counts,
  };
}

export async function importLegacyDexieToWorkspace(input: {
  workspace: AccountWorkspaceRecord;
  originDeviceId?: string;
}): Promise<LegacyImportResult> {
  const { workspace } = input;
  const db = getAccountWorkspaceDb(workspace);
  const guard = currentWorkspaceGuard(workspace);
  const migrationId = legacyMigrationIdForWorkspace(workspace);
  const source = await readLegacyWardrobeSource();
  const counts = countLegacySource(source);
  const sourceDatabaseFingerprint = fingerprintLegacySource(source, counts);
  const basePreview: LegacyImportPreview = {
    migrationId,
    sourceDatabaseFingerprint,
    hasLegacyData: hasLegacyData(counts),
    imported: false,
    counts,
  };

  if (!basePreview.hasLegacyData) return { ...basePreview, status: "empty" };

  const existingState = await db.migrationState.get(migrationId);
  if (existingState?.status === "completed" || existingState?.completedAt) {
    return {
      ...basePreview,
      imported: true,
      completedAt: existingState.completedAt,
      status: "already_imported",
    };
  }

  if (!isLegacyImportGuardCurrent(workspace, guard)) {
    return { ...basePreview, status: "workspace_switched" };
  }

  const prepared = await prepareLegacyImport(db, workspace, input.originDeviceId ?? workspace.deviceId, source);
  if (!isLegacyImportGuardCurrent(workspace, guard)) {
    return { ...basePreview, status: "workspace_switched" };
  }

  const now = new Date().toISOString();
  await runWorkspaceWrite(
    db,
    ["garments", "outfits", "outfitItems", "wishlistItems", "wearEvents", "tripPlans", "outfitPlans", "syncOutbox", "migrationState"],
    async (tx) => {
      await tx.migrationState.put({
        migrationId,
        userId: workspace.userId,
        sourceDatabaseFingerprint,
        targetUserId: workspace.userId,
        status: "started",
        startedAt: existingState?.startedAt ?? now,
      });
      for (const entity of prepared.garments) await putEntityWithOutbox(tx, workspace, "garments", "garment", entity);
      for (const entity of prepared.outfits) await putEntityWithOutbox(tx, workspace, "outfits", "outfit", entity);
      for (const entity of prepared.outfitItems) await putEntityWithOutbox(tx, workspace, "outfitItems", "outfitItem", entity);
      for (const entity of prepared.wishlistItems) await putEntityWithOutbox(tx, workspace, "wishlistItems", "wishlistItem", entity);
      for (const entity of prepared.tripPlans) await putEntityWithOutbox(tx, workspace, "tripPlans", "tripPlan", entity);
      for (const entity of prepared.outfitPlans) await putEntityWithOutbox(tx, workspace, "outfitPlans", "outfitPlan", entity);
      for (const entity of prepared.wearEvents) await putEntityWithOutbox(tx, workspace, "wearEvents", "wearEvent", entity);
      await tx.migrationState.put({
        migrationId,
        userId: workspace.userId,
        sourceDatabaseFingerprint,
        targetUserId: workspace.userId,
        status: "completed",
        startedAt: existingState?.startedAt ?? now,
        completedAt: new Date().toISOString(),
      });
    },
  );

  return {
    ...basePreview,
    imported: true,
    completedAt: new Date().toISOString(),
    status: "imported",
  };
}

async function readLegacyWardrobeSource(): Promise<LegacyWardrobeSource> {
  const exists = await Dexie.exists(LEGACY_WARDROBE_DB_NAME);
  if (!exists) return emptyLegacySource();

  const db = getWardrobeDb();
  const [
    rawItems,
    rawOutfits,
    rawWishlistItems,
    rawOutfitCalendarPlans,
    rawOutfitPlanEntries,
    rawPlanPackingChecklistItems,
  ] = await Promise.all([
    readLegacyRows(() => db.items.toArray(), "items"),
    readLegacyRows(() => db.outfits.toArray(), "outfits"),
    readLegacyRows(() => db.wishlistItems.toArray(), "wishlistItems"),
    readLegacyRows(() => db.outfitCalendarPlans.toArray(), "outfitCalendarPlans"),
    readLegacyRows(() => db.outfitPlanEntries.toArray(), "outfitPlanEntries"),
    readLegacyRows(() => db.planPackingChecklistItems.toArray(), "planPackingChecklistItems"),
  ]);

  return {
    items: rawItems
      .map((item) => migrateItemRecord(item))
      .filter((item) => typeof item.id === "number"),
    outfits: rawOutfits.map((outfit) => migrateSavedOutfitRecord(outfit)),
    wishlistItems: rawWishlistItems
      .map((item) => migrateWishlistItemRecord(item))
      .filter((item): item is WishlistItem => item !== null),
    outfitCalendarPlans: rawOutfitCalendarPlans
      .map((plan) => migrateOutfitCalendarPlanRecord(plan))
      .filter((plan): plan is OutfitCalendarPlan => plan !== null),
    outfitPlanEntries: rawOutfitPlanEntries
      .map((entry) => migrateOutfitPlanEntryRecord(entry))
      .filter((entry): entry is OutfitPlanEntry => entry !== null),
    planPackingChecklistItems: rawPlanPackingChecklistItems
      .map((item) => migratePlanPackingChecklistItemRecord(item))
      .filter((item): item is PlanPackingChecklistItem => item !== null),
  };
}

async function readLegacyRows<T>(read: () => Promise<T[]>, label: string): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    if (typeof console !== "undefined") console.warn(`[legacy-import] ${label} read fallback:`, error);
    return [];
  }
}

function emptyLegacySource(): LegacyWardrobeSource {
  return {
    items: [],
    outfits: [],
    wishlistItems: [],
    outfitCalendarPlans: [],
    outfitPlanEntries: [],
    planPackingChecklistItems: [],
  };
}

async function prepareLegacyImport(
  db: AccountWorkspaceDatabase,
  workspace: AccountWorkspaceRecord,
  originDeviceId: string,
  source: LegacyWardrobeSource,
) {
  const now = new Date().toISOString();
  const [
    existingGarments,
    existingOutfits,
    existingOutfitItems,
    existingWishlistItems,
    existingTripPlans,
    existingOutfitPlans,
    existingWearEvents,
  ] = await Promise.all([
    db.garments.where("userId").equals(workspace.userId).toArray(),
    db.outfits.where("userId").equals(workspace.userId).toArray(),
    db.outfitItems.where("userId").equals(workspace.userId).toArray(),
    db.wishlistItems.where("userId").equals(workspace.userId).toArray(),
    db.tripPlans.where("userId").equals(workspace.userId).toArray(),
    db.outfitPlans.where("userId").equals(workspace.userId).toArray(),
    db.wearEvents.where("userId").equals(workspace.userId).toArray(),
  ]);

  const existingGarmentByLegacyId = mapByNumberLegacy(existingGarments, (row) => row.legacyItemId);
  const existingOutfitByLegacyId = mapByStringLegacy(existingOutfits, (row) => row.legacyOutfitId);
  const existingWishlistByLegacyId = mapByStringLegacy(existingWishlistItems, (row) => row.legacyWishlistId);
  const existingTripPlanByLegacyId = mapByStringLegacy(existingTripPlans, (row) => row.legacyCalendarPlanId);
  const existingOutfitPlanByLegacyId = mapByStringLegacy(existingOutfitPlans, (row) => row.legacyPlanEntryId);
  const existingWearEventByLegacyKey = mapByStringLegacy(existingWearEvents, (row) => row.legacyWearEventKey);
  const existingOutfitItemsByOutfitId = groupBy(existingOutfitItems.filter((row) => !row.deletedAt), (row) => row.outfitId);

  const itemIdToGarmentId = new Map<number, string>();
  const outfitIdToWorkspaceId = new Map<string, string>();
  const tripPlanIdToWorkspaceId = new Map<string, string>();

  const garments = source.items.flatMap((item): PreparedEntity<WorkspaceGarmentRecord>[] => {
    if (typeof item.id !== "number") return [];
    const existing = existingGarmentByLegacyId.get(item.id);
    const record = buildRecord<WorkspaceGarmentRecord>(workspace, originDeviceId, now, existing, {
      id: existing?.id ?? createWorkspaceUuidV7(),
      legacyItemId: item.id,
      locationId: item.locationId,
      name: item.name,
      payload: toCloudGarmentPayload(item),
    });
    itemIdToGarmentId.set(item.id, record.id);
    return [prepared(record, existing, { payload: record.payload })];
  });

  const outfits: PreparedEntity<WorkspaceOutfitRecord>[] = [];
  const outfitItems: PreparedEntity<WorkspaceOutfitItemRecord>[] = [];
  for (const outfit of source.outfits) {
    const existing = existingOutfitByLegacyId.get(outfit.id);
    const workspaceOutfitId = existing?.id ?? createWorkspaceUuidV7();
    outfitIdToWorkspaceId.set(outfit.id, workspaceOutfitId);
    const payload = toCloudOutfitPayload(outfit);
    const outfitRecord = buildRecord<WorkspaceOutfitRecord>(workspace, originDeviceId, now, existing, {
      id: workspaceOutfitId,
      legacyOutfitId: outfit.id,
      name: outfit.name,
      payload,
    });
    outfits.push(prepared(outfitRecord, existing, { payload }));

    const existingItemByGarmentId = new Map((existingOutfitItemsByOutfitId.get(workspaceOutfitId) ?? []).map((item) => [item.garmentId, item]));
    outfit.itemIds.forEach((legacyItemId, sortOrder) => {
      const garmentId = itemIdToGarmentId.get(legacyItemId);
      if (!garmentId) return;
      const existingItem = existingItemByGarmentId.get(garmentId);
      const itemRecord = buildRecord<WorkspaceOutfitItemRecord>(workspace, originDeviceId, now, existingItem, {
        id: existingItem?.id ?? createWorkspaceUuidV7(),
        outfitId: workspaceOutfitId,
        garmentId,
        sortOrder,
      });
      outfitItems.push(prepared(itemRecord, existingItem, {
        outfitId: workspaceOutfitId,
        garmentId,
        sortOrder,
      }));
    });
  }

  const wishlistItems = source.wishlistItems.map((item): PreparedEntity<WorkspaceWishlistItemRecord> => {
    const existing = existingWishlistByLegacyId.get(item.id);
    const payload = toCloudWishlistPayload(item);
    const record = buildRecord<WorkspaceWishlistItemRecord>(workspace, originDeviceId, now, existing, {
      id: existing?.id ?? createWorkspaceUuidV7(),
      legacyWishlistId: item.id,
      status: item.status,
      payload,
    });
    return prepared(record, existing, { payload });
  });

  const checklistByPlanId = groupBy(source.planPackingChecklistItems, (item) => item.calendarPlanId);
  const tripPlans = source.outfitCalendarPlans.map((plan): PreparedEntity<WorkspaceTripPlanRecord> => {
    const existing = existingTripPlanByLegacyId.get(plan.id);
    const payload = toCloudTripPlanPayload(plan, checklistByPlanId.get(plan.id) ?? []);
    const record = buildRecord<WorkspaceTripPlanRecord>(workspace, originDeviceId, now, existing, {
      id: existing?.id ?? createWorkspaceUuidV7(),
      legacyCalendarPlanId: plan.id,
      title: plan.title,
      startDate: plan.startDate,
      endDate: plan.endDate,
      payload,
    });
    tripPlanIdToWorkspaceId.set(plan.id, record.id);
    return prepared(record, existing, { startDate: plan.startDate, endDate: plan.endDate, payload });
  });

  const outfitPlans = source.outfitPlanEntries.map((entry): PreparedEntity<WorkspaceOutfitPlanRecord> => {
    const existing = existingOutfitPlanByLegacyId.get(entry.id);
    const legacyOutfitId = entry.outfitId ?? entry.actualOutfitId;
    const tripPlanId = entry.calendarPlanId ? tripPlanIdToWorkspaceId.get(entry.calendarPlanId) : undefined;
    const outfitId = legacyOutfitId ? outfitIdToWorkspaceId.get(legacyOutfitId) : undefined;
    const payload = toCloudOutfitPlanPayload(entry);
    const record = buildRecord<WorkspaceOutfitPlanRecord>(workspace, originDeviceId, now, existing, {
      id: existing?.id ?? createWorkspaceUuidV7(),
      legacyPlanEntryId: entry.id,
      tripPlanId,
      outfitId,
      date: entry.date,
      payload,
    });
    return prepared(record, existing, { tripPlanId, outfitId, planDate: entry.date, payload });
  });

  const wearEvents = buildWearEvents(source, {
    workspace,
    originDeviceId,
    now,
    existingWearEventByLegacyKey,
    itemIdToGarmentId,
    outfitIdToWorkspaceId,
  });

  return { garments, outfits, outfitItems, wishlistItems, tripPlans, outfitPlans, wearEvents };
}

function buildWearEvents(
  source: LegacyWardrobeSource,
  context: {
    workspace: AccountWorkspaceRecord;
    originDeviceId: string;
    now: string;
    existingWearEventByLegacyKey: Map<string, WorkspaceWearEventRecord>;
    itemIdToGarmentId: Map<number, string>;
    outfitIdToWorkspaceId: Map<string, string>;
  },
): PreparedEntity<WorkspaceWearEventRecord>[] {
  const result: PreparedEntity<WorkspaceWearEventRecord>[] = [];
  const seen = new Set<string>();

  for (const item of source.items) {
    if (typeof item.id !== "number") continue;
    const garmentId = context.itemIdToGarmentId.get(item.id);
    if (!garmentId) continue;
    for (const date of item.wornDates) {
      const key = `garment:${item.id}:${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(buildWearEventEntity(context, key, date, { garmentId }, {
        legacyWearEventKey: key,
        source: "garment",
        legacyItemId: item.id,
        date,
      }));
    }
  }

  for (const outfit of source.outfits) {
    const outfitId = context.outfitIdToWorkspaceId.get(outfit.id);
    if (!outfitId) continue;
    for (const date of outfit.wornDates ?? []) {
      const key = `outfit:${outfit.id}:${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(buildWearEventEntity(context, key, date, { outfitId }, {
        legacyWearEventKey: key,
        source: "outfit",
        legacyOutfitId: outfit.id,
        date,
      }));
    }
  }

  return result;
}

function buildWearEventEntity(
  context: {
    workspace: AccountWorkspaceRecord;
    originDeviceId: string;
    now: string;
    existingWearEventByLegacyKey: Map<string, WorkspaceWearEventRecord>;
  },
  key: string,
  date: string,
  refs: { garmentId?: string; outfitId?: string },
  payload: Record<string, unknown>,
): PreparedEntity<WorkspaceWearEventRecord> {
  const existing = context.existingWearEventByLegacyKey.get(key);
  const wornAt = dateKeyToWornAt(date);
  const record = buildRecord<WorkspaceWearEventRecord>(context.workspace, context.originDeviceId, context.now, existing, {
    id: existing?.id ?? createWorkspaceUuidV7(),
    legacyWearEventKey: key,
    garmentId: refs.garmentId,
    outfitId: refs.outfitId,
    wornAt,
    payload,
  });
  return prepared(record, existing, { ...refs, wornAt, payload });
}

function buildRecord<T extends WorkspaceSyncEntity>(
  workspace: AccountWorkspaceRecord,
  originDeviceId: string,
  now: string,
  existing: T | undefined,
  entity: Omit<T, "userId" | "originDeviceId" | "revision" | "createdAt" | "updatedAt">,
): T {
  return {
    ...entity,
    userId: workspace.userId,
    originDeviceId,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  } as T;
}

function prepared<T extends WorkspaceSyncEntity>(
  record: T,
  existing: T | undefined,
  payload: unknown,
): PreparedEntity<T> {
  return {
    record,
    operation: existing ? "update" : "create",
    baseRevision: existing?.revision ?? 0,
    payload,
  };
}

async function putEntityWithOutbox<T extends WorkspaceSyncEntity>(
  db: AccountWorkspaceDatabase,
  workspace: AccountWorkspaceRecord,
  tableName:
    | "garments"
    | "outfits"
    | "outfitItems"
    | "wishlistItems"
    | "wearEvents"
    | "tripPlans"
    | "outfitPlans",
  entityType: WorkspaceSyncOutboxRecord["entityType"],
  entity: PreparedEntity<T>,
): Promise<void> {
  await db.table(tableName).put(entity.record);
  await db.syncOutbox.add({
    mutationId: createWorkspaceUuidV7(),
    userId: workspace.userId,
    entityType,
    entityId: entity.record.id,
    operation: entity.operation,
    payload: entity.payload,
    baseRevision: entity.baseRevision,
    status: "pending",
    attemptCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function countLegacySource(source: LegacyWardrobeSource): LegacyImportCounts {
  const importableLegacyItemIds = new Set(source.items.map((item) => item.id).filter((id): id is number => typeof id === "number"));
  const outfitItems = source.outfits.reduce(
    (sum, outfit) => sum + outfit.itemIds.filter((itemId) => importableLegacyItemIds.has(itemId)).length,
    0,
  );
  return {
    garments: source.items.length,
    outfits: source.outfits.length,
    outfitItems,
    wishlistItems: source.wishlistItems.length,
    wearEvents: source.items.reduce((sum, item) => sum + item.wornDates.length, 0)
      + source.outfits.reduce((sum, outfit) => sum + (outfit.wornDates?.length ?? 0), 0),
    tripPlans: source.outfitCalendarPlans.length,
    outfitPlans: source.outfitPlanEntries.length,
    packingChecklistItems: source.planPackingChecklistItems.length,
  };
}

function hasLegacyData(counts: LegacyImportCounts): boolean {
  return counts.garments > 0
    || counts.outfits > 0
    || counts.wishlistItems > 0
    || counts.tripPlans > 0
    || counts.outfitPlans > 0;
}

function fingerprintLegacySource(source: LegacyWardrobeSource, counts: LegacyImportCounts): string {
  const summary = {
    counts,
    items: source.items.map((item) => [item.id, item.updatedAt]).sort(),
    outfits: source.outfits.map((outfit) => [outfit.id, outfit.updatedAt]).sort(),
    wishlistItems: source.wishlistItems.map((item) => [item.id, item.updatedAt]).sort(),
    outfitCalendarPlans: source.outfitCalendarPlans.map((plan) => [plan.id, plan.updatedAt]).sort(),
    outfitPlanEntries: source.outfitPlanEntries.map((entry) => [entry.id, entry.updatedAt]).sort(),
    planPackingChecklistItems: source.planPackingChecklistItems.map((item) => [item.id, item.updatedAt]).sort(),
  };
  return `legacy-dexie-v1-${hashString(JSON.stringify(summary))}`;
}

function legacyMigrationIdForWorkspace(workspace: AccountWorkspaceRecord): string {
  return `legacy-dexie-v1:${workspace.userId}`;
}

function isLegacyImportGuardCurrent(
  workspace: AccountWorkspaceRecord,
  guard: ReturnType<typeof currentWorkspaceGuard>,
): boolean {
  const current = loadWorkspaceRegistry().workspaces[workspace.userId];
  if (current) return isWorkspaceResponseCurrent(current, guard);
  return typeof window === "undefined";
}

function mapByNumberLegacy<T>(rows: T[], getKey: (row: T) => number | undefined): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) {
    const key = getKey(row);
    if (typeof key === "number" && !(row as Partial<WorkspaceSyncEntity>).deletedAt) map.set(key, row);
  }
  return map;
}

function mapByStringLegacy<T>(rows: T[], getKey: (row: T) => string | undefined): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = getKey(row);
    if (key && !(row as Partial<WorkspaceSyncEntity>).deletedAt) map.set(key, row);
  }
  return map;
}

function groupBy<T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function dateKeyToWornAt(dateKey: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? `${dateKey}T00:00:00.000Z` : dateKey;
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
