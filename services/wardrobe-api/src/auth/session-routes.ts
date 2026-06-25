import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AuthApiError } from "./registrations.js";
import { SessionService } from "./session.js";

const LoginBodySchema = z.object({
  phone: z.string().min(1),
  password: z.string().min(8).max(256),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
});

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(16),
  refreshRequestId: z.string().uuid(),
  deviceId: z.string().min(1).max(200),
});

const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(8).max(256),
});

export function registerSessionRoutes(app: FastifyInstance, sessionService = new SessionService()) {
  app.post("/api/auth/login", async (request, reply) => {
    try {
      const body = LoginBodySchema.parse(request.body);
      return await sessionService.login({
        phone: body.phone,
        password: body.password,
        deviceId: body.deviceId,
        deviceLabel: body.deviceLabel,
        rateLimitKey: request.ip,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    try {
      const body = RefreshBodySchema.parse(request.body);
      return await sessionService.refresh({
        refreshToken: body.refreshToken,
        refreshRequestId: body.refreshRequestId,
        deviceId: body.deviceId,
        rateLimitKey: request.ip,
      });
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.post("/api/auth/logout", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await sessionService.logout(claims);
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.post("/api/auth/logout-all", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await sessionService.logoutAll(claims);
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.post("/api/auth/change-password", async (request, reply) => {
    try {
      const body = ChangePasswordBodySchema.parse(request.body);
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await sessionService.changePassword(claims, body.currentPassword, body.newPassword);
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.get("/api/account/me", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await sessionService.me(claims);
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });
}

export function sendSessionError(reply: FastifyReply, error: unknown) {
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
