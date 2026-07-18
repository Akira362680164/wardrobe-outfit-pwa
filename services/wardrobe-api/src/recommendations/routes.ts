import type { FastifyInstance } from "fastify";
import { AcceptRecommendationCommandSchema, AcceptRecommendationResponseSchema, CancelPrimaryPlanCommandSchema, CancelPrimaryPlanResponseSchema, RecommendationReadQuerySchema, RejectRecommendationCommandSchema, RejectRecommendationResponseSchema, ResolveRecommendationsCommandSchema, ResolveRecommendationsResponseSchema } from "@wardrobe/cloud-contracts";
import { ReassessRecommendationCommandSchema, RecommendationRegenerationRequestSchema } from "@wardrobe/cloud-contracts";
import { SessionService } from "../auth/session.js";
import { sendWorkspaceError, WorkspaceApiError } from "../workspace/errors.js";
import { RecommendationReadError, RecommendationReadService } from "./read-service.js";
import { RecommendationRegenerationConflictError, RecommendationRegenerationService } from "./regeneration-service.js";
import { FixedWindowRateLimiter } from "../auth/rate-limit.js";
import { RecommendationGenerationCoordinator } from "./coordinator.js";
import { readRecommendationFeatureFlags } from "./feature-flags.js";
import { RecommendationAcceptService } from "./accept-service.js";
import { RecommendationPlanCancelService } from "./cancel-service.js";
import { RecommendationActionService } from "./action-service.js";

export function registerRecommendationRoutes(app: FastifyInstance, sessionService: SessionService, service: RecommendationReadService, regeneration = new RecommendationRegenerationService(), coordinator?: RecommendationGenerationCoordinator, acceptService?: RecommendationAcceptService, cancelService?: RecommendationPlanCancelService, actionService?: RecommendationActionService, reassessLimiter = new FixedWindowRateLimiter({ maxAttempts: 30, windowMs: 60 * 60_000 }), forceLimiter = new FixedWindowRateLimiter({ maxAttempts: 12, windowMs: 60 * 60_000 })) {
  app.get("/api/recommendations", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const device = request.headers["x-wardrobe-device-id"];
      if (typeof device !== "string" || device !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      const query = RecommendationReadQuerySchema.parse(request.query);
      return await service.read(claims.userId, query.startDate, query.endDate);
    } catch (error) {
      if (error instanceof RecommendationReadError) return reply.code(error.statusCode).send({ code: error.code, message: "推荐数据不存在", retryable: false });
      return sendWorkspaceError(reply, error);
    }
  });
  app.post("/api/recommendations/daily/:date/accept", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const device = request.headers["x-wardrobe-device-id"];
      if (typeof device !== "string" || device !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      if (!readRecommendationFeatureFlags(process.env).RECOMMENDATION_ACCEPT_ENABLED || !acceptService) return reply.code(404).send({ code: "not_found", message: "接口未启用", retryable: false });
      const date = (request.params as { date?: string }).date ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new WorkspaceApiError(400, "invalid_request", "日期格式无效");
      return AcceptRecommendationResponseSchema.parse(await acceptService.accept(claims.userId, device, date, AcceptRecommendationCommandSchema.parse(request.body)));
    } catch (error) { return sendWorkspaceError(reply, error); }
  });
  app.post("/api/recommendations/plans/cancel-primary", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const device = request.headers["x-wardrobe-device-id"];
      if (typeof device !== "string" || device !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      if (!readRecommendationFeatureFlags(process.env).RECOMMENDATION_ACCEPT_ENABLED || !cancelService) return reply.code(404).send({ code: "not_found", message: "接口未启用", retryable: false });
      return CancelPrimaryPlanResponseSchema.parse(await cancelService.cancel(claims.userId, device, CancelPrimaryPlanCommandSchema.parse(request.body)));
    } catch (error) { return sendWorkspaceError(reply, error); }
  });
  app.post("/api/recommendations/actions/reject", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const device = request.headers["x-wardrobe-device-id"];
      if (typeof device !== "string" || device !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      if (!readRecommendationFeatureFlags(process.env).RECOMMENDATION_ACCEPT_ENABLED || !actionService) return reply.code(404).send({ code: "not_found", message: "接口未启用", retryable: false });
      return RejectRecommendationResponseSchema.parse(await actionService.reject(claims.userId, RejectRecommendationCommandSchema.parse(request.body)));
    } catch (error) { return sendWorkspaceError(reply, error); }
  });
  app.post("/api/recommendations/resolve", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const device = request.headers["x-wardrobe-device-id"];
      if (typeof device !== "string" || device !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      if (!readRecommendationFeatureFlags(process.env).RECOMMENDATION_REALTIME_ENABLED || !coordinator) return reply.code(404).send({ code: "not_found", message: "接口未启用", retryable: false });
      const command = ResolveRecommendationsCommandSchema.parse(request.body);
      if (command.force) {
        const limit = forceLimiter.take(`recommendation-force:${claims.userId}`);
        if (!limit.allowed) return reply.header("Retry-After", String(limit.retryAfterSeconds)).code(429).send({ code: "rate_limited", message: "刷新过于频繁", retryable: true, retryAfterSeconds: limit.retryAfterSeconds });
      }
      return ResolveRecommendationsResponseSchema.parse(await coordinator.resolve(claims.userId, command, "foreground"));
    } catch (error) { return sendWorkspaceError(reply, error); }
  });
  app.post("/api/recommendations/daily/:date/reassess", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const device = request.headers["x-wardrobe-device-id"];
      if (typeof device !== "string" || device !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      const limit = reassessLimiter.take(`recommendation-reassess:${claims.userId}`);
      if (!limit.allowed) return reply.header("Retry-After", String(limit.retryAfterSeconds)).code(429).send({ code: "rate_limited", message: "请求过于频繁", retryable: true, retryAfterSeconds: limit.retryAfterSeconds });
      const date = (request.params as { date?: string }).date;
      assertReassessDate(date ?? "");
      const value = await regeneration.enqueueExplicit(claims.userId, date ?? "", ReassessRecommendationCommandSchema.parse(request.body));
      return RecommendationRegenerationRequestSchema.parse(value);
    } catch (error) {
      if (error instanceof RecommendationRegenerationConflictError) return reply.code(409).send({ code: "conflict", message: error.code, retryable: false });
      return sendWorkspaceError(reply, error);
    }
  });
}

function assertReassessDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new WorkspaceApiError(400, "invalid_request", "日期格式无效");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const last = new Date(`${today}T12:00:00Z`); last.setUTCDate(last.getUTCDate() + 366);
  if (date < today || date > last.toISOString().slice(0, 10)) throw new WorkspaceApiError(422, "invalid_request", "日期超出可重评范围");
}
