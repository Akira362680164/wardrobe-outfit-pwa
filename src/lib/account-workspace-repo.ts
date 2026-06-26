import type {
  AccountWorkspaceDatabase,
  WorkspaceAssetRecord,
  WorkspaceGarmentRecord,
  WorkspaceMigrationStateRecord,
  WorkspaceOutfitItemRecord,
  WorkspaceOutfitPlanRecord,
  WorkspaceOutfitRecord,
  WorkspaceSyncConflictRecord,
  WorkspaceSyncOutboxRecord,
  WorkspaceSyncStateRecord,
  WorkspaceTripPlanRecord,
  WorkspaceWearEventRecord,
  WorkspaceWishlistItemRecord,
} from "@/lib/account-workspace-db";

export interface AccountWorkspaceSnapshot {
  garments: WorkspaceGarmentRecord[];
  outfits: WorkspaceOutfitRecord[];
  outfitItems: WorkspaceOutfitItemRecord[];
  wishlistItems: WorkspaceWishlistItemRecord[];
  wearEvents: WorkspaceWearEventRecord[];
  tripPlans: WorkspaceTripPlanRecord[];
  outfitPlans: WorkspaceOutfitPlanRecord[];
  assets: WorkspaceAssetRecord[];
  syncOutbox: WorkspaceSyncOutboxRecord[];
  syncState: WorkspaceSyncStateRecord[];
  syncConflicts: WorkspaceSyncConflictRecord[];
  migrationState: WorkspaceMigrationStateRecord[];
}

export async function getAccountWorkspaceSnapshot(db: AccountWorkspaceDatabase): Promise<AccountWorkspaceSnapshot> {
  const [
    garments,
    outfits,
    outfitItems,
    wishlistItems,
    wearEvents,
    tripPlans,
    outfitPlans,
    assets,
    syncOutbox,
    syncState,
    syncConflicts,
    migrationState,
  ] = await Promise.all([
    getWorkspaceGarments(db),
    getWorkspaceOutfits(db),
    getWorkspaceOutfitItems(db),
    getWorkspaceWishlistItems(db),
    getWorkspaceWearEvents(db),
    getWorkspaceTripPlans(db),
    getWorkspaceOutfitPlans(db),
    getWorkspaceAssets(db),
    getWorkspaceSyncOutbox(db),
    getWorkspaceSyncState(db),
    getWorkspaceSyncConflicts(db),
    getWorkspaceMigrationState(db),
  ]);
  return { garments, outfits, outfitItems, wishlistItems, wearEvents, tripPlans, outfitPlans, assets, syncOutbox, syncState, syncConflicts, migrationState };
}

export function getWorkspaceGarments(db: AccountWorkspaceDatabase): Promise<WorkspaceGarmentRecord[]> {
  return db.garments.toArray();
}

export function getWorkspaceOutfits(db: AccountWorkspaceDatabase): Promise<WorkspaceOutfitRecord[]> {
  return db.outfits.toArray();
}

export function getWorkspaceOutfitItems(db: AccountWorkspaceDatabase): Promise<WorkspaceOutfitItemRecord[]> {
  return db.outfitItems.toArray();
}

export function getWorkspaceWishlistItems(db: AccountWorkspaceDatabase): Promise<WorkspaceWishlistItemRecord[]> {
  return db.wishlistItems.toArray();
}

export function getWorkspaceWearEvents(db: AccountWorkspaceDatabase): Promise<WorkspaceWearEventRecord[]> {
  return db.wearEvents.toArray();
}

export function getWorkspaceTripPlans(db: AccountWorkspaceDatabase): Promise<WorkspaceTripPlanRecord[]> {
  return db.tripPlans.toArray();
}

export function getWorkspaceOutfitPlans(db: AccountWorkspaceDatabase): Promise<WorkspaceOutfitPlanRecord[]> {
  return db.outfitPlans.toArray();
}

export function getWorkspaceAssets(db: AccountWorkspaceDatabase): Promise<WorkspaceAssetRecord[]> {
  return db.assets.toArray();
}

export function getWorkspaceSyncOutbox(db: AccountWorkspaceDatabase): Promise<WorkspaceSyncOutboxRecord[]> {
  return db.syncOutbox.toArray();
}

export function getWorkspaceSyncState(db: AccountWorkspaceDatabase): Promise<WorkspaceSyncStateRecord[]> {
  return db.syncState.toArray();
}

export function getWorkspaceSyncConflicts(db: AccountWorkspaceDatabase): Promise<WorkspaceSyncConflictRecord[]> {
  return db.syncConflicts.toArray();
}

export function getWorkspaceMigrationState(db: AccountWorkspaceDatabase): Promise<WorkspaceMigrationStateRecord[]> {
  return db.migrationState.toArray();
}

export const accountWorkspaceRepo = {
  getAccountWorkspaceSnapshot,
  getWorkspaceGarments,
  getWorkspaceOutfits,
  getWorkspaceOutfitItems,
  getWorkspaceWishlistItems,
  getWorkspaceWearEvents,
  getWorkspaceTripPlans,
  getWorkspaceOutfitPlans,
  getWorkspaceAssets,
  getWorkspaceSyncOutbox,
  getWorkspaceSyncState,
  getWorkspaceSyncConflicts,
  getWorkspaceMigrationState,
};
