import { z } from "zod";

import { WorkspaceAssetReferenceSchema } from "./contracts.js";

export const TemporaryAssetVariantSchema = z.enum(["original", "thumbnail"]);

export const TemporaryAssetSlotRequestSchema = z.object({
  fieldName: z.string().min(1),
  variant: TemporaryAssetVariantSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(15 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const TemporaryAssetSessionRequestSchema = z.object({
  clientMutationId: z.string().uuid(),
  entityType: z.enum(["garment", "outfit", "wishlistItem", "profile"]),
  slots: z.array(TemporaryAssetSlotRequestSchema).min(1).max(40),
});

export const TemporaryAssetSlotSchema = TemporaryAssetSlotRequestSchema.extend({
  assetId: z.string().uuid(),
  uploadStatus: z.enum(["pending", "uploaded", "failed"]),
});

export const TemporaryAssetSessionSchema = z.object({
  sessionId: z.string().uuid(),
  clientMutationId: z.string().uuid(),
  assets: z.array(TemporaryAssetSlotSchema),
  expiresAt: z.string().datetime(),
  requestId: z.string().min(1).optional(),
});

export const TemporaryAssetUploadParamsSchema = z.object({
  sessionId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const TemporaryAssetUploadResponseSchema = z.object({
  status: z.literal("uploaded"),
  asset: TemporaryAssetSlotSchema,
  requestId: z.string().min(1).optional(),
});

export const TemporaryAssetSessionStatusSchema = TemporaryAssetSessionSchema.extend({
  ready: z.boolean(),
});

export const TemporaryAssetAbandonResponseSchema = z.object({
  status: z.literal("abandoned"),
  sessionId: z.string().uuid(),
  requestId: z.string().min(1).optional(),
});

export const BoundAssetResponseSchema = z.object({
  fieldName: z.string().min(1),
  reference: WorkspaceAssetReferenceSchema,
});

export type TemporaryAssetVariant = z.infer<typeof TemporaryAssetVariantSchema>;
export type TemporaryAssetSlotRequest = z.infer<typeof TemporaryAssetSlotRequestSchema>;
export type TemporaryAssetSessionRequest = z.infer<typeof TemporaryAssetSessionRequestSchema>;
export type TemporaryAssetSlot = z.infer<typeof TemporaryAssetSlotSchema>;
export type TemporaryAssetSession = z.infer<typeof TemporaryAssetSessionSchema>;
export type TemporaryAssetUploadParams = z.infer<typeof TemporaryAssetUploadParamsSchema>;
export type TemporaryAssetUploadResponse = z.infer<typeof TemporaryAssetUploadResponseSchema>;
export type TemporaryAssetSessionStatus = z.infer<typeof TemporaryAssetSessionStatusSchema>;
export type TemporaryAssetAbandonResponse = z.infer<typeof TemporaryAssetAbandonResponseSchema>;
export type BoundAssetResponse = z.infer<typeof BoundAssetResponseSchema>;
