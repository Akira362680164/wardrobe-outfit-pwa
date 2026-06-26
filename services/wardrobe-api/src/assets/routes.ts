import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  AssetDownloadAuthorizeRequestSchema,
  AssetManifestRequestSchema,
  AssetUploadAuthorizeRequestSchema,
  AssetUploadCompleteRequestSchema,
} from "@wardrobe/cloud-contracts";

import { AuthApiError } from "../auth/registrations.js";
import { SessionService } from "../auth/session.js";
import { AssetApiError, AssetService } from "./service.js";

export function registerAssetRoutes(
  app: FastifyInstance,
  assetService: AssetService,
  sessionService: SessionService,
) {
  app.post("/api/assets/upload-url", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = AssetUploadAuthorizeRequestSchema.parse(request.body);
      return await assetService.authorizeUpload({ ...body, userId: claims.userId, deviceId: claims.deviceId });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });

  app.post("/api/assets/complete-upload", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = AssetUploadCompleteRequestSchema.parse(request.body);
      return await assetService.completeUpload({ ...body, userId: claims.userId });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });

  app.post("/api/assets/download-url", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = AssetDownloadAuthorizeRequestSchema.parse(request.body);
      return await assetService.authorizeDownload({ ...body, userId: claims.userId });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });

  app.post("/api/assets/manifest", async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const body = AssetManifestRequestSchema.parse(request.body ?? {});
      return await assetService.getManifest({ ...body, userId: claims.userId });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });
}

function sendAssetError(reply: FastifyReply, error: unknown) {
  if (error instanceof AssetApiError || error instanceof AuthApiError) {
    return reply.code(error.statusCode).send({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      code: "invalid_request",
      message: "Invalid asset request",
    });
  }

  throw error;
}
