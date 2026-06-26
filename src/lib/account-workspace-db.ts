import Dexie, { type Table } from "dexie";
import type { AccountWorkspaceRecord } from "@/lib/workspace-registry";

export const ACCOUNT_WORKSPACE_DB_SCHEMA_VERSION = 1;

export const ACCOUNT_WORKSPACE_DB_STORES = {
  garments: "id, userId, revision, updatedAt, deletedAt, originDeviceId",
  outfits: "id, userId, revision, updatedAt, deletedAt, originDeviceId",
  outfitItems: "id, userId, outfitId, garmentId, revision, updatedAt, deletedAt",
  wishlistItems: "id, userId, revision, updatedAt, deletedAt, originDeviceId",
  wearEvents: "id, userId, garmentId, outfitId, wornAt, revision, updatedAt, deletedAt",
  tripPlans: "id, userId, startDate, endDate, revision, updatedAt, deletedAt",
  outfitPlans: "id, userId, tripPlanId, outfitId, date, revision, updatedAt, deletedAt",
  assets: "id, userId, ownerEntityType, ownerEntityId, sha256, revision, updatedAt, deletedAt",
  syncOutbox: "mutationId, userId, entityType, entityId, status, createdAt, attemptCount",
  syncState: "id, userId, updatedAt",
  syncConflicts: "id, userId, entityType, entityId, createdAt, resolvedAt",
  migrationState: "migrationId, userId, sourceDatabaseFingerprint, completedAt",
} as const;

export type AccountWorkspaceTableName = keyof typeof ACCOUNT_WORKSPACE_DB_STORES;
export const ACCOUNT_WORKSPACE_TABLE_NAMES = Object.keys(ACCOUNT_WORKSPACE_DB_STORES) as AccountWorkspaceTableName[];

export type WorkspaceEntityType =
  | "garment"
  | "outfit"
  | "outfitItem"
  | "wishlistItem"
  | "wearEvent"
  | "tripPlan"
  | "outfitPlan"
  | "asset";

export interface WorkspaceSyncEntity {
  id: string;
  userId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  originDeviceId: string;
}

export interface WorkspaceGarmentRecord extends WorkspaceSyncEntity {
  legacyItemId?: number;
  locationId?: string;
  name?: string;
  payload?: unknown;
}

export interface WorkspaceOutfitRecord extends WorkspaceSyncEntity {
  legacyOutfitId?: string;
  name?: string;
  payload?: unknown;
}

export interface WorkspaceOutfitItemRecord extends WorkspaceSyncEntity {
  outfitId: string;
  garmentId: string;
  sortOrder?: number;
}

export interface WorkspaceWishlistItemRecord extends WorkspaceSyncEntity {
  legacyWishlistId?: string;
  status?: string;
  payload?: unknown;
}

export interface WorkspaceWearEventRecord extends WorkspaceSyncEntity {
  legacyWearEventKey?: string;
  garmentId?: string;
  outfitId?: string;
  wornAt: string;
  payload?: unknown;
}

export interface WorkspaceTripPlanRecord extends WorkspaceSyncEntity {
  legacyCalendarPlanId?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  payload?: unknown;
}

export interface WorkspaceOutfitPlanRecord extends WorkspaceSyncEntity {
  legacyPlanEntryId?: string;
  tripPlanId?: string;
  outfitId?: string;
  date?: string;
  payload?: unknown;
}

export interface WorkspaceAssetRecord extends WorkspaceSyncEntity {
  ownerEntityType: WorkspaceEntityType;
  ownerEntityId: string;
  localUri?: string;
  sha256?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  payload?: unknown;
}

export interface WorkspaceSyncOutboxRecord {
  mutationId: string;
  userId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload?: unknown;
  baseRevision?: number;
  status: "pending" | "pushing" | "conflict" | "failed" | "applied";
  attemptCount: number;
  lastErrorCode?: string;
  lastErrorAt?: string;
  retryable?: boolean;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSyncStateRecord {
  id: string;
  userId: string;
  pullCursor?: string;
  lastPushAt?: string;
  lastPullAt?: string;
  updatedAt: string;
}

export interface WorkspaceSyncConflictRecord {
  id: string;
  userId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  localMutationId: string;
  serverRevision?: number;
  createdAt: string;
  resolvedAt?: string;
  payload?: unknown;
}

export interface WorkspaceMigrationStateRecord {
  migrationId: string;
  userId: string;
  sourceDatabaseFingerprint: string;
  targetUserId: string;
  status: "started" | "completed" | "skipped";
  startedAt: string;
  completedAt?: string;
  skippedAt?: string;
}

export class AccountWorkspaceDatabase extends Dexie {
  garments!: Table<WorkspaceGarmentRecord, string>;
  outfits!: Table<WorkspaceOutfitRecord, string>;
  outfitItems!: Table<WorkspaceOutfitItemRecord, string>;
  wishlistItems!: Table<WorkspaceWishlistItemRecord, string>;
  wearEvents!: Table<WorkspaceWearEventRecord, string>;
  tripPlans!: Table<WorkspaceTripPlanRecord, string>;
  outfitPlans!: Table<WorkspaceOutfitPlanRecord, string>;
  assets!: Table<WorkspaceAssetRecord, string>;
  syncOutbox!: Table<WorkspaceSyncOutboxRecord, string>;
  syncState!: Table<WorkspaceSyncStateRecord, string>;
  syncConflicts!: Table<WorkspaceSyncConflictRecord, string>;
  migrationState!: Table<WorkspaceMigrationStateRecord, string>;

  constructor(dbName: string) {
    super(dbName);
    this.version(ACCOUNT_WORKSPACE_DB_SCHEMA_VERSION).stores(ACCOUNT_WORKSPACE_DB_STORES);
  }
}

const workspaceDbCache = new Map<string, AccountWorkspaceDatabase>();

export function createAccountWorkspaceDb(dbName: string): AccountWorkspaceDatabase {
  assertIndexedDbAvailable();
  return new AccountWorkspaceDatabase(dbName);
}

export function getAccountWorkspaceDb(workspace: Pick<AccountWorkspaceRecord, "dbName">): AccountWorkspaceDatabase {
  assertIndexedDbAvailable();
  let db = workspaceDbCache.get(workspace.dbName);
  if (!db) {
    db = new AccountWorkspaceDatabase(workspace.dbName);
    workspaceDbCache.set(workspace.dbName, db);
  }
  return db;
}

export function closeAccountWorkspaceDb(dbName: string): void {
  const db = workspaceDbCache.get(dbName);
  if (!db) return;
  db.close();
  workspaceDbCache.delete(dbName);
}

export function closeAllAccountWorkspaceDbs(): void {
  for (const db of workspaceDbCache.values()) db.close();
  workspaceDbCache.clear();
}

export async function runWorkspaceWrite<T>(
  db: AccountWorkspaceDatabase,
  tableNames: AccountWorkspaceTableName[],
  write: (db: AccountWorkspaceDatabase) => Promise<T>,
): Promise<T> {
  const tables = tableNames.map((name) => db.table(name));
  return db.transaction("rw", tables, () => write(db));
}

export function createWorkspaceUuidV7(at = new Date()): string {
  const timeHex = Math.max(0, at.getTime()).toString(16).padStart(12, "0").slice(-12);
  const random = randomHex(20);
  const variant = ((Number.parseInt(random.slice(3, 5), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return [
    timeHex.slice(0, 8),
    timeHex.slice(8, 12),
    `7${random.slice(0, 3)}`,
    `${variant}${random.slice(5, 7)}`,
    random.slice(7, 19),
  ].join("-");
}

function assertIndexedDbAvailable(): void {
  if (typeof indexedDB === "undefined") {
    throw new Error("当前环境不支持账号本机工作区数据库");
  }
}

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
