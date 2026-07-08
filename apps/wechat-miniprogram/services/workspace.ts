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
  revision: number;
  legacyItemId: number;
  name: string;
  category: string;
  categoryLabel: string;
  colorText: string;
  seasonText: string;
  imageUrl: string;
  updatedAt: string;
}

export interface MiniGarmentDetail extends MiniGarment {
  rawPayload: Record<string, unknown>;
  meta: string;
  statusText: string;
  locationText: string;
  purchaseDate: string;
  primaryColor: string;
  secondaryColor: string;
  temperatureText: string;
  formalityText: string;
  warmthText: string;
  materialText: string;
  fitText: string;
  notes: string;
}

export interface MiniOutfit {
  id: string;
  revision: number;
  name: string;
  itemCount: number;
  itemIds: number[];
  itemEntityIds: string[];
  imageUrl: string;
  itemImages: string[];
  seasonText: string;
  sceneText: string;
  favorite: boolean;
  updatedAt: string;
}

export interface MiniWishlistItem {
  id: string;
  revision: number;
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
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  aiTag?: Record<string, unknown>;
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
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  aiTag?: Record<string, unknown>;
  price?: number;
  productUrl?: string;
  notes?: string;
  assetMutations?: AssetMutation[];
}

export interface UpdateGarmentInput {
  id: string;
  expectedRevision: number;
  currentPayload: Record<string, unknown>;
  name: string;
  category: string;
  colors: Record<string, unknown>;
  seasons: string[];
  styles?: string[];
  notes?: string;
  aiTag?: Record<string, unknown>;
}

type CatalogItemPayloadInput = {
  name: string;
  category?: string;
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  notes?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  outerwear: "外套",
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
  const garments = await fetchGarmentsForOutfits();
  return Promise.all((response.items ?? []).map((entity) => toMiniOutfit(entity, garments)));
}

export async function fetchWishlist(limit = 60): Promise<MiniWishlistItem[]> {
  const response = await workspaceRequest<WorkspaceListResponse>(`/api/workspace/wishlist?limit=${limit}`);
  return Promise.all((response.items ?? []).map(toMiniWishlistItem));
}

export async function fetchGarmentDetail(id: string): Promise<MiniGarmentDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(`/api/workspace/garments/${encodeURIComponent(id)}`);
  const summary = await toMiniGarment(response.data);
  const payload = response.data.payload;
  const colors = colorList(payload.colors);
  const styles = Array.isArray(payload.styles) ? payload.styles.filter(isNonEmptyString).slice(0, 3).join(" / ") : "";
  return {
    ...summary,
    rawPayload: payload,
    meta: [summary.categoryLabel, summary.seasonText, styles].filter((part) => part && part !== "未标注").join(" · ") || summary.categoryLabel,
    statusText: garmentStatusText(payload.status),
    locationText: locationText(payload.locationId),
    purchaseDate: stringValue(payload.purchaseDate, "未记录"),
    primaryColor: colors[0] ?? "未标注",
    secondaryColor: colors[1] ?? "无",
    temperatureText: temperatureText(payload.temperatureRange),
    formalityText: scoreText(payload.formality),
    warmthText: scoreText(payload.warmth),
    materialText: firstString(payload.material, payload.materialText, payload.fabric, payload.fabricText) || "未记录",
    fitText: firstString(payload.fit, payload.fitNotes, payload.fitGender) || "未记录",
    notes: stringValue(payload.notes, "无备注"),
  };
}

export async function fetchOutfitDetail(id: string): Promise<MiniOutfitDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(`/api/workspace/outfits/${encodeURIComponent(id)}`);
  const summary = await toMiniOutfit(response.data, await fetchGarmentsForOutfits());
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
        ...buildCatalogItemPayload({
          name: input.name,
          category: input.category,
          colors: input.colors ?? { mode: "single", primary: input.color },
          seasons: input.seasons ?? (input.season ? [input.season] : []),
          styles: input.styles,
          notes: input.note,
        }),
        aiRecognition: input.aiTag,
        legacyItemId: createLegacyNumericId(),
        locationId: "home",
        status: "active",
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
        ...buildCatalogItemPayload({
          name: input.name,
          category: input.category || "tops",
          colors: input.colors ?? { mode: "single", primary: "未标注" },
          seasons: input.seasons ?? [],
          styles: input.styles,
          notes: input.notes,
        }),
        aiRecognition: input.aiTag,
        price: input.price,
        productUrl: input.productUrl,
        status: "interested",
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存种草");
  return response.entity;
}

export async function updateGarment(input: UpdateGarmentInput): Promise<WorkspaceEntity> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "PUT",
    path: `/api/workspace/garments/${encodeURIComponent(input.id)}`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision: input.expectedRevision,
      payload: {
        ...input.currentPayload,
        name: input.name,
        category: input.category,
        colors: input.colors,
        seasons: input.seasons,
        styles: input.styles ?? [],
        notes: input.notes,
        aiRecognition: input.aiTag,
        updatedAt: new Date().toISOString(),
      },
      assetMutations: [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已更新衣物");
  return response.entity;
}

export async function deleteWorkspaceEntity(resource: "garments" | "outfits" | "wishlist", id: string, expectedRevision: number): Promise<void> {
  await request({
    method: "DELETE",
    path: `/api/workspace/${resource}/${encodeURIComponent(id)}`,
    data: { clientMutationId: createClientMutationId(), expectedRevision },
  });
}

function buildCatalogItemPayload(input: CatalogItemPayloadInput): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    name: input.name,
    category: input.category || "tops",
    colors: input.colors ?? { mode: "single", primary: "未标注" },
    seasons: input.seasons ?? [],
    styles: input.styles ?? [],
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
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
    revision: entity.revision,
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

async function toMiniOutfit(entity: WorkspaceEntity, garments: MiniGarment[] = []): Promise<MiniOutfit> {
  const payload = entity.payload;
  const itemIds = numberList(payload.legacyItemIds).length ? numberList(payload.legacyItemIds) : numberList(payload.itemIds);
  const itemEntityIds = stringList(payload.itemEntityIds);
  const itemNames = stringList(payload.itemNames);
  const itemCount = itemIds.length || itemEntityIds.length || itemNames.length;
  const itemImages = outfitItemImages(itemIds, itemEntityIds, garments);
  const coverUrl = await resolveImageUrl(entity, "coverImageDataUrl", payload);
  return {
    id: entity.id,
    revision: entity.revision,
    name: stringValue(payload.name, "未命名套装"),
    itemCount,
    itemIds,
    itemEntityIds,
    imageUrl: coverUrl || itemImages[0] || "",
    itemImages,
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
    revision: entity.revision,
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

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

async function fetchGarmentsForOutfits(): Promise<MiniGarment[]> {
  try {
    return await fetchGarments();
  } catch {
    return [];
  }
}

function outfitItemImages(itemIds: number[], itemEntityIds: string[], garments: MiniGarment[]): string[] {
  const byLegacy = new Map(garments.map((garment) => [garment.legacyItemId, garment]));
  const byEntity = new Map(garments.map((garment) => [garment.id, garment]));
  return [
    ...itemIds.map((id) => byLegacy.get(id)?.imageUrl),
    ...itemEntityIds.map((id) => byEntity.get(id)?.imageUrl),
  ].filter(isNonEmptyString).slice(0, 4);
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

function colorList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isNonEmptyString);
  if (!value || typeof value !== "object") return [];
  const colors = value as Record<string, unknown>;
  if (colors.mode === "single") return [colors.primary].filter(isNonEmptyString);
  if (colors.mode === "main_with_accent") return [colors.primary, ...stringList(colors.accents)].filter(isNonEmptyString);
  if (colors.mode === "multicolor") return stringList(colors.primaries);
  return [];
}

function garmentStatusText(value: unknown): string {
  if (value === "inactive") return "暂不穿";
  if (value === "archived") return "已归档";
  if (value === "laundry") return "清洗中";
  return "可穿";
}

function locationText(value: unknown): string {
  if (value === "home") return "默认衣橱";
  return stringValue(value, "默认衣橱");
}

function scoreText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}/5` : "未识别";
}

function temperatureText(value: unknown): string {
  if (!value || typeof value !== "object") return "未识别";
  const record = value as Record<string, unknown>;
  const min = typeof record.min === "number" ? record.min : typeof record.minC === "number" ? record.minC : undefined;
  const max = typeof record.max === "number" ? record.max : typeof record.maxC === "number" ? record.maxC : undefined;
  if (min !== undefined && max !== undefined) return `${min}℃ - ${max}℃`;
  if (min !== undefined) return `${min}℃以上`;
  if (max !== undefined) return `${max}℃以下`;
  return "未识别";
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
