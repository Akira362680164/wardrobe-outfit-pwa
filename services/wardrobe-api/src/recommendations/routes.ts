import type { FastifyInstance } from "fastify";
import { RecommendationReadQuerySchema } from "@wardrobe/cloud-contracts";
import { SessionService } from "../auth/session.js";
import { sendWorkspaceError, WorkspaceApiError } from "../workspace/errors.js";
import { RecommendationReadError, RecommendationReadService } from "./read-service.js";

export function registerRecommendationRoutes(app: FastifyInstance, sessionService: SessionService, service: RecommendationReadService) {
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
}
