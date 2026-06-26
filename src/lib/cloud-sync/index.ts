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
  writeWearEvent,
  deleteWearEvent,
  writeTripPlan,
  deleteTripPlan,
  writeOutfitPlan,
  deleteOutfitPlan,
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

export {
  requestAssetUploadUrl,
  requestAssetUploadComplete,
} from "@/lib/cloud-sync/cloud-assets-api";

export {
  type AssetOwnerEntityType,
  type LocalAssetUploadStatus,
  type LocalAssetImageMetadata,
  type LocalAssetUploadVariant,
  type LocalAssetPayload,
  type PreparedLocalAsset,
  type PrepareLocalAssetInput,
  type PrepareLocalAssetDependencies,
  prepareLocalAsset,
  putPreparedLocalAsset,
  buildUploadVariant,
  imageDataUrlToBlob,
  parseImageDataUrlMimeType,
  sha256Hex,
} from "@/lib/cloud-sync/asset-metadata";

export {
  type EntityImageAssetInput,
  type CloudAssetReference,
  type CloudAssetReferenceMap,
  type PreparedEntityImageAssets,
  prepareEntityImageAssets,
  putPreparedEntityImageAssets,
  withCloudAssetRefs,
  imageAssetInputsForGarment,
  imageAssetInputsForWishlist,
  imageAssetInputsForOutfit,
} from "@/lib/cloud-sync/asset-bridge";

export {
  type UploadOneResult,
  type UploadCoordinatorDeps,
  uploadPendingAssets,
  schedulePendingUploads,
} from "@/lib/cloud-sync/asset-upload-coordinator";

export { isNetworkOnline, subscribeNetworkChanges } from "@/lib/cloud-sync/connectivity";
