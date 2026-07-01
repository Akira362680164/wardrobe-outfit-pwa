import { z } from "zod";

export const WorkspaceEntityKindSchema = z.enum([
  "garment",
  "outfit",
  "wishlistItem",
  "closetLocation",
  "tripPlan",
  "outfitPlan",
  "wearEvent",
  "profile",
]);

export const WorkspaceErrorCodeSchema = z.enum([
  "network",
  "timeout",
  "auth",
  "conflict",
  "server",
  "not_found",
  "image_upload",
  "invalid_request",
  "mutation_in_progress",
]);

export const WorkspaceErrorResponseSchema = z.object({
  code: WorkspaceErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  requestId: z.string().min(1).optional(),
  serverData: z.unknown().optional(),
});

export const WorkspaceAssetReferenceSchema = z.object({
  assetId: z.string().uuid(),
  variants: z.array(z.enum(["original", "thumbnail"])).min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  variantSha256: z.record(z.enum(["original", "thumbnail"]), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
});

export const WorkspaceEntitySchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  payload: z.record(z.unknown()),
  assetRefs: z.record(WorkspaceAssetReferenceSchema).optional(),
});

export const WorkspaceMutationBaseSchema = z.object({
  clientMutationId: z.string().uuid(),
  expectedRevision: z.number().int().positive().optional(),
});

export const WorkspaceAssetMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_or_replace"), fieldName: z.string().min(1), temporaryAssetIds: z.array(z.string().uuid()).min(1) }),
  z.object({ kind: z.literal("update_thumbnail"), fieldName: z.string().min(1), assetId: z.string().uuid(), temporaryAssetId: z.string().uuid() }),
  z.object({ kind: z.literal("reuse"), fieldName: z.string().min(1), assetId: z.string().uuid() }),
  z.object({ kind: z.literal("remove"), fieldName: z.string().min(1) }),
]);

export const WorkspaceCommandResponseSchema = z.object({
  status: z.enum(["committed", "in_progress"]),
  entity: WorkspaceEntitySchema.optional(),
  entities: z.array(WorkspaceEntitySchema).optional(),
  revision: z.number().int().positive().optional(),
  requestId: z.string().min(1).optional(),
});

export const WorkspacePaginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const WorkspaceDateRangeQuerySchema = WorkspacePaginationQuerySchema.extend({
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const WorkspaceListResponseSchema = z.object({
  items: z.array(WorkspaceEntitySchema),
  nextCursor: z.string().min(1).optional(),
  serverRevision: z.number().int().nonnegative(),
  requestId: z.string().min(1).optional(),
});

export const WorkspaceDetailResponseSchema = z.object({
  data: WorkspaceEntitySchema,
  requestId: z.string().min(1).optional(),
});

export const WorkspaceOverviewResponseSchema = z.object({
  garments: z.array(WorkspaceEntitySchema),
  outfits: z.array(WorkspaceEntitySchema),
  wishlistItems: z.array(WorkspaceEntitySchema),
  locations: z.array(WorkspaceEntitySchema),
  tripPlans: z.array(WorkspaceEntitySchema),
  outfitPlans: z.array(WorkspaceEntitySchema),
  wearEvents: z.array(WorkspaceEntitySchema),
  profiles: z.array(WorkspaceEntitySchema),
  serverRevision: z.number().int().nonnegative(),
  requestId: z.string().min(1).optional(),
});

export const WorkspaceWearSummaryResponseSchema = z.object({
  garmentWearCounts: z.record(z.string().uuid(), z.number().int().nonnegative()),
  outfitWearCounts: z.record(z.string().uuid(), z.number().int().nonnegative()),
  recentEvents: z.array(WorkspaceEntitySchema),
  serverRevision: z.number().int().nonnegative(),
  requestId: z.string().min(1).optional(),
});

export const WorkspaceCreateCommandSchema = WorkspaceMutationBaseSchema.extend({
  payload: z.record(z.unknown()),
  assetMutations: z.array(WorkspaceAssetMutationSchema).default([]),
});

export const WorkspaceBatchCreateCommandSchema = z.object({
  items: z.array(WorkspaceCreateCommandSchema).min(1).max(20),
});

export const WorkspaceUpdateCommandSchema = WorkspaceMutationBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
  payload: z.record(z.unknown()),
  assetMutations: z.array(WorkspaceAssetMutationSchema).default([]),
});

export const WorkspaceDeleteCommandSchema = WorkspaceMutationBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
});

export const WorkspaceStateCommandSchema = WorkspaceMutationBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
  value: z.boolean().optional(),
  date: z.string().date().optional(),
  payload: z.record(z.unknown()).default({}),
});

export const WorkspaceWishlistConvertCommandSchema = WorkspaceMutationBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
  locationId: z.string().min(1),
});

export const WorkspacePlanMarkWornCommandSchema = WorkspaceMutationBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
  wornAt: z.string().datetime(),
  outfitId: z.string().uuid().optional(),
});

export const WorkspacePackingChecklistCommandSchema = WorkspaceMutationBaseSchema.extend({
  expectedRevision: z.number().int().positive(),
  items: z.array(z.record(z.unknown())),
});

export type WorkspaceEntityKind = z.infer<typeof WorkspaceEntityKindSchema>;
export type WorkspaceErrorCode = z.infer<typeof WorkspaceErrorCodeSchema>;
export type WorkspaceErrorResponse = z.infer<typeof WorkspaceErrorResponseSchema>;
export type WorkspaceAssetReference = z.infer<typeof WorkspaceAssetReferenceSchema>;
export type WorkspaceEntity = z.infer<typeof WorkspaceEntitySchema>;
export type WorkspaceMutationBase = z.infer<typeof WorkspaceMutationBaseSchema>;
export type WorkspaceAssetMutation = z.infer<typeof WorkspaceAssetMutationSchema>;
export type WorkspaceCommandResponse = z.infer<typeof WorkspaceCommandResponseSchema>;
export type WorkspacePaginationQuery = z.infer<typeof WorkspacePaginationQuerySchema>;
export type WorkspaceDateRangeQuery = z.infer<typeof WorkspaceDateRangeQuerySchema>;
export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;
export type WorkspaceDetailResponse = z.infer<typeof WorkspaceDetailResponseSchema>;
export type WorkspaceOverviewResponse = z.infer<typeof WorkspaceOverviewResponseSchema>;
export type WorkspaceWearSummaryResponse = z.infer<typeof WorkspaceWearSummaryResponseSchema>;
export type WorkspaceCreateCommand = z.infer<typeof WorkspaceCreateCommandSchema>;
export type WorkspaceBatchCreateCommand = z.infer<typeof WorkspaceBatchCreateCommandSchema>;
export type WorkspaceUpdateCommand = z.infer<typeof WorkspaceUpdateCommandSchema>;
export type WorkspaceDeleteCommand = z.infer<typeof WorkspaceDeleteCommandSchema>;
export type WorkspaceStateCommand = z.infer<typeof WorkspaceStateCommandSchema>;
export type WorkspaceWishlistConvertCommand = z.infer<typeof WorkspaceWishlistConvertCommandSchema>;
export type WorkspacePlanMarkWornCommand = z.infer<typeof WorkspacePlanMarkWornCommandSchema>;
export type WorkspacePackingChecklistCommand = z.infer<typeof WorkspacePackingChecklistCommandSchema>;
