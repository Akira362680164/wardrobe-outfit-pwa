import { getSession, isLoggedIn } from "../stores/session";
import { downloadAssetImage, type AssetMutation, type AssetRef } from "./assets";
import { request } from "./http";

type WorkspaceEntity = {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  assetRefs?: Record<string, AssetRef>;
};

type WorkspaceOverviewResponse = {
  garments?: WorkspaceEntity[];
  outfits?: WorkspaceEntity[];
  wishlistItems?: WorkspaceEntity[];
  serverRevision?: number;
  requestId?: string;
};

type WorkspaceListResponse = {
  items?: WorkspaceEntity[];
  nextCursor?: string;
  serverRevision?: number;
  requestId?: string;
};

export type WorkspaceReadState = "ready" | "logged_out" | "api_not_configured";

export interface WorkspaceSummary {
  garmentCount: number;
  outfitCount: number;
  wishlistCount: number;
  serverRevision: number;
  requestId?: string;
}

export interface MiniGarment {
  id: string;
  legacyItemId: number;
  name: string;
  category: string;
  categoryLabel: string;
  colorText: string;
  seasonText: string;
  imageUrl: string;
  updatedAt: string;
}

export interface MiniOutfit {
  id: string;
  name: string;
  itemCount: number;
  seasonText: string;
  sceneText: string;
  favorite: boolean;
  updatedAt: string;
}

export interface MiniWishlistItem {
  id: string;
  name: string;
  categoryLabel: string;
  priceText: string;
  statusText: string;
  imageUrl: string;
  updatedAt: string;
}

export interface MiniOutfitDetail extends MiniOutfit {
  notes: string;
}

export interface MiniWishlistDetail extends MiniWishlistItem {
  productUrl: string;
  notes: string;
}

export interface CreateGarmentInput {
  clientMutationId: string;
  name: string;
  category: string;
  color: string;
  season: string;
  note?: string;
  assetMutations: AssetMutation[];
}

export interface CreateOutfitInput {
  name: string;
  legacyItemIds: number[];
  seasons?: string[];
  sceneTags?: string[];
}

export interface CreateWishlistInput {
  clientMutationId?: string;
  name: string;
  category?: string;
  price?: number;
  productUrl?: string;
  notes?: string;
  assetMutations?: AssetMutation[];
}

const CATEGORY_LABELS: Record<string, string> = {
  tops: "上装",
  pants: "裤装",
  skirts: "半裙",
  one_piece: "连衣装",
  shoes: "鞋履",
  bags: "包袋",
  hats: "帽子",
  jewelry: "首饰",
  accessories: "配饰",
};

const SEASON_LABELS: Record<string, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
  all: "四季",
};

export function getWorkspaceReadState(): WorkspaceReadState {
  if (!isLoggedIn()) return "logged_out";
  if (!getApiBaseUrl()) return "api_not_configured";
  return "ready";
}

export async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const response = await workspaceRequest<WorkspaceOverviewResponse>("/api/workspace/overview");
  return {
    garmentCount: response.garments?.length ?? 0,
    outfitCount: response.outfits?.length ?? 0,
    wishlistCount: response.wishlistItems?.length ?? 0,
    serverRevision: response.serverRevision ?? 0,
    requestId: response.requestId,
  };
}

export async function fetchGarments(limit = 60): Promise<MiniGarment[]> {
  const response = await workspaceRequest<WorkspaceListResponse>(`/api/workspace/garments?limit=${limit}`);
  return Promise.all((response.items ?? []).map(toMiniGarment));
}

export async function fetchOutfits(limit = 60): Promise<MiniOutfit[]> {
  const response = await workspaceRequest<WorkspaceListResponse>(`/api/workspace/outfits?limit=${limit}`);
  return (response.items ?? []).map(toMiniOutfit);
}

export async function fetchWishlist(limit = 60): Promise<MiniWishlistItem[]> {
  const response = await workspaceRequest<WorkspaceListResponse>(`/api/workspace/wishlist?limit=${limit}`);
  return Promise.all((response.items ?? []).map(toMiniWishlistItem));
}

export async function fetchOutfitDetail(id: string): Promise<MiniOutfitDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(`/api/workspace/outfits/${encodeURIComponent(id)}`);
  const summary = toMiniOutfit(response.data);
  return { ...summary, notes: stringValue(response.data.payload.notes, "无备注") };
}

export async function fetchWishlistDetail(id: string): Promise<MiniWishlistDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(`/api/workspace/wishlist/${encodeURIComponent(id)}`);
  const summary = await toMiniWishlistItem(response.data);
  return {
    ...summary,
    productUrl: stringValue(response.data.payload.productUrl, ""),
    notes: stringValue(response.data.payload.notes, "无备注"),
  };
}

export async function createGarment(input: CreateGarmentInput): Promise<WorkspaceEntity> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/garments",
    data: {
      clientMutationId: input.clientMutationId,
      payload: {
        legacyItemId: createLegacyNumericId(),
        locationId: "home",
        name: input.name,
        category: input.category,
        colors: { mode: "single", primary: input.color },
        seasons: input.season ? [input.season] : [],
        styles: [],
        status: "active",
        notes: input.note,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations,
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存衣物");
  return response.entity;
}

export async function createOutfit(input: CreateOutfitInput): Promise<WorkspaceEntity> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/outfits",
    data: {
      clientMutationId: createClientMutationId(),
      payload: {
        name: input.name,
        legacyItemIds: input.legacyItemIds,
        itemIds: input.legacyItemIds,
        seasons: input.seasons ?? [],
        sceneTags: input.sceneTags ?? [],
        source: "manual",
        favorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      assetMutations: [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存套装");
  return response.entity;
}

export async function createWishlistItem(input: CreateWishlistInput): Promise<WorkspaceEntity> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/wishlist",
    data: {
      clientMutationId: input.clientMutationId ?? createClientMutationId(),
      payload: {
        name: input.name,
        category: input.category || "tops",
        price: input.price,
        productUrl: input.productUrl,
        notes: input.notes,
        colors: { mode: "single", primary: "未标注" },
        seasons: [],
        styles: [],
        status: "interested",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存种草");
  return response.entity;
}

async function workspaceRequest<T>(path: string): Promise<T> {
  const session = getSession() as ({ token?: string; deviceId?: string } | null);
  const baseUrl = getApiBaseUrl();
  if (!session?.token) throw new Error("请先登录后查看衣橱数据");
  if (!baseUrl) throw new Error("请先配置后端 API 域名");

  return new Promise<T>((resolve, reject) => {
    wx.request<T>({
      url: `${baseUrl}${path}`,
      method: "GET",
      header: {
        Accept: "application/json",
        Authorization: `Bearer ${session.token}`,
        ...(session.deviceId ? { "X-Wardrobe-Device-Id": session.deviceId } : {}),
        "X-Wardrobe-Request-Id": `mini-workspace-${Date.now()}`,
      },
      timeout: 30000,
      success: (result) => {
        if (result.statusCode < 400) {
          resolve(result.data);
          return;
        }
        const body = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
        reject(new Error(typeof body.message === "string" ? body.message : "读取衣橱数据失败"));
      },
      fail: () => reject(new Error("网络连接失败，请稍后重试")),
    });
  });
}

async function toMiniGarment(entity: WorkspaceEntity): Promise<MiniGarment> {
  const payload = entity.payload;
  const category = stringValue(payload.category, "unknown");
  return {
    id: entity.id,
    legacyItemId: numberValue(payload.legacyItemId) ?? numericId(entity.id),
    name: stringValue(payload.name, "未命名单品"),
    category,
    categoryLabel: CATEGORY_LABELS[category] ?? "未分类",
    colorText: formatColors(payload.colors),
    seasonText: formatSeasons(payload.seasons),
    imageUrl: await resolveImageUrl(entity, "imageDataUrl", payload),
    updatedAt: entity.updatedAt,
  };
}

function toMiniOutfit(entity: WorkspaceEntity): MiniOutfit {
  const payload = entity.payload;
  const ids = [payload.legacyItemIds, payload.itemEntityIds, payload.itemIds, payload.itemNames].find(Array.isArray);
  return {
    id: entity.id,
    name: stringValue(payload.name, "未命名套装"),
    itemCount: Array.isArray(ids) ? ids.length : 0,
    seasonText: formatSeasons(payload.seasons),
    sceneText: Array.isArray(payload.sceneTags) ? payload.sceneTags.filter(isNonEmptyString).slice(0, 3).join(" / ") || "未标注场景" : "未标注场景",
    favorite: payload.favorite === true,
    updatedAt: entity.updatedAt,
  };
}

async function toMiniWishlistItem(entity: WorkspaceEntity): Promise<MiniWishlistItem> {
  const payload = entity.payload;
  const category = stringValue(payload.category, "unknown");
  return {
    id: entity.id,
    name: stringValue(payload.name, "未命名种草"),
    categoryLabel: CATEGORY_LABELS[category] ?? "未分类",
    priceText: typeof payload.price === "number" && Number.isFinite(payload.price) ? `¥${payload.price}` : "未记录价格",
    statusText: wishlistStatusText(payload.status),
    imageUrl: await resolveImageUrl(entity, "imageDataUrl", payload),
    updatedAt: entity.updatedAt,
  };
}

async function resolveImageUrl(entity: WorkspaceEntity, fieldName: string, payload: Record<string, unknown>): Promise<string> {
  const downloaded = await downloadAssetImage(entity.assetRefs?.[fieldName], "thumbnail");
  return downloaded || firstString(payload.thumbnailUrl, payload.imageUrl, payload.imageDataUrl);
}

function getApiBaseUrl(): string {
  const app = getApp<{ globalData?: { apiBaseUrl?: string } }>();
  return (app.globalData?.apiBaseUrl ?? "").replace(/\/$/, "");
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function formatColors(value: unknown): string {
  if (Array.isArray(value)) return value.filter(isNonEmptyString).slice(0, 3).join(" / ") || "未标注";
  if (!value || typeof value !== "object") return "未标注";

  const colors = value as Record<string, unknown>;
  if (colors.mode === "single") return stringValue(colors.primary, "未标注");
  if (colors.mode === "main_with_accent") return [colors.primary, ...(Array.isArray(colors.accents) ? colors.accents : [])].filter(isNonEmptyString).slice(0, 3).join(" / ") || "未标注";
  if (colors.mode === "multicolor") return (Array.isArray(colors.primaries) ? colors.primaries : []).filter(isNonEmptyString).slice(0, 3).join(" / ") || "多色";
  return "未标注";
}

function formatSeasons(value: unknown): string {
  if (!Array.isArray(value)) return "未标注";
  return value.filter(isNonEmptyString).map((season) => SEASON_LABELS[season] ?? season).slice(0, 4).join(" / ") || "未标注";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function wishlistStatusText(value: unknown): string {
  if (value === "purchased") return "已购买";
  if (value === "rejected") return "已放弃";
  if (value === "archived") return "已归档";
  return "想买";
}

export function createClientMutationId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function createLegacyNumericId(): number {
  return Math.floor(Date.now() % 1_000_000_000);
}

function numericId(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) || 1;
}
