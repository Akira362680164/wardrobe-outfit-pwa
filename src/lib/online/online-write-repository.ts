"use client";

import type {
  TemporaryAssetSession,
  TemporaryAssetSessionRequest,
  TemporaryAssetSessionStatus,
  TemporaryAssetSlotRequest,
  TemporaryAssetUploadResponse,
  WorkspaceBatchCreateCommand,
  WorkspaceCommandResponse,
  WorkspaceCreateCommand,
  WorkspaceDeleteCommand,
  WorkspaceDetailResponse,
  WorkspaceEntity,
  WorkspacePackingChecklistCommand,
  WorkspacePlanMarkWornCommand,
  WorkspaceStateCommand,
  WorkspaceUpdateCommand,
  WorkspaceWishlistConvertCommand,
} from "@wardrobe/cloud-contracts";
import { onlineRequest } from "@/lib/online/online-request";

export type OnlineWorkspaceResource =
  | "garments"
  | "outfits"
  | "wishlist"
  | "locations"
  | "trip-plans"
  | "outfit-plans"
  | "wear-events"
  | "profiles";

export interface OnlineAssetInput {
  fieldName: string;
  variant: "original" | "thumbnail";
  image: Blob | string;
  width?: number;
  height?: number;
}

export interface OnlineMutationOptions {
  clientMutationId: string;
  expectedRevision?: number;
}

export interface OnlineWriteRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  responseType?: "json" | "blob";
}

export type OnlineWriteRequester = <T>(path: string, options?: OnlineWriteRequestOptions) => Promise<T>;

export interface OnlineBatchItemResult {
  clientMutationId: string;
  status: "succeeded" | "failed";
  entity?: WorkspaceEntity;
  error?: string;
}

const workspaceBase = "/api/workspace";

export function createOnlineWriteRepository(request: OnlineWriteRequester = onlineRequest) {
  async function read(resource: OnlineWorkspaceResource, id: string): Promise<WorkspaceEntity> {
    const response = await request<WorkspaceDetailResponse>(`${workspaceBase}/${resource}/${encodeURIComponent(id)}`);
    return response.data;
  }

  async function getMutationResult(clientMutationId: string): Promise<WorkspaceCommandResponse | null> {
    const result = await request<{ response: WorkspaceCommandResponse | null }>(`${workspaceBase}/mutations/${encodeURIComponent(clientMutationId)}`);
    return result.response;
  }

  async function committedEntity(response: WorkspaceCommandResponse): Promise<WorkspaceEntity> {
    if (response.status === "in_progress") throw new Error("服务器仍在处理本次提交，请稍后重试");
    if (!response.entity) throw new Error("服务器未返回已保存数据");
    return response.entity;
  }

  async function create(
    resource: OnlineWorkspaceResource,
    command: WorkspaceCreateCommand,
  ): Promise<WorkspaceEntity> {
    const response = await request<WorkspaceCommandResponse>(`${workspaceBase}/${resource}`, {
      method: "POST",
      body: command,
    });
    const entity = await committedEntity(response);
    return read(resource, entity.id);
  }

  async function createBatch(
    resource: "garments",
    command: WorkspaceBatchCreateCommand,
  ): Promise<OnlineBatchItemResult[]> {
    try {
      const response = await request<WorkspaceCommandResponse>(`${workspaceBase}/${resource}/batch`, {
        method: "POST",
        body: command,
      });
      if (response.status === "in_progress") throw new Error("服务器仍在处理本次提交，请稍后重试");
      const entities = response.entities ?? [];
      return Promise.all(command.items.map(async (item, index) => {
        const entity = entities[index];
        if (!entity) return { clientMutationId: item.clientMutationId, status: "failed", error: "服务器未返回该单品" };
        try {
          return {
            clientMutationId: item.clientMutationId,
            status: "succeeded",
            entity: await read(resource, entity.id),
          } as const;
        } catch (error) {
          return {
            clientMutationId: item.clientMutationId,
            status: "failed",
            error: error instanceof Error ? error.message : "保存后读回失败",
          } as const;
        }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量保存失败";
      return command.items.map((item) => ({ clientMutationId: item.clientMutationId, status: "failed", error: message }));
    }
  }

  async function update(
    resource: OnlineWorkspaceResource,
    id: string,
    command: WorkspaceUpdateCommand,
  ): Promise<WorkspaceEntity> {
    requireRevision(command.expectedRevision);
    const response = await request<WorkspaceCommandResponse>(`${workspaceBase}/${resource}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: command,
    });
    await committedEntity(response);
    return read(resource, id);
  }

  async function remove(
    resource: OnlineWorkspaceResource,
    id: string,
    command: WorkspaceDeleteCommand,
  ): Promise<WorkspaceCommandResponse> {
    requireRevision(command.expectedRevision);
    return request(`${workspaceBase}/${resource}/${encodeURIComponent(id)}`, { method: "DELETE", body: command });
  }

  async function action<TCommand extends OnlineMutationOptions>(
    resource: OnlineWorkspaceResource,
    id: string,
    actionName: string,
    command: TCommand,
  ): Promise<WorkspaceEntity> {
    requireRevision(command.expectedRevision);
    const response = await request<WorkspaceCommandResponse>(
      `${workspaceBase}/${resource}/${encodeURIComponent(id)}/${actionName}`,
      { method: "POST", body: command },
    );
    await committedEntity(response);
    return read(resource, id);
  }

  async function createTemporaryAssetSession(
    input: TemporaryAssetSessionRequest,
  ): Promise<TemporaryAssetSession> {
    return request(`${workspaceBase}/assets/sessions`, { method: "POST", body: input });
  }

  async function uploadTemporaryAsset(
    sessionId: string,
    assetId: string,
    image: Blob,
  ): Promise<TemporaryAssetUploadResponse> {
    return request(
      `${workspaceBase}/assets/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}`,
      { method: "PUT", body: image, headers: { "Content-Type": image.type } },
    );
  }

  async function getTemporaryAssetSession(sessionId: string): Promise<TemporaryAssetSessionStatus> {
    return request(`${workspaceBase}/assets/sessions/${encodeURIComponent(sessionId)}`);
  }

  async function abandonTemporaryAssetSession(sessionId: string): Promise<void> {
    await request(`${workspaceBase}/assets/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  }

  async function uploadAssetInputs(input: {
    clientMutationId: string;
    entityType: TemporaryAssetSessionRequest["entityType"];
    assets: OnlineAssetInput[];
  }): Promise<{ session: TemporaryAssetSessionStatus; temporaryAssetIds: string[] }> {
    if (input.assets.length === 0) throw new Error("至少需要一张图片");
    const prepared = await Promise.all(input.assets.map(prepareAssetInput));
    const session = await createTemporaryAssetSession({
      clientMutationId: input.clientMutationId,
      entityType: input.entityType,
      slots: prepared.map(({ slot }) => slot),
    });

    await Promise.all(prepared.map(async ({ blob, slot }) => {
      const target = session.assets.find((asset) => asset.fieldName === slot.fieldName && asset.variant === slot.variant);
      if (!target) throw new Error(`服务器未返回 ${slot.fieldName}/${slot.variant} 上传位`);
      await uploadTemporaryAsset(session.sessionId, target.assetId, blob);
    }));

    const status = await getTemporaryAssetSession(session.sessionId);
    if (!status.ready) throw new Error("图片上传尚未完成");
    return { session: status, temporaryAssetIds: status.assets.map((asset) => asset.assetId) };
  }

  return {
    read,
    getMutationResult,
    create,
    createBatch,
    update,
    remove,
    action,
    createTemporaryAssetSession,
    uploadTemporaryAsset,
    getTemporaryAssetSession,
    abandonTemporaryAssetSession,
    uploadAssetInputs,
    convertWishlist: (id: string, command: WorkspaceWishlistConvertCommand) => action("wishlist", id, "convert", command),
    undoWishlistPurchase: (id: string, command: WorkspaceStateCommand) => action("wishlist", id, "undo-purchase", command),
    setOutfitFavorite: (id: string, command: WorkspaceStateCommand) => action("outfits", id, "favorite", command),
    markOutfitWorn: (id: string, command: WorkspacePlanMarkWornCommand) => action("outfits", id, "mark-worn", command),
    cancelOutfitWorn: (id: string, command: WorkspaceStateCommand) => action("outfits", id, "cancel-worn", command),
    markPlanWorn: (id: string, command: WorkspacePlanMarkWornCommand) => action("outfit-plans", id, "mark-worn", command),
    cancelPlanWorn: (id: string, command: WorkspaceStateCommand) => action("outfit-plans", id, "cancel-worn", command),
    updatePackingChecklist: async (id: string, command: WorkspacePackingChecklistCommand) => {
      requireRevision(command.expectedRevision);
      const response = await request<WorkspaceCommandResponse>(
        `${workspaceBase}/trip-plans/${encodeURIComponent(id)}/checklist`,
        { method: "PUT", body: command },
      );
      await committedEntity(response);
      return read("trip-plans", id);
    },
  };
}

async function prepareAssetInput(input: OnlineAssetInput): Promise<{ blob: Blob; slot: TemporaryAssetSlotRequest }> {
  const blob = typeof input.image === "string" ? await dataUrlToBlob(input.image) : input.image;
  if (!blob.type.startsWith("image/")) throw new Error("仅支持图片上传");
  const sha256 = await digestSha256(blob);
  return {
    blob,
    slot: {
      fieldName: input.fieldName,
      variant: input.variant,
      sha256,
      mimeType: blob.type,
      sizeBytes: blob.size,
      width: input.width,
      height: input.height,
    },
  };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("图片读取失败");
  return response.blob();
}

async function digestSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireRevision(revision: number | undefined): asserts revision is number {
  if (!Number.isInteger(revision) || (revision ?? 0) < 1) throw new Error("缺少有效的 expectedRevision");
}

export const onlineWriteRepository = createOnlineWriteRepository();
