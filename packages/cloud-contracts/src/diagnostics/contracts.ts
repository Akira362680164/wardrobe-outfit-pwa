import { z } from "zod";

export const DiagnosticCaseStatusSchema = z.enum(["pending_upload", "uploaded", "expired"]);

export const DiagnosticCaseCreateRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  schemaVersion: z.literal(1),
  appVersion: z.string().min(1).max(32),
  versionCode: z.number().int().positive(),
  clientGitCommit: z.string().regex(/^[a-f0-9]{40}$/),
  buildTime: z.string().datetime(),
  buildChannel: z.enum(["internal", "release"]),
  problemDescription: z.string().max(1000).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  eventCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  outfitCount: z.number().int().nonnegative(),
  wishlistCount: z.number().int().nonnegative(),
  recentRequestIds: z.array(z.string().uuid()).max(200),
});

export const DiagnosticCaseCreateResponseSchema = z.object({
  caseId: z.string().regex(/^WD-\d{8}-[A-Z0-9]{6}$/),
  status: DiagnosticCaseStatusSchema,
});

export const DiagnosticContentHeadersSchema = z.object({
  "content-type": z.literal("application/octet-stream"),
  "x-diagnostic-client-request-id": z.string().uuid(),
  "x-diagnostic-sha256": z.string().regex(/^[a-f0-9]{64}$/),
  "x-diagnostic-size-bytes": z.preprocess(
    (value) => typeof value === "string" ? Number(value) : value,
    z.number().int().positive().max(10 * 1024 * 1024),
  ),
});

export const DiagnosticContentUploadResponseSchema = z.object({
  caseId: z.string().regex(/^WD-\d{8}-[A-Z0-9]{6}$/),
  status: z.literal("uploaded"),
  uploadedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const DiagnosticCaseMetadataSchema = z.object({
  caseId: z.string().regex(/^WD-\d{8}-[A-Z0-9]{6}$/),
  status: DiagnosticCaseStatusSchema,
  appVersion: z.string(),
  versionCode: z.number().int(),
  clientGitCommit: z.string(),
  buildTime: z.string().datetime(),
  buildChannel: z.string(),
  problemDescription: z.string().nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
  eventCount: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  outfitCount: z.number().int().nonnegative(),
  wishlistCount: z.number().int().nonnegative(),
  uploadedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const DiagnosticCaseListResponseSchema = z.object({
  cases: z.array(DiagnosticCaseMetadataSchema),
});

export const DiagnosticContentMetadataSchema = z.object({
  caseId: z.string().regex(/^WD-\d{8}-[A-Z0-9]{6}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
});

export const ApiRequestTraceSchema = z.object({
  requestId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  method: z.string(),
  routeTemplate: z.string(),
  statusCode: z.number().int(),
  durationMs: z.number().int(),
  userIdHash: z.string().nullable(),
  deviceIdHash: z.string().nullable(),
  errorCode: z.string().nullable(),
  serverVersion: z.string(),
  serverGitCommit: z.string(),
});

export const DiagnosticCaseRequestTracesResponseSchema = z.object({
  caseId: z.string(),
  traces: z.array(ApiRequestTraceSchema),
});

export type DiagnosticCaseStatus = z.infer<typeof DiagnosticCaseStatusSchema>;
export type DiagnosticCaseCreateRequest = z.infer<typeof DiagnosticCaseCreateRequestSchema>;
export type DiagnosticCaseCreateResponse = z.infer<typeof DiagnosticCaseCreateResponseSchema>;
export type DiagnosticContentHeaders = z.infer<typeof DiagnosticContentHeadersSchema>;
export type DiagnosticContentUploadResponse = z.infer<typeof DiagnosticContentUploadResponseSchema>;
export type DiagnosticCaseMetadata = z.infer<typeof DiagnosticCaseMetadataSchema>;
export type DiagnosticCaseListResponse = z.infer<typeof DiagnosticCaseListResponseSchema>;
export type DiagnosticContentMetadata = z.infer<typeof DiagnosticContentMetadataSchema>;
export type ApiRequestTrace = z.infer<typeof ApiRequestTraceSchema>;
export type DiagnosticCaseRequestTracesResponse = z.infer<typeof DiagnosticCaseRequestTracesResponseSchema>;
