// services/wardrobe-api/src/sync/routes.ts
// v1.1.37 cloud 1B B4: 4 个 sync 路由注册
// 复用 SessionService.authenticate() 验证 JWT；
// service 抛 SyncApiError 统一 catch 转 4xx/5xx JSON 响应。

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { SessionService } from "../auth/session.js";
import {
  BootstrapRequestSchema,
  PullRequestSchema,
  PushRequestSchema,
  ResolveConflictRequestSchema,
} from "@wardrobe/cloud-contracts";

import { SyncApiError, SyncService } from "./service.js";

export function registerSyncRoutes(
  app: FastifyInstance,
  syncService: SyncService,
  sessionService: SessionService,
) {
  app.post("/api/sync/bootstrap", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = BootstrapRequestSchema.parse(request.body);
      return await syncService.bootstrap({ ...body, userId: claims.userId });
    } catch (error) {
      return sendSyncError(reply, error);
    }
  });

  app.post("/api/sync/push", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = PushRequestSchema.parse(request.body);
      return await syncService.push({ ...body, userId: claims.userId, deviceId: claims.deviceId });
    } catch (error) {
      return sendSyncError(reply, error);
    }
  });

  app.post("/api/sync/pull", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = PullRequestSchema.parse(request.body);
      return await syncService.pull({ ...body, userId: claims.userId });
    } catch (error) {
      return sendSyncError(reply, error);
    }
  });

  app.post("/api/sync/resolve-conflict", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = ResolveConflictRequestSchema.parse(request.body);
      return await syncService.resolveConflict({ ...body, userId: claims.userId });
    } catch (error) {
      return sendSyncError(reply, error);
    }
  });
}

function sendSyncError(reply: FastifyReply, error: unknown) {
  if (error instanceof SyncApiError) {
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
      message: "Invalid sync request",
    });
  }

  // JWT 验证失败已被 SessionService 抛 AuthApiError，会被 ZodError 之前 catch
  if (error instanceof Error && error.message.includes("Authentication")) {
    return reply.code(401).send({
      code: "AUTH_REQUIRED",
      message: "Authentication required",
    });
  }

  throw error;
}
