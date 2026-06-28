import { z } from "zod";

export const SyncEntityTypeSchema = z.enum([
  "garment",
  "outfit",
  "outfitItem",
  "wishlistItem",
  "wearEvent",
  "tripPlan",
  "outfitPlan",
  "asset",
  "closetLocation",
  "profile",
]);

export const SyncOperationSchema = z.enum(["create", "update", "delete"]);

export const SyncEntitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullish(),
  originDeviceId: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

// 实体专用字段：Bootstrap 序列化时不丢失 payload 之外的列
export const SyncGarmentSchema = SyncEntitySchema.extend({
  wardrobeId: z.string().uuid().nullish(),
});
export const SyncOutfitItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  outfitId: z.string().uuid(),
  garmentId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullish(),
  originDeviceId: z.string().min(1),
  sortOrder: z.number().int().nullish(),
});
export const SyncWearEventSchema = SyncEntitySchema.extend({
  garmentId: z.string().uuid().nullish(),
  outfitId: z.string().uuid().nullish(),
  wornAt: z.string().datetime(),
});
export const SyncTripPlanSchema = SyncEntitySchema.extend({
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});
export const SyncOutfitPlanSchema = SyncEntitySchema.extend({
  tripPlanId: z.string().uuid().nullish(),
  outfitId: z.string().uuid().nullish(),
  planDate: z.string().nullish(),
});
export const SyncAssetSchema = SyncEntitySchema.extend({
  ownerEntityType: SyncEntityTypeSchema,
  ownerEntityId: z.string().uuid(),
  sha256: z.string().nullish(),
  mimeType: z.string().nullish(),
  sizeBytes: z.number().int().nullish(),
  width: z.number().int().nullish(),
  height: z.number().int().nullish(),
  originalStorageKey: z.string().nullish(),
  thumbnailStorageKey: z.string().nullish(),
  uploadStatus: z.string(),
});

export const SyncEntityBundleSchema = z.object({
  garments: z.array(SyncGarmentSchema),
  outfits: z.array(SyncEntitySchema),
  outfitItems: z.array(SyncOutfitItemSchema),
  wishlistItems: z.array(SyncEntitySchema),
  wearEvents: z.array(SyncWearEventSchema),
  tripPlans: z.array(SyncTripPlanSchema),
  outfitPlans: z.array(SyncOutfitPlanSchema),
  assets: z.array(SyncAssetSchema),
  closetLocations: z.array(SyncEntitySchema),
  profiles: z.array(SyncEntitySchema),
});

export const AssetManifestEntrySchema = z.object({
  assetId: z.string().uuid(),
  ownerEntityType: SyncEntityTypeSchema,
  ownerEntityId: z.string().uuid(),
  sha256: z.string().min(1).optional(),
  thumbnailReady: z.boolean().default(false),
});

export const BootstrapRequestSchema = z.object({
  deviceId: z.string().min(1),
  workspaceSchemaVersion: z.number().int().positive(),
  pageToken: z.string().min(1).optional(),
});

export const BootstrapResponseSchema = z.object({
  serverCursor: z.string().min(1),
  entities: SyncEntityBundleSchema,
  assetManifest: z.array(AssetManifestEntrySchema),
  hasMore: z.boolean(),
  nextPageToken: z.string().min(1).optional(),
});

export const PushMutationSchema = z.object({
  mutationId: z.string().uuid(),
  entityType: SyncEntityTypeSchema,
  entityId: z.string().uuid(),
  operation: SyncOperationSchema,
  baseRevision: z.number().int().nonnegative().optional(),
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  attemptCount: z.number().int().nonnegative(),
});

export const PushRequestSchema = z.object({
  deviceId: z.string().min(1),
  mutations: z.array(PushMutationSchema).max(500),
});

export const PushResultSchema = z.object({
  mutationId: z.string().uuid(),
  entityType: SyncEntityTypeSchema,
  entityId: z.string().uuid(),
  status: z.enum(["accepted", "conflict", "rejected"]),
  serverRevision: z.number().int().nonnegative().optional(),
  errorCode: z.string().min(1).optional(),
});

export const PushResponseSchema = z.object({
  results: z.array(PushResultSchema),
  serverCursor: z.string().min(1).optional(),
});

export const PullRequestSchema = z.object({
  cursor: z.string().min(1).nullable().optional(),
  limit: z.number().int().min(1).max(500).default(500),
});

export const SyncChangeSchema = z.object({
  cursor: z.string().min(1),
  entityType: SyncEntityTypeSchema,
  entityId: z.string().uuid(),
  operation: SyncOperationSchema,
  revision: z.number().int().nonnegative(),
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const PullResponseSchema = z.object({
  changes: z.array(SyncChangeSchema),
  nextCursor: z.string().min(1),
  hasMore: z.boolean(),
});

export const ResolveConflictRequestSchema = z.object({
  conflictId: z.string().uuid(),
  resolution: z.enum(["keep_local", "use_cloud"]),
});

export const ResolveConflictResponseSchema = z.object({
  status: z.literal("ok"),
  mutationId: z.string().uuid().optional(),
});

export type SyncEntityType = z.infer<typeof SyncEntityTypeSchema>;
export type SyncOperation = z.infer<typeof SyncOperationSchema>;
export type SyncEntity = z.infer<typeof SyncEntitySchema>;
export type SyncEntityBundle = z.infer<typeof SyncEntityBundleSchema>;
export type AssetManifestEntry = z.infer<typeof AssetManifestEntrySchema>;
export type BootstrapRequest = z.infer<typeof BootstrapRequestSchema>;
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
export type PushMutation = z.infer<typeof PushMutationSchema>;
export type PushRequest = z.infer<typeof PushRequestSchema>;
export type PushResult = z.infer<typeof PushResultSchema>;
export type PushResponse = z.infer<typeof PushResponseSchema>;
export type PullRequest = z.infer<typeof PullRequestSchema>;
export type SyncChange = z.infer<typeof SyncChangeSchema>;
export type PullResponse = z.infer<typeof PullResponseSchema>;
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>;
export type ResolveConflictResponse = z.infer<typeof ResolveConflictResponseSchema>;
