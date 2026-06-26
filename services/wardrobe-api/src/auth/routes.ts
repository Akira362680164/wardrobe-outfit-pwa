import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthApiError, RegistrationService } from "./registrations.js";
import { type SessionService } from "./session.js";

const RegisterBodySchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(8).max(256),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
});

const RegistrationParamsSchema = z.object({
  registrationId: z.string().uuid(),
});

const RegistrationSecretBodySchema = z.object({
  clientSecret: z.string().min(16),
});

export function registerAuthRoutes(
  app: FastifyInstance,
  registrationService = new RegistrationService(),
  sessionService?: SessionService,
) {
  app.post("/api/auth/register", async (request, reply) => {
    try {
      const body = RegisterBodySchema.parse(request.body);
      const result = await registrationService.directRegister({
        phone: body.phone,
        password: body.password,
        rateLimitKey: request.ip,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      if (!sessionService) {
        return reply.code(500).send({ code: "internal_error", message: "Session service unavailable" });
      }
      return await sessionService.completeNewRegistration({
        userId: result.userId,
        maskedPhone: result.maskedPhone,
        deviceId: body.deviceId,
        deviceLabel: body.deviceLabel,
      });
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/api/auth/registrations/:registrationId/cancel", async (request, reply) => {
    try {
      rejectClientSecretInQuery(request);
      const params = RegistrationParamsSchema.parse(request.params);
      const body = RegistrationSecretBodySchema.parse(request.body);
      await registrationService.cancelRegistration({
        registrationId: params.registrationId,
        clientSecret: body.clientSecret,
      });
      return { status: "cancelled" as const };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });
}

function rejectClientSecretInQuery(request: FastifyRequest) {
  const query = request.query;
  if (query && typeof query === "object" && "clientSecret" in query) {
    throw new AuthApiError(400, "client_secret_not_allowed_in_query", "clientSecret must be sent in the request body");
  }
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthApiError) {
    const body: Record<string, unknown> = {
      code: error.code,
      message: error.message,
    };
    if (error.retryAfterSeconds !== undefined) {
      body.retryAfterSeconds = error.retryAfterSeconds;
    }
    return reply.code(error.statusCode).send(body);
  }

  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      code: "invalid_request",
      message: "Invalid request",
    });
  }

  throw error;
}
