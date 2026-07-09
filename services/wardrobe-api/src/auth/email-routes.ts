import type { FastifyInstance, FastifyReply } from "fastify";
import {
  EmailCodePurposeSchema,
  SendEmailCodeRequestSchema,
  SendEmailCodeResponseSchema,
} from "@wardrobe/cloud-contracts";
import { z } from "zod";

import { AuthApiError } from "./registrations.js";
import { EmailVerificationService, isAuthTestMode } from "./email-verification.js";
import { sendSessionError } from "./session-routes.js";

const TestCodeQuerySchema = z.object({
  email: z.string().email(),
  purpose: EmailCodePurposeSchema,
});

export function registerEmailAuthRoutes(
  app: FastifyInstance,
  emailVerificationService = new EmailVerificationService(),
) {
  app.post("/api/auth/email/send-code", async (request, reply) => {
    try {
      const body = SendEmailCodeRequestSchema.parse(request.body);
      const result = await emailVerificationService.sendCode({
        email: body.email,
        purpose: body.purpose,
        ip: request.ip,
      });
      return SendEmailCodeResponseSchema.parse(result);
    } catch (error) {
      return sendEmailError(reply, error);
    }
  });

  app.get("/api/auth/email/test-code", async (request, reply) => {
    try {
      if (!isAuthTestMode()) {
        throw new AuthApiError(404, "not_found", "Not found");
      }
      const query = TestCodeQuerySchema.parse(request.query);
      const code = emailVerificationService.getDevelopmentCode(query);
      if (!code) throw new AuthApiError(404, "email_code_not_found", "Email code not found");
      return { code };
    } catch (error) {
      return sendEmailError(reply, error);
    }
  });
}

function sendEmailError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthApiError && error.code === "not_found") {
    return reply.code(404).send({ code: error.code, message: error.message });
  }
  return sendSessionError(reply, error);
}
