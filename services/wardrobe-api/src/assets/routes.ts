import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  AssetDeleteParamsSchema,
  AssetDownloadParamsSchema,
  AssetManifestRequestSchema,
  AssetUploadHeadersSchema,
  AssetUploadParamsSchema,
} from "@wardrobe/cloud-contracts";

import { AuthApiError } from "../auth/registrations.js";
import { SessionService } from "../auth/session.js";
import { DEFAULT_ASSET_MAX_BYTES } from "../storage/config.js";
import { AssetApiError, AssetService } from "./service.js";

export function registerAssetRoutes(
  app: FastifyInstance,
  assetService: AssetService,
  sessionService: SessionService,
  maxAssetBytes = DEFAULT_ASSET_MAX_BYTES,
) {
  app.addContentTypeParser(/^image\//, { parseAs: "buffer", bodyLimit: maxAssetBytes }, (_request, body, done) => done(null, body));

  app.put("/api/assets/:assetId/:variant/content", { bodyLimit: maxAssetBytes }, async (request, reply) => {
    try {
      const claims = await authenticateDevice(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
      const params = AssetUploadParamsSchema.parse(request.params);
      const headers = AssetUploadHeadersSchema.parse(request.headers);
      if (!Buffer.isBuffer(request.body)) throw new AssetApiError(400, "asset_upload_failed", "图片正文必须是二进制内容");
      return await assetService.upload({
        ...params,
        ownerEntityType: headers["x-asset-owner-entity-type"],
        ownerEntityId: headers["x-asset-owner-entity-id"],
        sha256: headers["x-asset-sha256"],
        mimeType: headers["content-type"],
        sizeBytes: headers["x-asset-size-bytes"],
        width: headers["x-asset-width"],
        height: headers["x-asset-height"],
        bytes: request.body,
        userId: claims.userId,
        deviceId: claims.deviceId,
      });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });

  app.get("/api/assets/:assetId/:variant/content", async (request, reply) => {
    try {
      const claims = await authenticateDevice(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
      const params = AssetDownloadParamsSchema.parse(request.params);
      const content = await assetService.download({ ...params, userId: claims.userId });
      return reply
        .type(content.mimeType)
        .header("Content-Length", content.sizeBytes)
        .header("X-Asset-SHA256", content.sha256)
        .header("X-Asset-Variant", params.variant)
        .header("ETag", `"sha256-${content.sha256}"`)
        .header("Cache-Control", "private")
        .send(content.stream);
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });

  app.delete("/api/assets/:assetId", async (request, reply) => {
    try {
      const claims = await authenticateDevice(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
      const params = AssetDeleteParamsSchema.parse(request.params);
      return await assetService.deleteAsset({ ...params, userId: claims.userId });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });

  app.post("/api/assets/manifest", async (request, reply) => {
    try {
      const claims = await authenticateDevice(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
      const body = AssetManifestRequestSchema.parse(request.body ?? {});
      return await assetService.getManifest({ ...body, userId: claims.userId });
    } catch (error) {
      return sendAssetError(reply, error);
    }
  });
}

async function authenticateDevice(
  authorization: string | undefined,
  deviceHeader: string | string[] | undefined,
  sessionService: SessionService,
) {
  const claims = await sessionService.authenticate(authorization);
  if (typeof deviceHeader !== "string" || !deviceHeader) {
    throw new AssetApiError(400, "device_id_required", "缺少设备标识");
  }
  if (deviceHeader !== claims.deviceId) {
    throw new AssetApiError(403, "device_id_mismatch", "设备标识与登录会话不一致");
  }
  return claims;
}

function sendAssetError(reply: FastifyReply, error: unknown) {
  if (error instanceof AssetApiError || error instanceof AuthApiError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ code: "invalid_request", message: "图片资产请求格式不正确" });
  }
  if (typeof error === "object" && error != null && "code" in error && (error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    return reply.code(413).send({ code: "asset_too_large", message: "图片超过 15 MiB 限制" });
  }
  throw error;
}
