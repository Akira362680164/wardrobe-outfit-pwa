import {
  AiEnhancementKindSchema,
  AiEnhancementRequestSchema,
  AiGarmentRecognitionRequestSchema,
  AiOutfitMetadataRequestSchema,
} from "@wardrobe/cloud-contracts";
import type { FastifyInstance } from "fastify";

import type { SessionService } from "../auth/session.js";
import { sendWorkspaceError, WorkspaceApiError } from "../workspace/errors.js";
import { type MiniMaxIntakeServiceLike } from "./minimax-intake-service.js";

const AI_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export function registerAiIntakeRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  aiService: MiniMaxIntakeServiceLike,
) {
  app.post("/api/workspace/ai/intake/garment-recognition", { bodyLimit: AI_BODY_LIMIT_BYTES }, async (request, reply) => handle(reply, async () => {
    await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const body = AiGarmentRecognitionRequestSchema.parse(request.body);
    return aiService.recognizeGarment(body);
  }));

  app.post("/api/workspace/ai/intake/outfit-metadata", { bodyLimit: AI_BODY_LIMIT_BYTES }, async (request, reply) => handle(reply, async () => {
    await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const body = AiOutfitMetadataRequestSchema.parse(request.body);
    return aiService.generateOutfitMetadata(body);
  }));

  app.post("/api/workspace/ai/enhance/:kind", { bodyLimit: AI_BODY_LIMIT_BYTES }, async (request, reply) => handle(reply, async () => {
    await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const params = AiEnhancementKindSchema.parse((request.params as { kind?: unknown }).kind);
    const body = AiEnhancementRequestSchema.parse(request.body);
    return aiService.enhance(params, body);
  }));
}

async function authenticate(authorization: string | undefined, deviceHeader: string | string[] | undefined, sessionService: SessionService) {
  const claims = await sessionService.authenticate(authorization);
  if (typeof deviceHeader !== "string" || !deviceHeader) throw new WorkspaceApiError(400, "invalid_request", "缺少设备标识");
  if (deviceHeader !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
}

async function handle(reply: any, task: () => Promise<unknown>) {
  try { return await task(); } catch (error) { return sendWorkspaceError(reply, error); }
}
