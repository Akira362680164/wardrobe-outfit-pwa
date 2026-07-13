import { ImageCropSuggestionRequestSchema, ImageCropSuggestionResponseSchema } from "@wardrobe/cloud-contracts";
import type { FastifyInstance } from "fastify";
import type { SessionService } from "../auth/session.js";
import { sendWorkspaceError, WorkspaceApiError } from "../workspace/errors.js";
import { decodeAndValidateCropImage } from "./image-metadata.js";
import type { ImageCropService } from "./service.js";

export function registerImageCropRoutes(app: FastifyInstance, sessionService: SessionService, cropService: ImageCropService) {
  app.post("/api/workspace/images/crop-suggestion", { bodyLimit: 10_750_000 }, async (request, reply) => {
    try {
      const claims = await sessionService.authenticate(request.headers.authorization);
      const deviceId = request.headers["x-wardrobe-device-id"];
      if (typeof deviceId !== "string" || !deviceId) throw new WorkspaceApiError(400, "invalid_request", "缺少设备标识");
      if (deviceId !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
      const body = ImageCropSuggestionRequestSchema.parse(request.body);
      const image = await decodeAndValidateCropImage(body.imageBase64, body.mimeType);
      const suggestion = await cropService.suggest({ clientItemId: body.clientItemId, mimeType: body.mimeType, image });
      return ImageCropSuggestionResponseSchema.parse({ revision: body.revision, suggestion });
    } catch (error) {
      return sendWorkspaceError(reply, error);
    }
  });
}
