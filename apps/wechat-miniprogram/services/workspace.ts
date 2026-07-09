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
  tripPlans?: WorkspaceEntity[];
  outfitPlans?: WorkspaceEntity[];
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
  colorNames: string[];
  cardColors: Array<{ name: string; swatch: string; needsBorder: boolean }>;
  wearSummary: string;
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
  wornDates: string[];
  wornToday: boolean;
  wearSummary: string;
  lastWornText: string;
  updatedAt: string;
}

export interface MiniWishlistItem {
  id: string;
  revision: number;
  name: string;
  categoryLabel: string;
  priceText: string;
  status: "interested" | "purchased" | "rejected" | "archived";
  statusText: string;
  imageUrl: string;
  updatedAt: string;
}

export interface MiniOutfitDetail extends MiniOutfit {
  notes: string;
}

export interface MiniWishlistDetail extends MiniWishlistItem {
  rawPayload: Record<string, unknown>;
  productUrl: string;
  notes: string;
}

export type MiniCalendarPlanType = "travel" | "business" | "custom";
export type MiniCalendarPlanTone = "denim" | "moss" | "clay" | "amber" | "rose" | "purple" | "slate";
export type MiniOutfitPlanEntryStatus = "planned" | "worn" | "skipped" | "changed";

export interface MiniCalendarPlan {
  id: string;
  revision: number;
  type: MiniCalendarPlanType;
  typeLabel: string;
  title: string;
  startDate: string;
  endDate: string;
  tone: MiniCalendarPlanTone;
  destination: string;
  activities: string[];
  weatherNote: string;
  notes: string;
  packingEnabled: boolean;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MiniOutfitPlanEntry {
  id: string;
  revision: number;
  date: string;
  outfitId: string;
  calendarPlanId: string;
  status: MiniOutfitPlanEntryStatus;
  title: string;
  scene: string;
  weatherNote: string;
  notes: string;
  isPrimary: boolean;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningSnapshot {
  outfits: MiniOutfit[];
  calendarPlans: MiniCalendarPlan[];
  outfitPlanEntries: MiniOutfitPlanEntry[];
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

export interface BatchCreateGarmentInput extends CreateGarmentInput {
  clientItemId: string;
}

export type BatchCreateGarmentResult =
  | { clientItemId: string; clientMutationId: string; status: "succeeded"; entity: WorkspaceEntity }
  | { clientItemId: string; clientMutationId: string; status: "failed"; error: string };

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

export interface SaveCalendarPlanInput {
  id?: string;
  expectedRevision?: number;
  currentPayload?: Record<string, unknown>;
  type: MiniCalendarPlanType;
  title?: string;
  startDate: string;
  endDate: string;
  tone: MiniCalendarPlanTone;
  destination?: string;
  activities?: string[];
  weatherNote?: string;
  notes?: string;
  packingEnabled?: boolean;
}

export interface CreateOutfitPlanEntryInput {
  date: string;
  outfitId: string;
  calendarPlanId?: string;
  makePrimary?: boolean;
  title?: string;
}

type CatalogItemPayloadInput = {
  name: string;
  category?: string;
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  notes?: string;
};

type WorkspaceCommandResponse = {
  status: "committed" | "in_progress";
  entity?: WorkspaceEntity;
  entities?: WorkspaceEntity[];
  requestId?: string;
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

const PLAN_TYPE_LABELS: Record<MiniCalendarPlanType, string> = {
  travel: "旅行",
  business: "出差",
  custom: "计划",
};

const PLAN_TONES = new Set<MiniCalendarPlanTone>(["denim", "moss", "clay", "amber", "rose", "purple", "slate"]);

const COLOR_SWATCHES: Record<string, { bg: string; border?: string }> = {
  "黑": { bg: "#1D2228" },
  "白": { bg: "#F8FAFC", border: "rgba(29,34,40,0.26)" },
  "灰": { bg: "#9CA3AF" },
  "米白": { bg: "#F3EEE3", border: "rgba(29,34,40,0.18)" },
  "米": { bg: "#E6D5B8", border: "rgba(29,34,40,0.16)" },
  "卡其": { bg: "#B7A477" },
  "棕": { bg: "#87583E" },
  "蓝": { bg: "#355C7D" },
  "牛仔蓝": { bg: "#3F6F9F" },
  "绿": { bg: "#5F7058" },
  "红": { bg: "#B84A45" },
  "粉": { bg: "#E8A7B8" },
  "深灰": { bg: "#4B5563" },
  "杏": { bg: "#E6C5A5", border: "rgba(29,34,40,0.14)" },
  "驼": { bg: "#B8845F" },
  "咖啡": { bg: "#5F4032" },
  "酒红": { bg: "#7B2E3A" },
  "橙": { bg: "#D9823B" },
  "黄": { bg: "#E3B64B", border: "rgba(29,34,40,0.12)" },
  "天蓝": { bg: "#83B6D9" },
  "藏青": { bg: "#243B5A" },
  "橄榄绿": { bg: "#777B48" },
  "墨绿": { bg: "#315B4B" },
  "紫": { bg: "#8C4A86" },
  "金": { bg: "#C6A15B", border: "rgba(29,34,40,0.12)" },
  "银": { bg: "#B8C0C8", border: "rgba(29,34,40,0.16)" },
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

export async function fetchPlanningSnapshot(): Promise<PlanningSnapshot> {
  const response = await workspaceRequest<WorkspaceOverviewResponse>("/api/workspace/overview");
  const garments = await Promise.all((response.garments ?? []).map(toMiniGarment));
  const outfits = await Promise.all((response.outfits ?? []).map((entity) => toMiniOutfit(entity, garments)));
  return {
    outfits,
    calendarPlans: (response.tripPlans ?? []).map(toMiniCalendarPlan),
    outfitPlanEntries: (response.outfitPlans ?? []).map(toMiniOutfitPlanEntry),
  };
}

export async function fetchCalendarPlanDetail(id: string): Promise<MiniCalendarPlan> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(`/api/workspace/trip-plans/${encodeURIComponent(id)}`);
  return toMiniCalendarPlan(response.data);
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
    rawPayload: response.data.payload,
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
      payload: buildCreateGarmentPayload(input),
      assetMutations: input.assetMutations,
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存衣物");
  return response.entity;
}

export async function batchCreateGarments(items: BatchCreateGarmentInput[]): Promise<BatchCreateGarmentResult[]> {
  if (!items.length) return [];
  try {
    const response = await request<WorkspaceCommandResponse>({
      method: "POST",
      path: "/api/workspace/garments/batch",
      data: {
        items: items.map((item) => ({
          clientMutationId: item.clientMutationId,
          payload: buildCreateGarmentPayload(item),
          assetMutations: item.assetMutations,
        })),
      },
    });
    if (response.status === "in_progress") throw new Error("服务器仍在处理本次提交，请稍后重试");

    const entities = response.entities ?? [];
    return Promise.all(items.map(async (item, index) => {
      const entity = entities[index];
      if (!entity) {
        return {
          clientItemId: item.clientItemId,
          clientMutationId: item.clientMutationId,
          status: "failed" as const,
          error: "服务器未返回该件衣物",
        };
      }
      try {
        const detail = await workspaceRequest<{ data: WorkspaceEntity }>(`/api/workspace/garments/${encodeURIComponent(entity.id)}`);
        return {
          clientItemId: item.clientItemId,
          clientMutationId: item.clientMutationId,
          status: "succeeded" as const,
          entity: detail.data,
        };
      } catch (error) {
        return {
          clientItemId: item.clientItemId,
          clientMutationId: item.clientMutationId,
          status: "failed" as const,
          error: error instanceof Error ? error.message : "保存后读回失败",
        };
      }
    }));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "批量保存失败";
    return items.map((item) => ({
      clientItemId: item.clientItemId,
      clientMutationId: item.clientMutationId,
      status: "failed" as const,
      error: message,
    }));
  }
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

export async function setOutfitFavorite(id: string, expectedRevision: number, value: boolean): Promise<MiniOutfitDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/outfits/${encodeURIComponent(id)}/favorite`,
    data: { clientMutationId: createClientMutationId(), expectedRevision, value, payload: {} },
  });
  return fetchOutfitDetail(id);
}

export async function markOutfitWornToday(id: string, expectedRevision: number): Promise<MiniOutfitDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/outfits/${encodeURIComponent(id)}/mark-worn`,
    data: { clientMutationId: createClientMutationId(), expectedRevision, wornAt: `${localDateKey()}T12:00:00.000Z` },
  });
  return fetchOutfitDetail(id);
}

export async function cancelOutfitWornToday(id: string, expectedRevision: number): Promise<MiniOutfitDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/outfits/${encodeURIComponent(id)}/cancel-worn`,
    data: { clientMutationId: createClientMutationId(), expectedRevision, date: localDateKey(), payload: {} },
  });
  return fetchOutfitDetail(id);
}

export async function convertWishlistToWardrobe(id: string, expectedRevision: number, locationId = "home"): Promise<MiniWishlistDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/wishlist/${encodeURIComponent(id)}/convert`,
    data: { clientMutationId: createClientMutationId(), expectedRevision, locationId },
  });
  return fetchWishlistDetail(id);
}

export async function undoWishlistPurchase(id: string, expectedRevision: number): Promise<MiniWishlistDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/wishlist/${encodeURIComponent(id)}/undo-purchase`,
    data: { clientMutationId: createClientMutationId(), expectedRevision },
  });
  return fetchWishlistDetail(id);
}

export async function updateWishlistStatus(input: {
  id: string;
  expectedRevision: number;
  currentPayload: Record<string, unknown>;
  status: "interested" | "rejected";
}): Promise<MiniWishlistDetail> {
  await request<WorkspaceCommandResponse>({
    method: "PUT",
    path: `/api/workspace/wishlist/${encodeURIComponent(input.id)}`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision: input.expectedRevision,
      payload: { ...input.currentPayload, status: input.status, updatedAt: new Date().toISOString() },
      assetMutations: [],
    },
  });
  return fetchWishlistDetail(input.id);
}

export async function deleteWorkspaceEntity(resource: "garments" | "outfits" | "wishlist", id: string, expectedRevision: number): Promise<void> {
  await request({
    method: "DELETE",
    path: `/api/workspace/${resource}/${encodeURIComponent(id)}`,
    data: { clientMutationId: createClientMutationId(), expectedRevision },
  });
}

export async function saveCalendarPlan(input: SaveCalendarPlanInput): Promise<MiniCalendarPlan> {
  const now = new Date().toISOString();
  const payload = {
    ...(input.currentPayload ?? {}),
    type: input.type,
    title: input.title?.trim() || defaultPlanTitle(input.type),
    startDate: input.startDate,
    endDate: input.endDate,
    tone: input.tone,
    destination: input.destination?.trim() || undefined,
    activities: (input.activities ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    weatherNote: input.weatherNote?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    packingEnabled: input.packingEnabled ?? input.type !== "custom",
    createdAt: stringValue(input.currentPayload?.createdAt, now),
    updatedAt: now,
  };

  const response = await request<{ entity?: WorkspaceEntity }>({
    method: input.id ? "PUT" : "POST",
    path: input.id ? `/api/workspace/trip-plans/${encodeURIComponent(input.id)}` : "/api/workspace/trip-plans",
    data: {
      clientMutationId: createClientMutationId(),
      ...(input.id ? { expectedRevision: input.expectedRevision } : {}),
      payload,
      assetMutations: [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存计划");
  return toMiniCalendarPlan(response.entity);
}

export async function deleteCalendarPlan(id: string, expectedRevision: number): Promise<void> {
  await request({
    method: "DELETE",
    path: `/api/workspace/trip-plans/${encodeURIComponent(id)}`,
    data: { clientMutationId: createClientMutationId(), expectedRevision },
  });
}

export async function createOutfitPlanEntry(input: CreateOutfitPlanEntryInput): Promise<MiniOutfitPlanEntry> {
  const now = new Date().toISOString();
  const payload = {
    date: input.date,
    planDate: input.date,
    outfitId: input.outfitId,
    ...(input.calendarPlanId ? { calendarPlanId: input.calendarPlanId, tripPlanId: input.calendarPlanId } : {}),
    title: input.title,
    status: "planned",
    isPrimary: input.makePrimary ?? true,
    role: "other",
    createdAt: now,
    updatedAt: now,
  };
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/outfit-plans",
    data: { clientMutationId: createClientMutationId(), payload, assetMutations: [] },
  });
  if (!response.entity) throw new Error("服务器未返回已保存穿搭计划");
  return toMiniOutfitPlanEntry(response.entity);
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

function buildCreateGarmentPayload(input: CreateGarmentInput): Record<string, unknown> {
  return {
    ...buildCatalogItemPayload({
      name: input.name,
      category: input.category,
      colors: input.colors ?? { mode: "single", primary: input.color },
      seasons: input.seasons ?? (input.season ? [input.season] : []),
      styles: input.styles,
      notes: input.note,
    }),
    aiRecognition: input.aiTag,
    legacyItemId: createLegacyNumericId(input.clientMutationId),
    locationId: "home",
    status: "active",
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
  const colorNames = colorList(payload.colors);
  return {
    id: entity.id,
    revision: entity.revision,
    legacyItemId: numberValue(payload.legacyItemId) ?? numericId(entity.id),
    name: stringValue(payload.name, "未命名单品"),
    category,
    categoryLabel: CATEGORY_LABELS[category] ?? "未分类",
    colorText: formatColors(payload.colors),
    colorNames,
    cardColors: colorNames.map(toCardColor),
    wearSummary: formatWearSummary(payload.wornDates),
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
  const wornDates = stringList(payload.wornDates);
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
    wornDates,
    wornToday: wornDates.includes(localDateKey()),
    wearSummary: formatWearSummary(wornDates),
    lastWornText: wornDates.length ? wornDates[wornDates.length - 1] ?? "暂无记录" : "暂无记录",
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
    status: wishlistStatus(payload),
    statusText: wishlistStatusText(payload),
    imageUrl: await resolveImageUrl(entity, "imageDataUrl", payload),
    updatedAt: entity.updatedAt,
  };
}

function toMiniCalendarPlan(entity: WorkspaceEntity): MiniCalendarPlan {
  const payload = entity.payload;
  const type = planType(payload.type);
  return {
    id: entity.id,
    revision: entity.revision,
    type,
    typeLabel: PLAN_TYPE_LABELS[type],
    title: stringValue(payload.title, defaultPlanTitle(type)),
    startDate: stringValue(payload.startDate, localDateKey()),
    endDate: stringValue(payload.endDate, stringValue(payload.startDate, localDateKey())),
    tone: planTone(payload.tone, type),
    destination: firstString(payload.destination),
    activities: stringList(payload.activities).slice(0, 8),
    weatherNote: firstString(payload.weatherNote),
    notes: firstString(payload.notes),
    packingEnabled: typeof payload.packingEnabled === "boolean" ? payload.packingEnabled : type !== "custom",
    rawPayload: payload,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toMiniOutfitPlanEntry(entity: WorkspaceEntity): MiniOutfitPlanEntry {
  const payload = entity.payload;
  return {
    id: entity.id,
    revision: entity.revision,
    date: firstString(payload.date, payload.planDate),
    outfitId: firstString(payload.outfitId, payload.actualOutfitId),
    calendarPlanId: firstString(payload.calendarPlanId, payload.tripPlanId),
    status: planEntryStatus(payload.status),
    title: firstString(payload.title),
    scene: firstString(payload.scene),
    weatherNote: firstString(payload.weatherNote),
    notes: firstString(payload.notes),
    isPrimary: payload.isPrimary === true,
    rawPayload: payload,
    createdAt: entity.createdAt,
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

function toCardColor(name: string): { name: string; swatch: string; needsBorder: boolean } {
  const normalized = name.endsWith("色") ? name.slice(0, -1) : name;
  const swatch = COLOR_SWATCHES[name] ?? COLOR_SWATCHES[normalized];
  return {
    name,
    swatch: swatch?.bg ?? "#9CA3AF",
    needsBorder: Boolean(swatch?.border),
  };
}

function formatWearSummary(value: unknown): string {
  const dates = Array.isArray(value) ? value.filter(isNonEmptyString) : [];
  if (dates.length === 0) return "未穿过";
  const last = dates[dates.length - 1] || "";
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(last);
  const dateText = match ? `${Number(match[2])}/${Number(match[3])}` : "";
  return dateText ? `最近 ${dateText} · 穿过 ${dates.length} 次` : `穿过 ${dates.length} 次`;
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
  if (value && typeof value === "object") return wishlistStatusText(wishlistStatus(value as Record<string, unknown>));
  if (value === "purchased") return "已购买";
  if (value === "rejected") return "已放弃";
  if (value === "archived") return "已归档";
  return "想买";
}

function wishlistStatus(payload: Record<string, unknown>): "interested" | "purchased" | "rejected" | "archived" {
  if (payload.status === "purchased" || payload.purchased === true || typeof payload.convertedItemId === "number" || isNonEmptyString(payload.convertedAt)) return "purchased";
  if (payload.status === "rejected") return "rejected";
  if (payload.status === "archived") return "archived";
  return "interested";
}

function planType(value: unknown): MiniCalendarPlanType {
  return value === "travel" || value === "business" || value === "custom" ? value : "custom";
}

function planTone(value: unknown, type: MiniCalendarPlanType): MiniCalendarPlanTone {
  if (typeof value === "string" && PLAN_TONES.has(value as MiniCalendarPlanTone)) return value as MiniCalendarPlanTone;
  if (type === "travel") return "clay";
  if (type === "business") return "moss";
  return "denim";
}

function planEntryStatus(value: unknown): MiniOutfitPlanEntryStatus {
  if (value === "worn" || value === "skipped" || value === "changed") return value;
  return "planned";
}

function defaultPlanTitle(type: MiniCalendarPlanType): string {
  if (type === "travel") return "未命名旅行";
  if (type === "business") return "未命名出差";
  return "未命名计划";
}

function localDateKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function createClientMutationId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function createLegacyNumericId(seed = ""): number {
  return seed ? numericId(seed) : Math.floor(Date.now() % 1_000_000_000);
}

function numericId(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) || 1;
}
