import {
  AiEnhancementKindSchema,
  AiEnhancementRequestSchema,
  AiGarmentRecognitionBatchRequestSchema,
  AiGarmentRecognitionRequestSchema,
  AiOutfitMetadataRequestSchema,
  MiniMaxRuntimeSettingsSchema,
} from "@wardrobe/cloud-contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { SessionService } from "../auth/session.js";
import { sendWorkspaceError, WorkspaceApiError } from "../workspace/errors.js";
import { type MiniMaxIntakeServiceLike } from "./minimax-intake-service.js";

const AI_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export function registerAiIntakeRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  aiService: MiniMaxIntakeServiceLike,
) {
  app.post(
    "/api/workspace/ai/intake/garment-recognition",
    { bodyLimit: AI_BODY_LIMIT_BYTES },
    async (request, reply) =>
      handle(reply, async () => {
        await authenticate(
          request.headers.authorization,
          request.headers["x-wardrobe-device-id"],
          sessionService,
        );
        const body = AiGarmentRecognitionRequestSchema.parse(request.body);
        return aiService.recognizeGarment(body);
      }),
  );

  app.post(
    "/api/workspace/ai/intake/garment-recognition/batch",
    { bodyLimit: AI_BODY_LIMIT_BYTES },
    async (request, reply) =>
      handle(reply, async () => {
        await authenticate(
          request.headers.authorization,
          request.headers["x-wardrobe-device-id"],
          sessionService,
        );
        const body = AiGarmentRecognitionBatchRequestSchema.parse(request.body);
        return aiService.recognizeGarments(body);
      }),
  );

  app.post(
    "/api/workspace/ai/intake/outfit-metadata",
    { bodyLimit: AI_BODY_LIMIT_BYTES },
    async (request, reply) =>
      handle(reply, async () => {
        await authenticate(
          request.headers.authorization,
          request.headers["x-wardrobe-device-id"],
          sessionService,
        );
        const body = AiOutfitMetadataRequestSchema.parse(request.body);
        return aiService.generateOutfitMetadata(body);
      }),
  );

  app.post(
    "/api/workspace/ai/enhance/:kind",
    { bodyLimit: AI_BODY_LIMIT_BYTES },
    async (request, reply) =>
      handle(reply, async () => {
        await authenticate(
          request.headers.authorization,
          request.headers["x-wardrobe-device-id"],
          sessionService,
        );
        const params = AiEnhancementKindSchema.parse(
          (request.params as { kind?: unknown }).kind,
        );
        const body = AiEnhancementRequestSchema.parse(request.body);
        return aiService.enhance(params, body);
      }),
  );

  app.post(
    "/api/workspace/ai/try-on",
    { bodyLimit: AI_BODY_LIMIT_BYTES },
    async (request, reply) =>
      handle(reply, async () => {
        await authenticate(
          request.headers.authorization,
          request.headers["x-wardrobe-device-id"],
          sessionService,
        );
        const body = z
          .object({
            miniMax: MiniMaxRuntimeSettingsSchema,
            referenceImageDataUrl: z
              .string()
              .startsWith("data:image/")
              .max(6_000_000),
            garmentImageDataUrls: z
              .array(z.string().startsWith("data:image/").max(4_000_000))
              .min(1)
              .max(8),
            prompt: z.string().max(500).optional(),
          })
          .parse(request.body);
        return aiService.generateTryOn(body);
      }),
  );
}

async function authenticate(
  authorization: string | undefined,
  deviceHeader: string | string[] | undefined,
  sessionService: SessionService,
) {
  const claims = await sessionService.authenticate(authorization);
  if (typeof deviceHeader !== "string" || !deviceHeader)
    throw new WorkspaceApiError(400, "invalid_request", "缺少设备标识");
  if (deviceHeader !== claims.deviceId)
    throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
}

async function handle(reply: any, task: () => Promise<unknown>) {
  try {
    return await task();
  } catch (error) {
    return sendWorkspaceError(reply, error);
  }
}
