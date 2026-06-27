import { z } from "zod";

import { SyncEntityTypeSchema } from "../sync/contracts.js";

const MAX_ASSET_BYTES = 15 * 1024 * 1024;
const HeaderPositiveIntegerSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() !== "" ? Number(value) : value,
  z.number().int().positive(),
);

export const AssetVariantSchema = z.enum(["original", "thumbnail"]);

export const AssetUploadParamsSchema = z.object({
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
});

export const AssetUploadHeadersSchema = z.object({
  "content-type": z.string().regex(/^image\/[a-z0-9.+-]+$/),
  "x-asset-owner-entity-type": SyncEntityTypeSchema.exclude(["asset"]),
  "x-asset-owner-entity-id": z.string().uuid(),
  "x-asset-sha256": z.string().regex(/^[a-f0-9]{64}$/),
  "x-asset-size-bytes": HeaderPositiveIntegerSchema.pipe(z.number().max(MAX_ASSET_BYTES)),
  "x-asset-width": HeaderPositiveIntegerSchema.optional(),
  "x-asset-height": HeaderPositiveIntegerSchema.optional(),
});

export const AssetUploadResponseSchema = z.object({
  status: z.literal("ok"),
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
  uploadStatus: z.literal("uploaded"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  updatedAt: z.string().datetime(),
});

export const AssetDownloadParamsSchema = AssetUploadParamsSchema;

export const AssetDeleteParamsSchema = z.object({
  assetId: z.string().uuid(),
});

export const AssetDeleteResponseSchema = z.object({
  status: z.literal("ok"),
  assetId: z.string().uuid(),
  deletedAt: z.string().datetime(),
});

export const AssetManifestRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(200),
});

const AssetImageMetadataSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const AssetManifestItemSchema = z.object({
  assetId: z.string().uuid(),
  ownerEntityType: SyncEntityTypeSchema,
  ownerEntityId: z.string().uuid(),
  uploadStatus: z.enum(["uploading", "uploaded", "failed"]),
  original: AssetImageMetadataSchema.optional(),
  thumbnail: AssetImageMetadataSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AssetManifestResponseSchema = z.object({
  items: z.array(AssetManifestItemSchema),
  nextCursor: z.string().optional(),
});

export type AssetVariant = z.infer<typeof AssetVariantSchema>;
export type AssetUploadParams = z.infer<typeof AssetUploadParamsSchema>;
export type AssetUploadHeaders = z.infer<typeof AssetUploadHeadersSchema>;
export type AssetUploadResponse = z.infer<typeof AssetUploadResponseSchema>;
export type AssetDownloadParams = z.infer<typeof AssetDownloadParamsSchema>;
export type AssetDeleteParams = z.infer<typeof AssetDeleteParamsSchema>;
export type AssetDeleteResponse = z.infer<typeof AssetDeleteResponseSchema>;
export type AssetManifestRequest = z.infer<typeof AssetManifestRequestSchema>;
export type AssetManifestItem = z.infer<typeof AssetManifestItemSchema>;
export type AssetManifestResponse = z.infer<typeof AssetManifestResponseSchema>;
