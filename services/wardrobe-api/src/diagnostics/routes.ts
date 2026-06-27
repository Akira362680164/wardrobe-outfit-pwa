import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DiagnosticUploadAuthorizeRequestSchema,
  DiagnosticUploadCompleteRequestSchema,
} from "@wardrobe/cloud-contracts";

import type { SessionService } from "../auth/session.js";
import { DiagnosticService, DiagnosticApiError } from "./service.js";
import { loadReaderAuthConfig, verifyReaderToken } from "./reader-auth.js";

export function registerDiagnosticRoutes(app: FastifyInstance, sessionService: SessionService, diagnosticService?: DiagnosticService): void {
  const service = diagnosticService ?? new DiagnosticService();

  app.post("/api/diagnostics/cases/authorize", async (request, reply) => {
    const claims = await sessionService.authenticate(request.headers.authorization);
    const deviceId = request.headers["x-wardrobe-device-id"] as string | undefined;
    if (!deviceId) {
      return reply.code(400).send({ code: "device_id_required", message: "X-Wardrobe-Device-Id header is required" });
    }

    const body = DiagnosticUploadAuthorizeRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ code: "invalid_request", message: "Request body validation failed" });
    }

    try {
      const result = await service.authorizeUpload({
        ...body.data,
        userId: claims.userId,
        deviceId,
      });
      return result;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/authorize] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });

  app.post("/api/diagnostics/cases/:caseId/complete", async (request, reply) => {
    const claims = await sessionService.authenticate(request.headers.authorization);
    const deviceId = request.headers["x-wardrobe-device-id"] as string | undefined;
    if (!deviceId) {
      return reply.code(400).send({ code: "device_id_required", message: "X-Wardrobe-Device-Id header is required" });
    }

    const { caseId } = request.params as { caseId: string };
    const body = DiagnosticUploadCompleteRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ code: "invalid_request", message: "Request body validation failed" });
    }

    try {
      const result = await service.completeUpload(caseId, {
        ...body.data,
        userId: claims.userId,
        deviceId,
      });
      return result;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/complete] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });
}

export function registerDiagnosticAdminRoutes(app: FastifyInstance, diagnosticService?: DiagnosticService): void {
  const service = diagnosticService ?? new DiagnosticService();
  const readerConfig = loadReaderAuthConfig();

  async function verifyReader(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = request.headers.authorization;
    const actor = request.headers["x-diagnostic-actor"] as string | undefined;

    if (!readerConfig) {
      return reply.code(503).send({ code: "reader_auth_not_configured", message: "Diagnostic reader auth is not configured" });
    }

    const token = auth?.replace(/^Bearer\s+/i, "");
    if (!token || !verifyReaderToken(token, readerConfig.tokenHash)) {
      return reply.code(401).send({ code: "reader_auth_failed", message: "Invalid reader token" });
    }

    if (!actor) {
      return reply.code(400).send({ code: "actor_required", message: "X-Diagnostic-Actor header is required" });
    }

    (request as any).diagnosticActor = actor;
  }

  app.get("/api/admin/diagnostics/cases", { preHandler: verifyReader }, async (request, reply) => {
    const limit = Math.min(Number((request.query as any).limit ?? 20), 100);
    const actor = (request as any).diagnosticActor as string;

    try {
      const result = await service.listCases(null, limit);
      for (const c of result.cases) {
        await service.recordAccessAudit(c.caseId, "reader", actor, "list");
      }
      return result;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/admin/list] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });

  app.get("/api/admin/diagnostics/cases/latest", { preHandler: verifyReader }, async (request, reply) => {
    const actor = (request as any).diagnosticActor as string;

    try {
      const latest = await service.getLatestCase(null);
      if (!latest) {
        return reply.code(404).send({ code: "no_cases", message: "No uploaded cases found" });
      }
      await service.recordAccessAudit(latest.caseId, "reader", actor, "read_metadata");
      return latest;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/admin/latest] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });

  app.get("/api/admin/diagnostics/cases/:caseId", { preHandler: verifyReader }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const actor = (request as any).diagnosticActor as string;

    try {
      const metadata = await service.getCaseMetadata(caseId);
      if (!metadata) {
        return reply.code(404).send({ code: "case_not_found", message: "Case not found" });
      }
      await service.recordAccessAudit(caseId, "reader", actor, "read_metadata");
      return metadata;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/admin/metadata] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });

  app.post("/api/admin/diagnostics/cases/:caseId/download-url", { preHandler: verifyReader }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const actor = (request as any).diagnosticActor as string;

    try {
      const result = await service.createDownloadUrl(caseId);
      await service.recordAccessAudit(caseId, "reader", actor, "request_download");
      return result;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/admin/download-url] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });

  app.get("/api/admin/diagnostics/cases/:caseId/request-traces", { preHandler: verifyReader }, async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const actor = (request as any).diagnosticActor as string;

    try {
      const result = await service.getCaseRequestTraces(caseId);
      await service.recordAccessAudit(caseId, "reader", actor, "read_metadata");
      return result;
    } catch (err) {
      if (err instanceof DiagnosticApiError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      console.error("[diagnostics/admin/traces] unexpected error:", err);
      return reply.code(500).send({ code: "internal_error", message: "Internal server error" });
    }
  });
}
