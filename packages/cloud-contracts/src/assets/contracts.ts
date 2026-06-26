import { z } from "zod";

import { SyncEntityTypeSchema } from "../sync/contracts.js";

export const AssetVariantSchema = z.enum(["original", "thumbnail"]);

export const AssetUploadAuthorizeRequestSchema = z.object({
  assetId: z.string().uuid(),
  ownerEntityType: SyncEntityTypeSchema.exclude(["asset"]),
  ownerEntityId: z.string().uuid(),
  variant: AssetVariantSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const AssetUploadAuthorizeResponseSchema = z.object({
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
  method: z.literal("PUT"),
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresAt: z.string().datetime(),
  headers: z.record(z.string()).default({}),
});

export const AssetUploadCompleteRequestSchema = z.object({
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
  objectKey: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const AssetUploadCompleteResponseSchema = z.object({
  status: z.literal("ok"),
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
  uploadStatus: z.literal("uploaded"),
});

export const AssetDownloadAuthorizeRequestSchema = z.object({
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
});

export const AssetDownloadAuthorizeResponseSchema = z.object({
  assetId: z.string().uuid(),
  variant: AssetVariantSchema,
  method: z.literal("GET"),
  downloadUrl: z.string().url(),
  objectKey: z.string().min(1),
  expiresAt: z.string().datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const AssetManifestRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(200),
});

export const AssetManifestItemSchema = z.object({
  assetId: z.string().uuid(),
  ownerEntityType: SyncEntityTypeSchema,
  ownerEntityId: z.string().uuid(),
  uploadStatus: z.enum(["uploading", "uploaded", "failed"]),
  original: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }).optional(),
  thumbnail: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/),
    sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AssetManifestResponseSchema = z.object({
  items: z.array(AssetManifestItemSchema),
  nextCursor: z.string().optional(),
});

export type AssetVariant = z.infer<typeof AssetVariantSchema>;
export type AssetUploadAuthorizeRequest = z.infer<typeof AssetUploadAuthorizeRequestSchema>;
export type AssetUploadAuthorizeResponse = z.infer<typeof AssetUploadAuthorizeResponseSchema>;
export type AssetUploadCompleteRequest = z.infer<typeof AssetUploadCompleteRequestSchema>;
export type AssetUploadCompleteResponse = z.infer<typeof AssetUploadCompleteResponseSchema>;
export type AssetDownloadAuthorizeRequest = z.infer<typeof AssetDownloadAuthorizeRequestSchema>;
export type AssetDownloadAuthorizeResponse = z.infer<typeof AssetDownloadAuthorizeResponseSchema>;
export type AssetManifestRequest = z.infer<typeof AssetManifestRequestSchema>;
export type AssetManifestItem = z.infer<typeof AssetManifestItemSchema>;
export type AssetManifestResponse = z.infer<typeof AssetManifestResponseSchema>;
