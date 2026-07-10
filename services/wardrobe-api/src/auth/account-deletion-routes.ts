import {
  AccountDeletionConfirmRequestSchema,
  AccountDeletionConfirmResponseSchema,
  AccountDeletionStatusResponseSchema,
  AccountDeletionVerifyRequestSchema,
  AccountDeletionVerifyResponseSchema,
  SendEmailCodeResponseSchema,
} from "@wardrobe/cloud-contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import type { AccountDeletionService } from "./account-deletion.js";
import { AuthApiError } from "./registrations.js";
import type { SessionService } from "./session.js";

export function registerAccountDeletionRoutes(app: FastifyInstance, sessionService: SessionService, service: AccountDeletionService) {
  app.post("/api/auth/account-deletion/email/request", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      return SendEmailCodeResponseSchema.parse(await service.requestEmailCode(claims, request.ip));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/auth/account-deletion/verify", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = AccountDeletionVerifyRequestSchema.parse(request.body);
      return AccountDeletionVerifyResponseSchema.parse(await service.verify(claims, body));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/auth/account-deletion/confirm", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = AccountDeletionConfirmRequestSchema.parse(request.body);
      const result = AccountDeletionConfirmResponseSchema.parse(await service.confirm(claims, body));
      if (result.status === "processing") reply.code(202);
      return result;
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/auth/account-deletion/status/:receiptToken", async (request, reply) => {
    try {
      const params = z.object({ receiptToken: z.string().min(32) }).parse(request.params);
      return AccountDeletionStatusResponseSchema.parse(await service.status(params.receiptToken));
    } catch (error) {
      return sendError(reply, error);
    }
  });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthApiError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ code: "invalid_request", message: "Invalid request" });
  }
  throw error;
}
