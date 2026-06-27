import { createHmac } from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  DiagnosticUploadAuthorizeRequest,
  DiagnosticUploadAuthorizeResponse,
  DiagnosticUploadCompleteRequest,
  DiagnosticUploadCompleteResponse,
  DiagnosticCaseMetadata,
  DiagnosticCaseListResponse,
  DiagnosticDownloadUrlResponse,
  DiagnosticCaseRequestTracesResponse,
} from "@wardrobe/cloud-contracts";
import {
  DiagnosticUploadAuthorizeResponseSchema,
  DiagnosticUploadCompleteResponseSchema,
  DiagnosticCaseMetadataSchema,
  DiagnosticCaseListResponseSchema,
  DiagnosticDownloadUrlResponseSchema,
  DiagnosticCaseRequestTracesResponseSchema,
} from "@wardrobe/cloud-contracts";

import { getDb } from "../db/client.js";
import {
  diagnosticCases,
  diagnosticAccessAudits,
  apiRequestTraces,
  diagnosticCaseRequestTraces,
} from "../db/schema.js";
import type * as schema from "../db/schema.js";
import {
  createCosPutObjectPresignedUrl,
  createCosGetObjectPresignedUrl,
  verifyCosObject,
  loadCosConfig,
  type CosConfig,
} from "../storage/cos.js";
import { generateCaseId } from "./case-id.js";

export class DiagnosticApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class DiagnosticService {
  constructor(
    private readonly db?: NodePgDatabase<typeof schema>,
    private readonly cosConfig: CosConfig | null = loadCosConfig(),
  ) {}

  async authorizeUpload(
    input: DiagnosticUploadAuthorizeRequest & { userId: string; deviceId: string },
  ): Promise<DiagnosticUploadAuthorizeResponse> {
    if (!this.cosConfig) {
      throw new DiagnosticApiError(503, "cos_not_configured", "Diagnostic storage is not configured");
    }

    // 幂等检查
    const database = this.database();
    const existing = await database
      .select()
      .from(diagnosticCases)
      .where(
        and(
          eq(diagnosticCases.userId, input.userId),
          eq(diagnosticCases.clientRequestId, input.clientRequestId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      // 已存在，返回原工单及新上传地址
      const now = new Date();
      const objectKey = existing[0].objectKey;
      const expiresAt = new Date(now.getTime() + this.cosConfig.expiresSeconds * 1000).toISOString();
      const uploadUrl = createCosPutObjectPresignedUrl({ config: this.cosConfig, objectKey, now });

      return DiagnosticUploadAuthorizeResponseSchema.parse({
        caseId: existing[0].caseId,
        status: existing[0].status,
        method: "PUT",
        uploadUrl,
        headers: { "Content-Type": "application/json" },
        expiresAt,
      });
    }

    const caseId = generateCaseId();
    const now = new Date();
    const deviceHash = hashDeviceId(input.deviceId, this.cosConfig.secretKey);
    const objectKey = `diagnostics/users/${input.userId}/devices/${deviceHash}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${caseId}/diagnostic.json`;
    const expiresAt = new Date(now.getTime() + this.cosConfig.expiresSeconds * 1000).toISOString();
    const uploadUrl = createCosPutObjectPresignedUrl({ config: this.cosConfig, objectKey, now });

    await database.insert(diagnosticCases).values({
      caseId,
      clientRequestId: input.clientRequestId,
      userId: input.userId,
      deviceId: input.deviceId,
      appVersion: input.appVersion,
      versionCode: input.versionCode,
      clientGitCommit: input.clientGitCommit,
      buildTime: new Date(input.buildTime),
      buildChannel: input.buildChannel,
      schemaVersion: input.schemaVersion,
      problemDescription: input.problemDescription,
      objectKey,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      eventCount: input.eventCount,
      itemCount: input.itemCount,
      outfitCount: input.outfitCount,
      wishlistCount: input.wishlistCount,
      status: "pending_upload",
      uploadAuthorizedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 关联请求轨迹
    if (input.recentRequestIds.length > 0) {
      await this.linkRequestTraces(caseId, input.userId, input.deviceId, input.recentRequestIds);
    }

    return DiagnosticUploadAuthorizeResponseSchema.parse({
      caseId,
      status: "pending_upload",
      method: "PUT",
      uploadUrl,
      headers: { "Content-Type": "application/json" },
      expiresAt,
    });
  }

  async completeUpload(
    caseId: string,
    input: DiagnosticUploadCompleteRequest & { userId: string; deviceId: string },
  ): Promise<DiagnosticUploadCompleteResponse> {
    const database = this.database();
    const [row] = await database
      .select()
      .from(diagnosticCases)
      .where(eq(diagnosticCases.caseId, caseId))
      .limit(1);

    if (!row) {
      throw new DiagnosticApiError(404, "case_not_found", "Diagnostic case not found");
    }
    if (row.userId !== input.userId) {
      throw new DiagnosticApiError(403, "case_not_owned", "Case does not belong to current user");
    }
    if (row.deviceId !== input.deviceId) {
      throw new DiagnosticApiError(403, "case_device_mismatch", "Case was authorized for a different device");
    }
    if (row.clientRequestId !== input.clientRequestId) {
      throw new DiagnosticApiError(409, "client_request_id_mismatch", "clientRequestId does not match");
    }
    if (row.status !== "pending_upload") {
      throw new DiagnosticApiError(409, "case_already_uploaded", "Case is not in pending_upload state");
    }

    // COS HEAD 校验
    if (this.cosConfig) {
      await verifyCosObject({
        config: this.cosConfig,
        objectKey: row.objectKey,
        expectedSizeBytes: input.sizeBytes,
        expectedMimeType: "application/json",
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 天

    await database
      .update(diagnosticCases)
      .set({
        status: "uploaded",
        uploadedAt: now,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(diagnosticCases.id, row.id));

    return DiagnosticUploadCompleteResponseSchema.parse({
      caseId,
      status: "uploaded",
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async listCases(userId: string | null, limit = 20): Promise<DiagnosticCaseListResponse> {
    const where = userId
      ? and(
          eq(diagnosticCases.userId, userId),
          eq(diagnosticCases.status, "uploaded"),
          sql`${diagnosticCases.expiresAt} > now()`,
        )
      : and(
          eq(diagnosticCases.status, "uploaded"),
          sql`${diagnosticCases.expiresAt} > now()`,
        );

    const rows = await this.database()
      .select()
      .from(diagnosticCases)
      .where(where)
      .orderBy(desc(diagnosticCases.createdAt))
      .limit(limit);

    const cases = rows.map((r) => this.toCaseMetadata(r));
    return DiagnosticCaseListResponseSchema.parse({ cases });
  }

  async getLatestCase(userId: string | null): Promise<DiagnosticCaseMetadata | null> {
    const where = userId
      ? and(
          eq(diagnosticCases.userId, userId),
          eq(diagnosticCases.status, "uploaded"),
          sql`${diagnosticCases.expiresAt} > now()`,
        )
      : and(
          eq(diagnosticCases.status, "uploaded"),
          sql`${diagnosticCases.expiresAt} > now()`,
        );

    const rows = await this.database()
      .select()
      .from(diagnosticCases)
      .where(where)
      .orderBy(desc(diagnosticCases.createdAt))
      .limit(1);

    if (!rows[0]) return null;
    return DiagnosticCaseMetadataSchema.parse(this.toCaseMetadata(rows[0]));
  }

  async getCaseMetadata(caseId: string): Promise<DiagnosticCaseMetadata | null> {
    const [row] = await this.database()
      .select()
      .from(diagnosticCases)
      .where(eq(diagnosticCases.caseId, caseId))
      .limit(1);

    if (!row) return null;
    return DiagnosticCaseMetadataSchema.parse(this.toCaseMetadata(row));
  }

  async createDownloadUrl(caseId: string): Promise<DiagnosticDownloadUrlResponse> {
    if (!this.cosConfig) {
      throw new DiagnosticApiError(503, "cos_not_configured", "Diagnostic storage is not configured");
    }

    const [row] = await this.database()
      .select()
      .from(diagnosticCases)
      .where(eq(diagnosticCases.caseId, caseId))
      .limit(1);

    if (!row) {
      throw new DiagnosticApiError(404, "case_not_found", "Diagnostic case not found");
    }
    if (row.status !== "uploaded") {
      throw new DiagnosticApiError(409, "case_not_uploaded", "Case has not been uploaded yet");
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 分钟
    const downloadUrl = createCosGetObjectPresignedUrl({
      config: this.cosConfig,
      objectKey: row.objectKey,
      now,
      expiresSeconds: 300,
    });

    return DiagnosticDownloadUrlResponseSchema.parse({
      caseId,
      downloadUrl,
      sha256: row.sha256,
      sizeBytes: row.sizeBytes,
      expiresAt: expiresAt.toISOString(),
    });
  }

  async getCaseRequestTraces(caseId: string): Promise<DiagnosticCaseRequestTracesResponse> {
    const database = this.database();
    const [caseRow] = await database
      .select({ id: diagnosticCases.id })
      .from(diagnosticCases)
      .where(eq(diagnosticCases.caseId, caseId))
      .limit(1);

    if (!caseRow) {
      throw new DiagnosticApiError(404, "case_not_found", "Diagnostic case not found");
    }

    const traces = await database
      .select({
        requestId: apiRequestTraces.requestId,
        occurredAt: apiRequestTraces.occurredAt,
        method: apiRequestTraces.method,
        routeTemplate: apiRequestTraces.routeTemplate,
        statusCode: apiRequestTraces.statusCode,
        durationMs: apiRequestTraces.durationMs,
        userIdHash: apiRequestTraces.userIdHash,
        deviceIdHash: apiRequestTraces.deviceIdHash,
        errorCode: apiRequestTraces.errorCode,
        serverVersion: apiRequestTraces.serverVersion,
        serverGitCommit: apiRequestTraces.serverGitCommit,
      })
      .from(diagnosticCaseRequestTraces)
      .innerJoin(apiRequestTraces, eq(diagnosticCaseRequestTraces.apiRequestTraceId, apiRequestTraces.id))
      .where(eq(diagnosticCaseRequestTraces.diagnosticCaseId, caseRow.id))
      .orderBy(desc(apiRequestTraces.occurredAt));

    return DiagnosticCaseRequestTracesResponseSchema.parse({
      caseId,
      traces: traces.map((t) => ({
        ...t,
        occurredAt: t.occurredAt.toISOString(),
      })),
    });
  }

  async recordAccessAudit(caseId: string, actorType: string, actorId: string, action: string, ipHash?: string, userAgentHash?: string): Promise<void> {
    await this.database().insert(diagnosticAccessAudits).values({
      caseId,
      actorType,
      actorId,
      action,
      ipHash: ipHash ?? null,
      userAgentHash: userAgentHash ?? null,
    });
  }

  private async linkRequestTraces(caseId: string, userId: string, deviceId: string, requestIds: string[]): Promise<void> {
    const database = this.database();
    const [caseRow] = await database
      .select({ id: diagnosticCases.id })
      .from(diagnosticCases)
      .where(eq(diagnosticCases.caseId, caseId))
      .limit(1);

    if (!caseRow) return;

    const deviceHash = hashDeviceId(deviceId, this.cosConfig?.secretKey ?? "");
    const userHash = hashUserId(userId, this.cosConfig?.secretKey ?? "");

    for (const requestId of requestIds.slice(0, 200)) {
      const traces = await database
        .select({ id: apiRequestTraces.id })
        .from(apiRequestTraces)
        .where(
          and(
            eq(apiRequestTraces.requestId, requestId),
            gte(apiRequestTraces.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          ),
        )
        .limit(1);

      if (traces[0]) {
        // 只关联同一用户和设备的轨迹
        await database
          .insert(diagnosticCaseRequestTraces)
          .values({
            diagnosticCaseId: caseRow.id,
            apiRequestTraceId: traces[0].id,
            linkedAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }
  }

  private toCaseMetadata(row: typeof diagnosticCases.$inferSelect): DiagnosticCaseMetadata {
    return {
      caseId: row.caseId,
      status: row.status,
      appVersion: row.appVersion,
      versionCode: row.versionCode,
      clientGitCommit: row.clientGitCommit,
      buildTime: row.buildTime.toISOString(),
      buildChannel: row.buildChannel,
      problemDescription: row.problemDescription,
      sha256: row.sha256,
      sizeBytes: row.sizeBytes,
      eventCount: row.eventCount,
      itemCount: row.itemCount,
      outfitCount: row.outfitCount,
      wishlistCount: row.wishlistCount,
      uploadedAt: row.uploadedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private database(): NodePgDatabase<typeof schema> {
    return this.db ?? getDb();
  }
}

function hashDeviceId(deviceId: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(deviceId).digest("hex").slice(0, 16);
}

function hashUserId(userId: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(userId).digest("hex");
}
