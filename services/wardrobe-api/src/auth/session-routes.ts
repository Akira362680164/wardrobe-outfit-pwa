import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { AccountPasswordAuthService } from "./account-password.js";
import { AuthApiError } from "./registrations.js";
import { SessionService } from "./session.js";

const LoginBodySchema = z.object({
  account: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  password: z.string().min(8).max(256),
  deviceId: z.string().min(1).max(200),
  deviceLabel: z.string().max(200).optional(),
  client: z.enum(["android-app", "pwa", "wechat-miniprogram"]).optional(),
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

const PasswordResetRequestBodySchema = z.object({
  email: z.string().email(),
});

const PasswordResetConfirmBodySchema = z.object({
  email: z.string().email(),
  emailCode: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(256),
});

const ChangePasswordWithEmailCodeBodySchema = z.object({
  emailCode: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(256),
});

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionService = new SessionService(),
  accountPasswordAuthService?: AccountPasswordAuthService,
) {
  app.post("/api/auth/login", async (request, reply) => {
    try {
      const body = LoginBodySchema.parse(request.body);
      if (body.account) {
        if (!accountPasswordAuthService) {
          return reply.code(500).send({ code: "internal_error", message: "Account service unavailable" });
        }
        return await accountPasswordAuthService.login({
          account: body.account,
          password: body.password,
          deviceId: body.deviceId,
          deviceLabel: body.deviceLabel,
          rateLimitKey: request.ip,
          ip: request.ip,
          userAgent: request.headers["user-agent"],
        });
      }
      if (!body.phone) throw new AuthApiError(400, "invalid_request", "phone or account is required");
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

  app.post("/api/auth/password/reset/request", async (request, reply) => {
    try {
      if (!accountPasswordAuthService) {
        return reply.code(500).send({ code: "internal_error", message: "Account service unavailable" });
      }
      const body = PasswordResetRequestBodySchema.parse(request.body);
      return await accountPasswordAuthService.requestPasswordReset({ email: body.email, ip: request.ip });
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.post("/api/auth/password/reset/confirm", async (request, reply) => {
    try {
      if (!accountPasswordAuthService) {
        return reply.code(500).send({ code: "internal_error", message: "Account service unavailable" });
      }
      const body = PasswordResetConfirmBodySchema.parse(request.body);
      return await accountPasswordAuthService.confirmPasswordReset(body);
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

  app.post("/api/auth/password/change", async (request, reply) => {
    try {
      const body = ChangePasswordBodySchema.parse(request.body);
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await sessionService.changePassword(claims, body.currentPassword, body.newPassword);
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.post("/api/auth/password/change-with-email-code", async (request, reply) => {
    try {
      if (!accountPasswordAuthService) {
        return reply.code(500).send({ code: "internal_error", message: "Account service unavailable" });
      }
      const body = ChangePasswordWithEmailCodeBodySchema.parse(request.body);
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await accountPasswordAuthService.changePasswordWithEmailCode(claims, body);
    } catch (error) {
      return sendSessionError(reply, error);
    }
  });

  app.get("/api/auth/account/security", async (request, reply) => {
    try {
      if (!accountPasswordAuthService) {
        return reply.code(500).send({ code: "internal_error", message: "Account service unavailable" });
      }
      const claims = await sessionService.authenticate(request.headers.authorization);
      return await accountPasswordAuthService.getAccountSecurity(claims);
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
