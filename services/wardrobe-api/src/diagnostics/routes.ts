import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  DiagnosticCaseCreateRequestSchema,
  DiagnosticContentHeadersSchema,
} from "@wardrobe/cloud-contracts";

import type { SessionService } from "../auth/session.js";
import { DiagnosticService, DiagnosticApiError } from "./service.js";
import { loadReaderAuthConfig, verifyReaderToken } from "./reader-auth.js";

const MAX_DIAGNOSTIC_BYTES = 10 * 1024 * 1024;

export function registerDiagnosticRoutes(app: FastifyInstance, sessionService: SessionService, service: DiagnosticService): void {
  if (!app.hasContentTypeParser("application/octet-stream")) {
    app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_DIAGNOSTIC_BYTES }, (_request, body, done) => done(null, body));
  }

  app.post("/api/diagnostics/cases", async (request, reply) => {
    try {
      const claims = await authenticateDevice(request, sessionService);
      const body = DiagnosticCaseCreateRequestSchema.parse(request.body);
      return await service.createCase({ ...body, userId: claims.userId, deviceId: claims.deviceId });
    } catch (error) {
      return sendDiagnosticError(reply, error);
    }
  });

  app.put("/api/diagnostics/cases/:caseId/content", { bodyLimit: MAX_DIAGNOSTIC_BYTES }, async (request, reply) => {
    try {
      const claims = await authenticateDevice(request, sessionService);
      const { caseId } = request.params as { caseId: string };
      const headers = DiagnosticContentHeadersSchema.parse(request.headers);
      if (!Buffer.isBuffer(request.body)) throw new DiagnosticApiError(400, "invalid_content", "Diagnostic content must be binary");
      return await service.uploadContent(caseId, { ...headers, bytes: request.body, userId: claims.userId, deviceId: claims.deviceId });
    } catch (error) {
      return sendDiagnosticError(reply, error);
    }
  });
}

export function registerDiagnosticAdminRoutes(app: FastifyInstance, service: DiagnosticService): void {
  const readerConfig = loadReaderAuthConfig();

  async function verifyReader(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const actor = request.headers["x-diagnostic-actor"] as string | undefined;
    if (!readerConfig) return reply.code(503).send({ code: "reader_auth_not_configured", message: "Diagnostic reader auth is not configured" });
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token || !verifyReaderToken(token, readerConfig.tokenHash)) {
      return reply.code(401).send({ code: "reader_auth_failed", message: "Invalid reader token" });
    }
    if (!actor) return reply.code(400).send({ code: "actor_required", message: "X-Diagnostic-Actor header is required" });
    (request as any).diagnosticActor = actor;
  }

  app.get("/api/admin/diagnostics/cases", { preHandler: verifyReader }, async (request, reply) => {
    try {
      const result = await service.listCases(null, Math.min(Number((request.query as any).limit ?? 20), 100));
      const actor = (request as any).diagnosticActor as string;
      for (const item of result.cases) await service.recordAccessAudit(item.caseId, "reader", actor, "list");
      return result;
    } catch (error) { return sendDiagnosticError(reply, error); }
  });

  app.get("/api/admin/diagnostics/cases/latest", { preHandler: verifyReader }, async (request, reply) => {
    try {
      const latest = await service.getLatestCase(null);
      if (!latest) return reply.code(404).send({ code: "no_cases", message: "No uploaded cases found" });
      await service.recordAccessAudit(latest.caseId, "reader", (request as any).diagnosticActor, "read_metadata");
      return latest;
    } catch (error) { return sendDiagnosticError(reply, error); }
  });

  app.get("/api/admin/diagnostics/cases/:caseId", { preHandler: verifyReader }, async (request, reply) => {
    try {
      const { caseId } = request.params as { caseId: string };
      const metadata = await service.getCaseMetadata(caseId);
      if (!metadata) return reply.code(404).send({ code: "case_not_found", message: "Case not found" });
      await service.recordAccessAudit(caseId, "reader", (request as any).diagnosticActor, "read_metadata");
      return metadata;
    } catch (error) { return sendDiagnosticError(reply, error); }
  });

  app.get("/api/admin/diagnostics/cases/:caseId/content", { preHandler: verifyReader }, async (request, reply) => {
    try {
      const { caseId } = request.params as { caseId: string };
      const content = await service.openContent(caseId);
      await service.recordAccessAudit(caseId, "reader", (request as any).diagnosticActor, "read_content");
      return reply.type("application/json").header("Content-Length", content.sizeBytes)
        .header("X-Diagnostic-SHA256", content.sha256).send(content.stream);
    } catch (error) { return sendDiagnosticError(reply, error); }
  });

  app.get("/api/admin/diagnostics/cases/:caseId/request-traces", { preHandler: verifyReader }, async (request, reply) => {
    try {
      const { caseId } = request.params as { caseId: string };
      const result = await service.getCaseRequestTraces(caseId);
      await service.recordAccessAudit(caseId, "reader", (request as any).diagnosticActor, "read_metadata");
      return result;
    } catch (error) { return sendDiagnosticError(reply, error); }
  });
}

async function authenticateDevice(request: FastifyRequest, sessionService: SessionService) {
  const claims = await sessionService.authenticate(request.headers.authorization);
  const deviceId = request.headers["x-wardrobe-device-id"];
  if (typeof deviceId !== "string") throw new DiagnosticApiError(400, "device_id_required", "X-Wardrobe-Device-Id header is required");
  if (deviceId !== claims.deviceId) throw new DiagnosticApiError(403, "device_id_mismatch", "Device does not match the current session");
  return claims;
}

function sendDiagnosticError(reply: FastifyReply, error: unknown) {
  if (error instanceof DiagnosticApiError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  if (typeof error === "object" && error != null && "issues" in error) {
    return reply.code(400).send({ code: "invalid_request", message: "Request validation failed" });
  }
  throw error;
}
