import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  TemporaryAssetSessionRequestSchema,
  TemporaryAssetUploadParamsSchema,
  WorkspaceBatchCreateCommandSchema,
  WorkspaceCreateCommandSchema,
  WorkspaceDateRangeQuerySchema,
  WorkspaceDeleteCommandSchema,
  WorkspacePackingChecklistCommandSchema,
  WorkspacePaginationQuerySchema,
  WorkspacePlanMarkWornCommandSchema,
  WorkspaceStateCommandSchema,
  WorkspaceUpdateCommandSchema,
  WorkspaceWishlistConvertCommandSchema,
} from "@wardrobe/cloud-contracts";

import { AssetService } from "../assets/service.js";
import { SessionService } from "../auth/session.js";
import { WorkspaceCommandService } from "./command-service.js";
import { sendWorkspaceError, WorkspaceApiError } from "./errors.js";
import { WORKSPACE_RESOURCES, WorkspaceQueryService, type WorkspaceResource } from "./query-service.js";

const ResourceSchema = z.enum(Object.keys(WORKSPACE_RESOURCES) as [WorkspaceResource, ...WorkspaceResource[]]);
const IdParamsSchema = z.object({ resource: ResourceSchema, id: z.string().uuid() });
const SessionParamsSchema = z.object({ sessionId: z.string().uuid() });

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  queryService: WorkspaceQueryService,
  commandService: WorkspaceCommandService,
  assetService: AssetService,
  sessionService: SessionService,
) {
  app.get("/api/workspace/overview", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    return queryService.overview(claims.userId, requestId(request));
  }));

  app.get("/api/workspace/wear-summary", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    return queryService.wearSummary(claims.userId, requestId(request));
  }));
  app.get("/api/workspace/mutations/:id", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { response: await commandService.mutationResult(claims.userId, id) };
  }));

  app.post("/api/workspace/assets/sessions", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const body = TemporaryAssetSessionRequestSchema.parse(request.body);
    return assetService.createTemporarySession({ ...body, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));

  app.put("/api/workspace/assets/sessions/:sessionId/assets/:assetId", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const params = TemporaryAssetUploadParamsSchema.parse(request.params);
    const mimeType = request.headers["content-type"];
    if (!Buffer.isBuffer(request.body) || typeof mimeType !== "string" || !mimeType.startsWith("image/")) throw new WorkspaceApiError(400, "invalid_request", "图片正文必须是带 MIME 的二进制内容");
    return assetService.uploadTemporary({ ...params, bytes: request.body, mimeType, userId: claims.userId, requestId: requestId(request) });
  }));

  app.get("/api/workspace/assets/sessions/:sessionId", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { sessionId } = SessionParamsSchema.parse(request.params);
    return assetService.getTemporarySession({ sessionId, userId: claims.userId, requestId: requestId(request) });
  }));

  app.delete("/api/workspace/assets/sessions/:sessionId", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { sessionId } = SessionParamsSchema.parse(request.params);
    return assetService.abandonTemporarySession({ sessionId, userId: claims.userId, requestId: requestId(request) });
  }));

  app.post("/api/workspace/garments/batch", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const body = WorkspaceBatchCreateCommandSchema.parse(request.body);
    return commandService.batchCreate({ resource: "garments", commands: body.items, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));

  app.post("/api/workspace/wishlist/:id/convert", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = WorkspaceWishlistConvertCommandSchema.parse(request.body);
    return commandService.convertWishlist({ entityId: id, command: { ...body, payload: { locationId: body.locationId }, temporaryAssetIds: [] }, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));

  app.post("/api/workspace/wishlist/:id/undo-purchase", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const command = WorkspaceDeleteCommandSchema.parse(request.body);
    return commandService.undoWishlistPurchase({ entityId: id, command, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));
  app.post("/api/workspace/outfits/:id/favorite", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const command = WorkspaceStateCommandSchema.parse(request.body);
    return commandService.patchPayload({ resource: "outfits", entityId: id, command, patch: { favorite: command.value ?? true }, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));
  app.post("/api/workspace/outfit-plans/:id/mark-worn", async (request, reply) => wornAction(request, reply, sessionService, commandService, "outfit-plans", true));
  app.post("/api/workspace/outfit-plans/:id/cancel-worn", async (request, reply) => wornAction(request, reply, sessionService, commandService, "outfit-plans", false));
  app.post("/api/workspace/garments/:id/mark-worn", async (request, reply) => wornAction(request, reply, sessionService, commandService, "garments", true));
  app.post("/api/workspace/garments/:id/cancel-worn", async (request, reply) => wornAction(request, reply, sessionService, commandService, "garments", false));
  app.post("/api/workspace/outfits/:id/mark-worn", async (request, reply) => wornAction(request, reply, sessionService, commandService, "outfits", true));
  app.post("/api/workspace/outfits/:id/cancel-worn", async (request, reply) => wornAction(request, reply, sessionService, commandService, "outfits", false));
  app.get("/api/workspace/trip-plans/:id/checklist", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return queryService.detail({ resource: "trip-plans", id, userId: claims.userId, requestId: requestId(request) });
  }));
  app.put("/api/workspace/trip-plans/:id/checklist", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const command = WorkspacePackingChecklistCommandSchema.parse(request.body);
    return commandService.patchPayload({ resource: "trip-plans", entityId: id, command, patch: { packingChecklist: command.items }, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));

  app.get("/api/workspace/:resource/:id", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { resource, id } = IdParamsSchema.parse(request.params);
    return queryService.detail({ resource, id, userId: claims.userId, requestId: requestId(request) });
  }));

  app.get("/api/workspace/:resource", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { resource } = z.object({ resource: ResourceSchema }).parse(request.params);
    const query = ["trip-plans", "outfit-plans", "wear-events"].includes(resource)
      ? WorkspaceDateRangeQuerySchema.parse(request.query)
      : WorkspacePaginationQuerySchema.parse(request.query);
    return queryService.list({ resource, userId: claims.userId, ...query, requestId: requestId(request) });
  }));

  app.post("/api/workspace/:resource", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { resource } = z.object({ resource: ResourceSchema }).parse(request.params);
    const command = WorkspaceCreateCommandSchema.parse(request.body);
    return commandService.create({ resource, command, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));

  app.put("/api/workspace/:resource/:id", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { resource, id } = IdParamsSchema.parse(request.params);
    const command = WorkspaceUpdateCommandSchema.parse(request.body);
    return commandService.update({ resource, entityId: id, command, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));

  app.delete("/api/workspace/:resource/:id", async (request, reply) => handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { resource, id } = IdParamsSchema.parse(request.params);
    const command = WorkspaceDeleteCommandSchema.parse(request.body);
    return commandService.delete({ resource, entityId: id, command, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  }));
}

async function wornAction(request: any, reply: any, sessionService: SessionService, commandService: WorkspaceCommandService, resource: "garments" | "outfits" | "outfit-plans", mark: boolean) {
  return handle(reply, async () => {
    const claims = await authenticate(request.headers.authorization, request.headers["x-wardrobe-device-id"], sessionService);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (mark) {
      const command = WorkspacePlanMarkWornCommandSchema.parse(request.body);
      return commandService.markWorn({ resource, entityId: id, command, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
    }
    const command = WorkspaceStateCommandSchema.parse(request.body);
    return commandService.cancelWorn({ resource, entityId: id, command, userId: claims.userId, deviceId: claims.deviceId, requestId: requestId(request) });
  });
}

async function authenticate(authorization: string | undefined, deviceHeader: string | string[] | undefined, sessionService: SessionService) {
  const claims = await sessionService.authenticate(authorization);
  if (typeof deviceHeader !== "string" || !deviceHeader) throw new WorkspaceApiError(400, "invalid_request", "缺少设备标识");
  if (deviceHeader !== claims.deviceId) throw new WorkspaceApiError(403, "auth", "设备标识与登录会话不一致");
  return claims;
}

function requestId(request: any): string | undefined {
  const value = request.headers["x-wardrobe-request-id"];
  return typeof value === "string" ? value : undefined;
}

async function handle(reply: any, task: () => Promise<unknown>) {
  try { return await task(); } catch (error) { return sendWorkspaceError(reply, error); }
}
