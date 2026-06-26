// src/lib/cloud-sync/index.ts
// v1.1.37 cloud 1B B4: 公共导出

export {
  type WorkspaceGuardSnapshot,
  type EnqueueOutboxInput,
  type WriteContext,
  type WorkspaceOutfitWriteOperation,
  type WorkspaceOutfitWriteRecord,
  type WorkspaceOutfitItemWriteRecord,
  type ApplyRemoteOptions,
  type SyncRunInput,
  type SyncRunResult,
  currentWorkspaceGuard,
  isGuardCurrent,
  enqueueOutboxMutation,
  listPendingOutbox,
  markOutboxApplied,
  markOutboxConflict,
  markOutboxFailed,
  recordConflict,
  getSyncState,
  setPullCursor,
  setLastPullAt,
  setLastPushAt,
  writeGarment,
  deleteGarment,
  writeOutfitBundle,
  deleteOutfitBundle,
  writeWishlistItem,
  deleteWishlistItem,
  applyRemoteChanges,
  applyBootstrap,
  runSyncOnce,
  runBootstrap,
  SYNC_BACKOFF_STEPS_MS,
  computeBackoffMs,
} from "@/lib/cloud-sync/sync-engine";

export {
  CloudSyncApiError,
  requestBootstrap,
  requestPush,
  requestPull,
  requestResolveConflict,
} from "@/lib/cloud-sync/cloud-sync-api";

export { isNetworkOnline, subscribeNetworkChanges } from "@/lib/cloud-sync/connectivity";
