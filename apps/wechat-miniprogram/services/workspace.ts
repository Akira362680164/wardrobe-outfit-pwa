import { getSession, isLoggedIn } from "../stores/session";
import {
  MINI_COLOR_CATALOG,
  MINI_COLOR_SWATCHES,
  MINI_GARMENT_STATUS_LABELS,
  MINI_SEASON_LABELS,
  MINI_STYLE_LABELS,
  MINI_WISHLIST_STATUS_LABELS,
} from "../generated/catalogs";
import {
  downloadAssetImage,
  type AssetMutation,
  type AssetRef,
} from "./assets";
import {
  getCategoryLabel,
  getSubcategoryLabel,
  normalizeCategoryId,
} from "./category-catalog";
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
  locations?: WorkspaceEntity[];
  tripPlans?: WorkspaceEntity[];
  outfitPlans?: WorkspaceEntity[];
  serverRevision?: number;
  requestId?: string;
  profiles?: WorkspaceEntity[];
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
  subcategory: string;
  subcategoryLabel: string;
  locationId: string;
  status: string;
  statusText: string;
  colorsRaw: unknown;
  colorText: string;
  colorNames: string[];
  cardColors: Array<{ name: string; swatch: string; needsBorder: boolean }>;
  seasonsRaw: unknown;
  seasons: string[];
  seasonLabels: string[];
  wearSummary: string;
  seasonText: string;
  stylesRaw: unknown;
  styles: string[];
  styleLabels: string[];
  temperatureRangeRaw: unknown;
  temperatureRange: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material: string;
  fitRaw: unknown;
  fitGender: string;
  fitGenderText: string;
  fitNotes: string;
  imageUrl: string;
  updatedAt: string;
  createdAt: string;
  wornDates: string[];
}

export interface MiniGarmentDetail extends MiniGarment {
  rawPayload: Record<string, unknown>;
  aiStyleAdvice?: { summary: string; scenes: string[]; pairingTips: string[]; avoidTips: string[]; generatedAt?: string };
  meta: string;
  statusText: string;
  locationText: string;
  purchaseDate: string;
  primaryColor: string;
  secondaryColor: string;
  colorMode: string;
  colorModeText: string;
  primaryColorChips: Array<{
    name: string;
    swatch: string;
    needsBorder: boolean;
  }>;
  accentColorChips: Array<{
    name: string;
    swatch: string;
    needsBorder: boolean;
  }>;
  temperatureText: string;
  formalityText: string;
  warmthText: string;
  materialText: string;
  fitText: string;
  notes: string;
  inspirationImages: Array<{
    id: string;
    fieldName: string;
    imageUrl: string;
    caption: string;
  }>;
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
  category: string;
  categoryLabel: string;
  subcategory: string;
  subcategoryLabel: string;
  colorsRaw: unknown;
  colorText: string;
  colorNames: string[];
  cardColors: Array<{ name: string; swatch: string; needsBorder: boolean }>;
  seasonsRaw: unknown;
  seasons: string[];
  seasonLabels: string[];
  seasonText: string;
  stylesRaw: unknown;
  styles: string[];
  styleLabels: string[];
  temperatureRangeRaw: unknown;
  temperatureRange: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material: string;
  fitRaw: unknown;
  fitGender: string;
  fitGenderText: string;
  fitNotes: string;
  priceText: string;
  status: "interested" | "purchased" | "rejected" | "archived";
  statusText: string;
  imageUrl: string;
  updatedAt: string;
  evaluation: string;
  evaluationText: string;
  convertedAt: string;
  convertedGarmentId: string;
}

export interface MiniOutfitDetail extends MiniOutfit {
  notes: string;
  rawPayload: Record<string, unknown>;
  wornPhotos: Array<{
    id: string;
    fieldName: string;
    imageUrl: string;
    caption: string;
  }>;
}

export interface MiniWishlistDetail extends MiniWishlistItem {
  rawPayload: Record<string, unknown>;
  meta: string;
  colorMode: string;
  colorModeText: string;
  primaryColor: string;
  secondaryColor: string;
  primaryColorChips: Array<{
    name: string;
    swatch: string;
    needsBorder: boolean;
  }>;
  accentColorChips: Array<{
    name: string;
    swatch: string;
    needsBorder: boolean;
  }>;
  temperatureText: string;
  formalityText: string;
  warmthText: string;
  materialText: string;
  fitText: string;
  price?: number;
  productUrl: string;
  notes: string;
  inspirationImages: Array<{
    id: string;
    fieldName: string;
    imageUrl: string;
    caption: string;
  }>;
  convertedGarmentMissing: boolean;
}

export interface MiniClosetLocation {
  id: string;
  name: string;
  note: string;
  sortOrder: number;
}

export interface MiniTryOnProfile {
  id: string;
  revision: number;
  rawPayload: Record<string, unknown>;
  enabled: boolean;
  fitGender: string;
  heightCm?: number;
  bodyType: string;
  bodyTypeCustom: string;
  shoulderWidth: string;
  legRatio: string;
  hairDescription: string;
  skinToneDescription: string;
  styleNote: string;
  fullBodyImageUrl: string;
  faceImageUrl: string;
  tryOnPreviews: Array<{
    id: string;
    fieldName: string;
    imageUrl: string;
    caption: string;
  }>;
}

export type MiniCalendarPlanType = "travel" | "business" | "custom";
export type MiniCalendarPlanTone =
  "denim" | "moss" | "clay" | "amber" | "rose" | "purple" | "slate";
export type MiniOutfitPlanEntryStatus =
  "planned" | "worn" | "skipped" | "changed";

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
  sourceType: "saved_outfit" | "daily_recommendation" | "manual_items";
  garmentIds: string[];
  itemIds: number[];
  garmentSnapshots: Array<Record<string, unknown>>;
  actualGarmentIds: string[];
  actualGarmentSnapshots: Array<Record<string, unknown>>;
  unavailableGarmentIds: string[];
  availability: "available" | "blocked" | "historical";
  actualOutfitId: string;
  calendarPlanId: string;
  status: MiniOutfitPlanEntryStatus;
  title: string;
  scene: string;
  weatherNote: string;
  notes: string;
  isPrimary: boolean;
  isPrimaryActual: boolean;
  role: "primary" | "backup" | "other";
  sortOrder: number;
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
  subcategory?: string;
  color: string;
  season: string;
  note?: string;
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material?: string;
  fitGender?: string;
  fitNotes?: string;
  price?: number;
  productUrl?: string;
  locationId?: string;
  status?: string;
  purchaseDate?: string;
  aiTag?: Record<string, unknown>;
  assetMutations: AssetMutation[];
}

export interface BatchCreateGarmentInput extends CreateGarmentInput {
  clientItemId: string;
}

export type BatchCreateGarmentResult =
  | {
      clientItemId: string;
      clientMutationId: string;
      status: "succeeded";
      entity: WorkspaceEntity;
    }
  | {
      clientItemId: string;
      clientMutationId: string;
      status: "failed";
      error: string;
    };

export interface CreateOutfitInput {
  name: string;
  legacyItemIds: number[];
  seasons?: string[];
  sceneTags?: string[];
  styleTags?: string[];
  pairingTags?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  notes?: string;
  assetMutations?: AssetMutation[];
  clientMutationId?: string;
}

export interface CreateWishlistInput {
  clientMutationId?: string;
  name: string;
  category?: string;
  subcategory?: string;
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material?: string;
  fitGender?: string;
  fitNotes?: string;
  status?: "interested" | "purchased" | "rejected" | "archived";
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
  subcategory?: string;
  colors: Record<string, unknown>;
  seasons: string[];
  styles?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material?: string;
  fitGender?: string;
  fitNotes?: string;
  price?: number;
  productUrl?: string;
  locationId?: string;
  status?: string;
  purchaseDate?: string;
  notes?: string;
  aiTag?: Record<string, unknown>;
  referenceOutfitImages?: Array<{
    id: string;
    fieldName: string;
    caption?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  assetMutations?: AssetMutation[];
}

export interface UpdateWishlistInput {
  id: string;
  expectedRevision: number;
  currentPayload: Record<string, unknown>;
  name: string;
  category: string;
  subcategory?: string;
  colors: Record<string, unknown>;
  seasons: string[];
  styles?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material?: string;
  fitGender?: string;
  fitNotes?: string;
  price?: number;
  productUrl?: string;
  status?: "interested" | "purchased" | "rejected" | "archived";
  notes?: string;
  aiTag?: Record<string, unknown>;
  referenceOutfitImages?: Array<{
    id: string;
    fieldName: string;
    caption?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  assetMutations?: AssetMutation[];
  clientMutationId?: string;
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
  role?: "primary" | "backup" | "other";
  title?: string;
}

export interface UpdateOutfitPlanEntryInput {
  id: string;
  expectedRevision: number;
  currentPayload: Record<string, unknown>;
  outfitId: string;
  title: string;
  makePrimary?: boolean;
  role?: "primary" | "backup" | "other";
}

type CatalogItemPayloadInput = {
  name: string;
  category?: string;
  subcategory?: string;
  colors?: Record<string, unknown>;
  seasons?: string[];
  styles?: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  formality?: number;
  warmth?: number;
  material?: string;
  fitGender?: string;
  fitNotes?: string;
  notes?: string;
};

type WorkspaceCommandResponse = {
  status: "committed" | "in_progress";
  entity?: WorkspaceEntity;
  entities?: WorkspaceEntity[];
  requestId?: string;
};

const FIT_GENDER_LABELS: Record<string, string> = {
  menswear: "男装",
  womenswear: "女装",
  unisex: "中性",
  unknown: "未识别",
};

const COLOR_MODE_LABELS: Record<string, string> = {
  single: "单主色",
  main_with_accent: "主辅色",
  multicolor: "拼色",
};

const PLAN_TYPE_LABELS: Record<MiniCalendarPlanType, string> = {
  travel: "旅行",
  business: "出差",
  custom: "计划",
};

const PLAN_TONES = new Set<MiniCalendarPlanTone>([
  "denim",
  "moss",
  "clay",
  "amber",
  "rose",
  "purple",
  "slate",
]);

export const WARDROBE_COLOR_CATALOG = MINI_COLOR_CATALOG.map((item) => ({
  name: item.value,
  bg: item.swatch,
  ...("border" in item && item.border ? { border: item.border } : {}),
}));
export function getWorkspaceReadState(): WorkspaceReadState {
  if (!isLoggedIn()) return "logged_out";
  if (!getApiBaseUrl()) return "api_not_configured";
  return "ready";
}

export async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const response = await workspaceRequest<WorkspaceOverviewResponse>(
    "/api/workspace/overview",
  );
  return {
    garmentCount: response.garments?.length ?? 0,
    outfitCount: response.outfits?.length ?? 0,
    wishlistCount: response.wishlistItems?.length ?? 0,
    serverRevision: response.serverRevision ?? 0,
    requestId: response.requestId,
  };
}

export async function fetchGarments(limit = 60): Promise<MiniGarment[]> {
  const entities = await fetchAllWorkspaceEntities("garments", limit);
  return Promise.all(entities.map(toMiniGarment));
}

export async function fetchOutfits(limit = 60): Promise<MiniOutfit[]> {
  const entities = await fetchAllWorkspaceEntities("outfits", limit);
  const garments = await fetchGarmentsForOutfits();
  return Promise.all(
    entities.map((entity) => toMiniOutfit(entity, garments)),
  );
}

export async function fetchPlanningSnapshot(): Promise<PlanningSnapshot> {
  const response = await workspaceRequest<WorkspaceOverviewResponse>(
    "/api/workspace/overview",
  );
  const garments = await Promise.all(
    (response.garments ?? []).map(toMiniGarment),
  );
  const outfits = await Promise.all(
    (response.outfits ?? []).map((entity) => toMiniOutfit(entity, garments)),
  );
  return {
    outfits,
    calendarPlans: (response.tripPlans ?? []).map(toMiniCalendarPlan),
    outfitPlanEntries: (response.outfitPlans ?? []).map(toMiniOutfitPlanEntry),
  };
}

export async function fetchCalendarPlanDetail(
  id: string,
): Promise<MiniCalendarPlan> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(
    `/api/workspace/trip-plans/${encodeURIComponent(id)}`,
  );
  return toMiniCalendarPlan(response.data);
}

export async function fetchWishlist(limit = 60): Promise<MiniWishlistItem[]> {
  const entities = await fetchAllWorkspaceEntities("wishlist", limit);
  return Promise.all(entities.map(toMiniWishlistItem));
}

export async function fetchClosetLocations(): Promise<MiniClosetLocation[]> {
  const response = await workspaceRequest<WorkspaceOverviewResponse>(
    "/api/workspace/overview",
  );
  return (response.locations ?? [])
    .map(toMiniClosetLocation)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function fetchTryOnProfile(): Promise<MiniTryOnProfile | null> {
  const response = await workspaceRequest<WorkspaceListResponse>(
    "/api/workspace/profiles?limit=1",
  );
  const entity = response.items?.[0];
  if (!entity) return null;
  const payload = entity.payload;
  return {
    id: entity.id,
    revision: entity.revision,
    rawPayload: payload,
    enabled: payload.enabled === true,
    fitGender: stringValue(payload.fitGender, "unspecified"),
    heightCm: safeNumber(payload.heightCm),
    bodyType: firstString(payload.bodyType),
    bodyTypeCustom: firstString(payload.bodyTypeCustom),
    shoulderWidth: firstString(payload.shoulderWidth),
    legRatio: firstString(payload.legRatio),
    hairDescription: firstString(payload.hairDescription),
    skinToneDescription: firstString(payload.skinToneDescription),
    styleNote: firstString(payload.styleNote),
    fullBodyImageUrl: await resolveImageUrl(
      entity,
      "fullBodyImageDataUrl",
      payload,
    ),
    faceImageUrl: await resolveImageUrl(entity, "faceImageDataUrl", payload),
    tryOnPreviews: await resolvePayloadAssetImages(entity, "tryOnPreviews"),
  };
}

export async function saveTryOnProfile(input: {
  current?: MiniTryOnProfile | null;
  payload: Record<string, unknown>;
  assetMutations?: AssetMutation[];
  clientMutationId: string;
}): Promise<MiniTryOnProfile> {
  const current = input.current;
  const path = current
    ? `/api/workspace/profiles/${encodeURIComponent(current.id)}`
    : "/api/workspace/profiles";
  await request<WorkspaceCommandResponse>({
    method: current ? "PUT" : "POST",
    path,
    data: {
      clientMutationId: input.clientMutationId,
      ...(current ? { expectedRevision: current.revision } : {}),
      payload: {
        ...(current?.rawPayload ?? {}),
        ...input.payload,
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  const saved = await fetchTryOnProfile();
  if (!saved) throw new Error("服务器未返回试穿档案");
  return saved;
}

export async function fetchGarmentDetail(
  id: string,
): Promise<MiniGarmentDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(
    `/api/workspace/garments/${encodeURIComponent(id)}`,
  );
  const summary = await toMiniGarment(response.data);
  const payload = response.data.payload;
  const colors = colorList(payload.colors);
  const colorParts = parseColorParts(payload.colors);
  const styles = summary.styleLabels.slice(0, 3).join(" / ");
  return {
    ...summary,
    rawPayload: payload,
    meta:
      [summary.categoryLabel, summary.seasonText, styles]
        .filter((part) => part && part !== "未标注")
        .join(" · ") || summary.categoryLabel,
    statusText: garmentStatusText(payload.status),
    locationText: locationText(payload.locationId),
    purchaseDate: stringValue(payload.purchaseDate, "未记录"),
    primaryColor: colors[0] ?? "未标注",
    secondaryColor: colors[1] ?? "无",
    colorMode: colorParts.mode,
    colorModeText: COLOR_MODE_LABELS[colorParts.mode] ?? colorParts.mode,
    primaryColorChips: colorParts.primary.map(toCardColor),
    accentColorChips: colorParts.accent.map(toCardColor),
    temperatureText: temperatureText(payload.temperatureRange),
    formalityText: scoreText(payload.formality),
    warmthText: scoreText(payload.warmth),
    materialText:
      firstString(
        payload.material,
        payload.materialText,
        payload.fabric,
        payload.fabricText,
      ) || "未记录",
    fitText: fitText(payload),
    notes: stringValue(payload.notes, "无备注"),
    aiStyleAdvice: parseAiStyleAdvice(payload.aiStyleAdvice),
    inspirationImages: await resolveInspirationImages(response.data),
  };
}

function parseAiStyleAdvice(value: unknown): MiniGarmentDetail["aiStyleAdvice"] {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!summary) return undefined;
  const list = (entry: unknown) => Array.isArray(entry) ? entry.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8) : [];
  return { summary, scenes: list(input.scenes), pairingTips: list(input.pairingTips), avoidTips: list(input.avoidTips), generatedAt: typeof input.generatedAt === "string" ? input.generatedAt : undefined };
}

export async function fetchOutfitDetail(id: string): Promise<MiniOutfitDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(
    `/api/workspace/outfits/${encodeURIComponent(id)}`,
  );
  const summary = await toMiniOutfit(
    response.data,
    await fetchGarmentsForOutfits(),
  );
  return {
    ...summary,
    notes: stringValue(response.data.payload.notes, "无备注"),
    rawPayload: response.data.payload,
    wornPhotos: await resolvePayloadAssetImages(
      response.data,
      "actualWornPhotos",
    ),
  };
}

export async function updateOutfit(input: {
  id: string;
  expectedRevision: number;
  currentPayload: Record<string, unknown>;
  patch: Record<string, unknown>;
  assetMutations?: AssetMutation[];
  clientMutationId?: string;
}): Promise<MiniOutfitDetail> {
  await request<WorkspaceCommandResponse>({
    method: "PUT",
    path: `/api/workspace/outfits/${encodeURIComponent(input.id)}`,
    data: {
      clientMutationId: input.clientMutationId ?? createClientMutationId(),
      expectedRevision: input.expectedRevision,
      payload: {
        ...input.currentPayload,
        ...input.patch,
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  return fetchOutfitDetail(input.id);
}

export async function fetchWishlistDetail(
  id: string,
): Promise<MiniWishlistDetail> {
  const response = await workspaceRequest<{ data: WorkspaceEntity }>(
    `/api/workspace/wishlist/${encodeURIComponent(id)}`,
  );
  const summary = await toMiniWishlistItem(response.data);
  const payload = response.data.payload;
  const colors = colorList(payload.colors);
  const colorParts = parseColorParts(payload.colors);
  const styles = summary.styleLabels.slice(0, 3).join(" / ");
  const convertedGarmentId = stringValue(payload.convertedGarmentId, "");
  const convertedGarmentMissing = convertedGarmentId
    ? !(await garmentExists(convertedGarmentId))
    : false;
  return {
    ...summary,
    rawPayload: payload,
    meta:
      [summary.categoryLabel, summary.seasonText, styles, summary.statusText]
        .filter((part) => part && part !== "未标注")
        .join(" · ") || summary.categoryLabel,
    colorMode: colorParts.mode,
    colorModeText: COLOR_MODE_LABELS[colorParts.mode] ?? colorParts.mode,
    primaryColor: colors[0] ?? "未标注",
    secondaryColor: colors[1] ?? "无",
    primaryColorChips: colorParts.primary.map(toCardColor),
    accentColorChips: colorParts.accent.map(toCardColor),
    temperatureText: temperatureText(payload.temperatureRange),
    formalityText: scoreText(payload.formality),
    warmthText: scoreText(payload.warmth),
    materialText:
      firstString(
        payload.material,
        payload.materialText,
        payload.fabric,
        payload.fabricText,
      ) || "未记录",
    fitText: fitText(payload),
    price:
      typeof payload.price === "number" && Number.isFinite(payload.price)
        ? payload.price
        : undefined,
    productUrl: stringValue(payload.productUrl, ""),
    notes: stringValue(payload.notes, "无备注"),
    inspirationImages: await resolveInspirationImages(response.data),
    convertedGarmentId,
    convertedGarmentMissing,
  };
}

async function garmentExists(id: string): Promise<boolean> {
  try {
    await workspaceRequest(`/api/workspace/garments/${encodeURIComponent(id)}`);
    return true;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode !== 404 ? true : false;
  }
}

export async function createGarment(
  input: CreateGarmentInput,
): Promise<WorkspaceEntity> {
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

export async function batchCreateGarments(
  items: BatchCreateGarmentInput[],
): Promise<BatchCreateGarmentResult[]> {
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
    if (response.status === "in_progress")
      throw new Error("服务器仍在处理本次提交，请稍后重试");

    const entities = response.entities ?? [];
    return Promise.all(
      items.map(async (item, index) => {
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
          const detail = await workspaceRequest<{ data: WorkspaceEntity }>(
            `/api/workspace/garments/${encodeURIComponent(entity.id)}`,
          );
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
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "批量保存失败";
    return items.map((item) => ({
      clientItemId: item.clientItemId,
      clientMutationId: item.clientMutationId,
      status: "failed" as const,
      error: message,
    }));
  }
}

export async function createOutfit(
  input: CreateOutfitInput,
): Promise<WorkspaceEntity> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/outfits",
    data: {
      clientMutationId: input.clientMutationId ?? createClientMutationId(),
      payload: {
        name: input.name,
        legacyItemIds: input.legacyItemIds,
        itemIds: input.legacyItemIds,
        seasons: input.seasons ?? [],
        sceneTags: input.sceneTags ?? [],
        styleTags: input.styleTags ?? [],
        pairingTags: input.pairingTags ?? [],
        temperatureRange: input.temperatureRange,
        source: "manual",
        notes: input.notes,
        favorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存套装");
  return response.entity;
}

export async function createWishlistItem(
  input: CreateWishlistInput,
): Promise<WorkspaceEntity> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/wishlist",
    data: {
      clientMutationId: input.clientMutationId ?? createClientMutationId(),
      payload: {
        ...buildCatalogItemPayload({
          name: input.name,
          category: input.category || "tops",
          subcategory: input.subcategory,
          colors: input.colors ?? { mode: "single", primary: "未标注" },
          seasons: input.seasons ?? [],
          styles: input.styles,
          temperatureRange: input.temperatureRange,
          formality: input.formality,
          warmth: input.warmth,
          material: input.material,
          fitGender: input.fitGender,
          fitNotes: input.fitNotes,
          notes: input.notes,
        }),
        aiRecognition: input.aiTag,
        price: input.price,
        productUrl: input.productUrl,
        status: input.status ?? "interested",
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存种草");
  return response.entity;
}

export async function updateGarment(
  input: UpdateGarmentInput,
): Promise<WorkspaceEntity> {
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
        subcategory: input.subcategory,
        colors: input.colors,
        seasons: input.seasons,
        styles: input.styles ?? [],
        temperatureRange: input.temperatureRange,
        formality: input.formality,
        warmth: input.warmth,
        material: input.material,
        fitGender: input.fitGender,
        fitNotes: input.fitNotes,
        price: input.price,
        productUrl: input.productUrl,
        locationId: input.locationId ?? input.currentPayload.locationId,
        status: input.status ?? input.currentPayload.status,
        purchaseDate: input.purchaseDate,
        notes: input.notes,
        aiRecognition: input.aiTag,
        referenceOutfitImages:
          input.referenceOutfitImages ??
          input.currentPayload.referenceOutfitImages,
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已更新衣物");
  return response.entity;
}

export async function updateWishlistItem(
  input: UpdateWishlistInput,
): Promise<MiniWishlistDetail> {
  await request<WorkspaceCommandResponse>({
    method: "PUT",
    path: `/api/workspace/wishlist/${encodeURIComponent(input.id)}`,
    data: {
      clientMutationId: input.clientMutationId ?? createClientMutationId(),
      expectedRevision: input.expectedRevision,
      payload: {
        ...input.currentPayload,
        name: input.name,
        category: input.category,
        subcategory: input.subcategory,
        colors: input.colors,
        seasons: input.seasons,
        styles: input.styles ?? [],
        temperatureRange: input.temperatureRange,
        formality: input.formality,
        warmth: input.warmth,
        material: input.material,
        fitGender: input.fitGender,
        fitNotes: input.fitNotes,
        price: input.price,
        productUrl: input.productUrl,
        status: input.status ?? input.currentPayload.status ?? "interested",
        notes: input.notes,
        aiRecognition: input.aiTag,
        referenceOutfitImages:
          input.referenceOutfitImages ??
          input.currentPayload.referenceOutfitImages,
        updatedAt: new Date().toISOString(),
      },
      assetMutations: input.assetMutations ?? [],
    },
  });
  return fetchWishlistDetail(input.id);
}

export async function setOutfitFavorite(
  id: string,
  expectedRevision: number,
  value: boolean,
): Promise<MiniOutfitDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/outfits/${encodeURIComponent(id)}/favorite`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision,
      value,
      payload: {},
    },
  });
  return fetchOutfitDetail(id);
}

export async function markOutfitWornOnDate(
  id: string,
  expectedRevision: number,
  dateKey: string,
): Promise<void> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/outfits/${encodeURIComponent(id)}/mark-worn`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision,
      wornAt: `${dateKey}T12:00:00.000Z`,
    },
  });
}

export async function markOutfitWornToday(
  id: string,
  expectedRevision: number,
): Promise<MiniOutfitDetail> {
  await markOutfitWornOnDate(id, expectedRevision, localDateKey());
  return fetchOutfitDetail(id);
}

export async function cancelOutfitWornOnDate(
  id: string,
  expectedRevision: number,
  dateKey: string,
): Promise<void> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/outfits/${encodeURIComponent(id)}/cancel-worn`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision,
      date: dateKey,
      payload: {},
    },
  });
}

export async function cancelOutfitWornToday(
  id: string,
  expectedRevision: number,
): Promise<MiniOutfitDetail> {
  await cancelOutfitWornOnDate(id, expectedRevision, localDateKey());
  return fetchOutfitDetail(id);
}

export async function markOutfitPlanWorn(entry: MiniOutfitPlanEntry, dateKey: string): Promise<void> {
  await request<WorkspaceCommandResponse>({ method: "POST", path: `/api/workspace/outfit-plans/${encodeURIComponent(entry.id)}/mark-worn`, data: { clientMutationId: createClientMutationId(), expectedRevision: entry.revision, wornAt: `${dateKey}T12:00:00.000Z`, ...(entry.outfitId ? { outfitId: entry.outfitId } : {}) } });
}

export async function cancelOutfitPlanWorn(entry: MiniOutfitPlanEntry, dateKey: string): Promise<void> {
  await request<WorkspaceCommandResponse>({ method: "POST", path: `/api/workspace/outfit-plans/${encodeURIComponent(entry.id)}/cancel-worn`, data: { clientMutationId: createClientMutationId(), expectedRevision: entry.revision, date: dateKey, payload: {} } });
}

export async function convertWishlistToWardrobe(
  id: string,
  expectedRevision: number,
  locationId = "home",
): Promise<MiniWishlistDetail> {
  await request<WorkspaceCommandResponse>({
    method: "POST",
    path: `/api/workspace/wishlist/${encodeURIComponent(id)}/convert`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision,
      locationId,
    },
  });
  return fetchWishlistDetail(id);
}

export async function undoWishlistPurchase(
  id: string,
  expectedRevision: number,
): Promise<MiniWishlistDetail> {
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
  status: "interested" | "rejected" | "archived";
}): Promise<MiniWishlistDetail> {
  await request<WorkspaceCommandResponse>({
    method: "PUT",
    path: `/api/workspace/wishlist/${encodeURIComponent(input.id)}`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision: input.expectedRevision,
      payload: {
        ...input.currentPayload,
        status: input.status,
        updatedAt: new Date().toISOString(),
      },
      assetMutations: [],
    },
  });
  return fetchWishlistDetail(input.id);
}

export async function deleteWorkspaceEntity(
  resource: "garments" | "outfits" | "wishlist" | "outfit-plans",
  id: string,
  expectedRevision: number,
): Promise<void> {
  await request({
    method: "DELETE",
    path: `/api/workspace/${resource}/${encodeURIComponent(id)}`,
    data: { clientMutationId: createClientMutationId(), expectedRevision },
  });
}

export async function saveCalendarPlan(
  input: SaveCalendarPlanInput,
): Promise<MiniCalendarPlan> {
  const now = new Date().toISOString();
  const payload = {
    ...(input.currentPayload ?? {}),
    type: input.type,
    title: input.title?.trim() || defaultPlanTitle(input.type),
    startDate: input.startDate,
    endDate: input.endDate,
    tone: input.tone,
    destination: input.destination?.trim() || undefined,
    activities: (input.activities ?? [])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8),
    weatherNote: input.weatherNote?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    packingEnabled: input.packingEnabled ?? input.type !== "custom",
    createdAt: stringValue(input.currentPayload?.createdAt, now),
    updatedAt: now,
  };

  const response = await request<{ entity?: WorkspaceEntity }>({
    method: input.id ? "PUT" : "POST",
    path: input.id
      ? `/api/workspace/trip-plans/${encodeURIComponent(input.id)}`
      : "/api/workspace/trip-plans",
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

export async function deleteCalendarPlan(
  id: string,
  expectedRevision: number,
): Promise<void> {
  await request({
    method: "DELETE",
    path: `/api/workspace/trip-plans/${encodeURIComponent(id)}`,
    data: { clientMutationId: createClientMutationId(), expectedRevision },
  });
}

export async function createOutfitPlanEntry(
  input: CreateOutfitPlanEntryInput,
): Promise<MiniOutfitPlanEntry> {
  const now = new Date().toISOString();
  const payload = {
    date: input.date,
    planDate: input.date,
    outfitId: input.outfitId,
    ...(input.calendarPlanId
      ? {
          calendarPlanId: input.calendarPlanId,
          tripPlanId: input.calendarPlanId,
        }
      : {}),
    title: input.title,
    status: "planned",
    isPrimary: input.makePrimary ?? true,
    role: input.role ?? ((input.makePrimary ?? true) ? "primary" : "backup"),
    createdAt: now,
    updatedAt: now,
  };
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "POST",
    path: "/api/workspace/outfit-plans",
    data: {
      clientMutationId: createClientMutationId(),
      payload,
      assetMutations: [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已保存穿搭计划");
  return toMiniOutfitPlanEntry(response.entity);
}

export async function updateOutfitPlanEntry(
  input: UpdateOutfitPlanEntryInput,
): Promise<MiniOutfitPlanEntry> {
  const response = await request<{ entity?: WorkspaceEntity }>({
    method: "PUT",
    path: `/api/workspace/outfit-plans/${encodeURIComponent(input.id)}`,
    data: {
      clientMutationId: createClientMutationId(),
      expectedRevision: input.expectedRevision,
      payload: {
        ...input.currentPayload,
        outfitId: input.outfitId,
        title: input.title,
        status: "planned",
        isPrimary: input.makePrimary ?? true,
        role:
          input.role ?? ((input.makePrimary ?? true) ? "primary" : "backup"),
        updatedAt: new Date().toISOString(),
      },
      assetMutations: [],
    },
  });
  if (!response.entity) throw new Error("服务器未返回已更新穿搭计划");
  return toMiniOutfitPlanEntry(response.entity);
}

function buildCatalogItemPayload(
  input: CatalogItemPayloadInput,
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    name: input.name,
    category: input.category || "tops",
    subcategory: input.subcategory,
    colors: input.colors ?? { mode: "single", primary: "未标注" },
    seasons: input.seasons ?? [],
    styles: input.styles ?? [],
    temperatureRange: input.temperatureRange,
    formality: input.formality,
    warmth: input.warmth,
    material: input.material,
    fitGender: input.fitGender,
    fitNotes: input.fitNotes,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
}

function buildCreateGarmentPayload(
  input: CreateGarmentInput,
): Record<string, unknown> {
  return {
    ...buildCatalogItemPayload({
      name: input.name,
      category: input.category,
      subcategory: input.subcategory,
      colors: input.colors ?? { mode: "single", primary: input.color },
      seasons: input.seasons ?? (input.season ? [input.season] : []),
      styles: input.styles,
      temperatureRange: input.temperatureRange,
      formality: input.formality,
      warmth: input.warmth,
      material: input.material,
      fitGender: input.fitGender,
      fitNotes: input.fitNotes,
      notes: input.note,
    }),
    aiRecognition: input.aiTag,
    legacyItemId: createLegacyNumericId(input.clientMutationId),
    price: input.price,
    productUrl: input.productUrl,
    locationId: input.locationId ?? "home",
    status: input.status ?? "active",
    purchaseDate: input.purchaseDate,
  };
}

async function workspaceRequest<T>(path: string): Promise<T> {
  return request<T>({ method: "GET", path, toast: false });
}

async function toMiniGarment(entity: WorkspaceEntity): Promise<MiniGarment> {
  const payload = entity.payload;
  const category = normalizeCategoryId(
    stringValue(payload.category, "unknown"),
  );
  const subcategory = firstString(payload.subcategory);
  const colorNames = colorList(payload.colors);
  const seasons = stringList(payload.seasons);
  const styles = stringList(payload.styles);
  const temperatureRange = normalizeTemperatureRange(payload.temperatureRange);
  const fitGender = firstString(payload.fitGender, payload.fit);
  return {
    id: entity.id,
    revision: entity.revision,
    legacyItemId: numberValue(payload.legacyItemId) ?? numericId(entity.id),
    name: stringValue(payload.name, "未命名单品"),
    category,
    categoryLabel: getCategoryLabel(category),
    subcategory,
    subcategoryLabel: getSubcategoryLabel(category, subcategory),
    locationId: stringValue(payload.locationId, "home"),
    status: stringValue(payload.status, "active"),
    statusText: garmentStatusText(payload.status),
    colorsRaw: payload.colors,
    colorText: formatColors(payload.colors),
    colorNames,
    cardColors: colorNames.map(toCardColor),
    seasonsRaw: payload.seasons,
    seasons,
    seasonLabels: seasons.map((season) => MINI_SEASON_LABELS[season] ?? season),
    wearSummary: formatWearSummary(payload.wornDates),
    seasonText: formatSeasons(payload.seasons),
    stylesRaw: payload.styles,
    styles,
    styleLabels: styles.map((style) => MINI_STYLE_LABELS[style] ?? style),
    temperatureRangeRaw: payload.temperatureRange,
    temperatureRange,
    formality: safeNumber(payload.formality),
    warmth: safeNumber(payload.warmth),
    material: firstString(
      payload.material,
      payload.materialText,
      payload.fabric,
      payload.fabricText,
    ),
    fitRaw: payload.fit ?? {
      fitGender: payload.fitGender,
      fitNotes: payload.fitNotes,
    },
    fitGender,
    fitGenderText: FIT_GENDER_LABELS[fitGender] ?? fitGender,
    fitNotes: firstString(payload.fitNotes),
    imageUrl: await resolveImageUrl(entity, "imageDataUrl", payload),
    updatedAt: entity.updatedAt,
    createdAt: entity.createdAt,
    wornDates: stringList(payload.wornDates),
  };
}

async function toMiniOutfit(
  entity: WorkspaceEntity,
  garments: MiniGarment[] = [],
): Promise<MiniOutfit> {
  const payload = entity.payload;
  const itemIds = numberList(payload.legacyItemIds).length
    ? numberList(payload.legacyItemIds)
    : numberList(payload.itemIds);
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
    sceneText: Array.isArray(payload.sceneTags)
      ? payload.sceneTags.filter(isNonEmptyString).slice(0, 3).join(" / ") ||
        "未标注场景"
      : "未标注场景",
    favorite: payload.favorite === true,
    wornDates,
    wornToday: wornDates.includes(localDateKey()),
    wearSummary: formatWearSummary(wornDates),
    lastWornText: wornDates.length
      ? (wornDates[wornDates.length - 1] ?? "暂无记录")
      : "暂无记录",
    updatedAt: entity.updatedAt,
  };
}

async function toMiniWishlistItem(
  entity: WorkspaceEntity,
): Promise<MiniWishlistItem> {
  const payload = entity.payload;
  const category = normalizeCategoryId(
    stringValue(payload.category, "unknown"),
  );
  const subcategory = firstString(payload.subcategory);
  const colorNames = colorList(payload.colors);
  const seasons = stringList(payload.seasons);
  const styles = stringList(payload.styles);
  const temperatureRange = normalizeTemperatureRange(payload.temperatureRange);
  const fitGender = firstString(payload.fitGender, payload.fit);
  const evaluation =
    firstString(
      payload.evaluation,
      payload.assessment,
      payload.purchaseRecommendation,
    ) || "unrated";
  return {
    id: entity.id,
    revision: entity.revision,
    name: stringValue(payload.name, "未命名种草"),
    category,
    categoryLabel: getCategoryLabel(category),
    subcategory,
    subcategoryLabel: getSubcategoryLabel(category, subcategory),
    colorsRaw: payload.colors,
    colorText: formatColors(payload.colors),
    colorNames,
    cardColors: colorNames.map(toCardColor),
    seasonsRaw: payload.seasons,
    seasons,
    seasonLabels: seasons.map((season) => MINI_SEASON_LABELS[season] ?? season),
    seasonText: formatSeasons(payload.seasons),
    stylesRaw: payload.styles,
    styles,
    styleLabels: styles.map((style) => MINI_STYLE_LABELS[style] ?? style),
    temperatureRangeRaw: payload.temperatureRange,
    temperatureRange,
    formality: safeNumber(payload.formality),
    warmth: safeNumber(payload.warmth),
    material: firstString(
      payload.material,
      payload.materialText,
      payload.fabric,
      payload.fabricText,
    ),
    fitRaw: payload.fit ?? {
      fitGender: payload.fitGender,
      fitNotes: payload.fitNotes,
    },
    fitGender,
    fitGenderText: FIT_GENDER_LABELS[fitGender] ?? fitGender,
    fitNotes: firstString(payload.fitNotes),
    priceText:
      typeof payload.price === "number" && Number.isFinite(payload.price)
        ? `¥${payload.price}`
        : "未记录价格",
    status: wishlistStatus(payload),
    statusText: wishlistStatusText(payload),
    imageUrl: await resolveImageUrl(entity, "imageDataUrl", payload),
    updatedAt: entity.updatedAt,
    evaluation,
    evaluationText:
      (
        {
          buy: "值得买",
          consider: "再看看",
          avoid: "不建议",
          unrated: "未评估",
        } as Record<string, string>
      )[evaluation] ?? evaluation,
    convertedAt: stringValue(payload.convertedAt, ""),
    convertedGarmentId: stringValue(payload.convertedGarmentId, ""),
  };
}

function toMiniClosetLocation(entity: WorkspaceEntity): MiniClosetLocation {
  const payload = entity.payload;
  const id = stringValue(payload.dexieId, entity.id);
  return {
    id,
    name: stringValue(payload.name, id === "home" ? "默认衣橱" : "未命名衣橱"),
    note: firstString(payload.note),
    sortOrder: safeNumber(payload.sortOrder) ?? 0,
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
    endDate: stringValue(
      payload.endDate,
      stringValue(payload.startDate, localDateKey()),
    ),
    tone: planTone(payload.tone, type),
    destination: firstString(payload.destination),
    activities: stringList(payload.activities).slice(0, 8),
    weatherNote: firstString(payload.weatherNote),
    notes: firstString(payload.notes),
    packingEnabled:
      typeof payload.packingEnabled === "boolean"
        ? payload.packingEnabled
        : type !== "custom",
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
    outfitId: firstString(payload.outfitId),
    sourceType: outfitPlanSourceType(payload.sourceType, payload.outfitId),
    garmentIds: stringList(payload.garmentIds),
    itemIds: numberList(payload.itemIds),
    garmentSnapshots: Array.isArray(payload.garmentSnapshots) ? payload.garmentSnapshots.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)) : [],
    actualGarmentIds: stringList(payload.actualGarmentIds),
    actualGarmentSnapshots: Array.isArray(payload.actualGarmentSnapshots) ? payload.actualGarmentSnapshots.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)) : [],
    unavailableGarmentIds: stringList(payload.unavailableGarmentIds),
    availability: payload.availability === "blocked" ? "blocked" : payload.availability === "historical" ? "historical" : "available",
    actualOutfitId: firstString(payload.actualOutfitId),
    calendarPlanId: firstString(payload.calendarPlanId, payload.tripPlanId),
    status: planEntryStatus(payload.status),
    title: firstString(payload.title),
    scene: firstString(payload.scene),
    weatherNote: firstString(payload.weatherNote),
    notes: firstString(payload.notes),
    isPrimary: payload.isPrimary === true,
    isPrimaryActual: payload.isPrimaryActual === true,
    role: outfitPlanRole(payload.role),
    sortOrder: numberValue(payload.sortOrder) ?? 9999,
    rawPayload: payload,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function outfitPlanSourceType(value: unknown, outfitId: unknown): MiniOutfitPlanEntry["sourceType"] {
  return value === "daily_recommendation" || value === "manual_items" || value === "saved_outfit" ? value : typeof outfitId === "string" && outfitId ? "saved_outfit" : "manual_items";
}

async function resolveImageUrl(
  entity: WorkspaceEntity,
  fieldName: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const downloaded = await downloadAssetImage(
    entity.assetRefs?.[fieldName],
    "thumbnail",
  );
  return (
    downloaded ||
    firstString(payload.thumbnailUrl, payload.imageUrl, payload.imageDataUrl)
  );
}

async function resolveInspirationImages(
  entity: WorkspaceEntity,
): Promise<
  Array<{ id: string; fieldName: string; imageUrl: string; caption: string }>
> {
  return resolvePayloadAssetImages(entity, "referenceOutfitImages");
}

async function resolvePayloadAssetImages(
  entity: WorkspaceEntity,
  payloadKey: string,
): Promise<
  Array<{ id: string; fieldName: string; imageUrl: string; caption: string }>
> {
  const entries = Array.isArray(entity.payload[payloadKey])
    ? (entity.payload[payloadKey] as unknown[])
    : [];
  return Promise.all(
    entries
      .flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const record = value as Record<string, unknown>;
        const id = firstString(record.id);
        const fieldName = firstString(record.fieldName);
        if (!id || !fieldName) return [];
        return [
          {
            id,
            fieldName,
            caption: firstString(record.caption),
            ref: entity.assetRefs?.[fieldName],
          },
        ];
      })
      .map(async (entry) => ({
        id: entry.id,
        fieldName: entry.fieldName,
        caption: entry.caption,
        imageUrl: await downloadAssetImage(entry.ref, "thumbnail"),
      })),
  );
}

function getApiBaseUrl(): string {
  const app = getApp<{ globalData?: { apiBaseUrl?: string } }>();
  return (app.globalData?.apiBaseUrl ?? "").replace(/\/$/, "");
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function firstString(...values: unknown[]): string {
  return (
    values.find(
      (value): value is string => typeof value === "string" && value.length > 0,
    ) ?? ""
  );
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === "number" && Number.isFinite(entry),
      )
    : [];
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

async function fetchAllWorkspaceEntities(resource: "garments" | "outfits" | "wishlist", limit: number): Promise<WorkspaceEntity[]> {
  const items: WorkspaceEntity[] = [];
  let cursor = "";
  let pageCount = 0;
  do {
    const query = `limit=${encodeURIComponent(String(limit))}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await workspaceRequest<WorkspaceListResponse>(
      `/api/workspace/${resource}?${query}`,
    );
    items.push(...(response.items ?? []));
    cursor = response.nextCursor ?? "";
    pageCount += 1;
    if (pageCount >= 1_000 && cursor) {
      throw new Error("云端列表分页异常，请稍后重试");
    }
  } while (cursor);
  return items;
}

function outfitItemImages(
  itemIds: number[],
  itemEntityIds: string[],
  garments: MiniGarment[],
): string[] {
  const byLegacy = new Map(
    garments.map((garment) => [garment.legacyItemId, garment]),
  );
  const byEntity = new Map(garments.map((garment) => [garment.id, garment]));
  return [
    ...itemIds.map((id) => byLegacy.get(id)?.imageUrl),
    ...itemEntityIds.map((id) => byEntity.get(id)?.imageUrl),
  ]
    .filter(isNonEmptyString)
    .slice(0, 4);
}

function formatColors(value: unknown): string {
  if (Array.isArray(value))
    return value.filter(isNonEmptyString).slice(0, 3).join(" / ") || "未标注";
  if (!value || typeof value !== "object") return "未标注";

  const colors = value as Record<string, unknown>;
  if (colors.mode === "single") return stringValue(colors.primary, "未标注");
  if (colors.mode === "main_with_accent")
    return (
      [colors.primary, ...(Array.isArray(colors.accents) ? colors.accents : [])]
        .filter(isNonEmptyString)
        .slice(0, 3)
        .join(" / ") || "未标注"
    );
  if (colors.mode === "multicolor")
    return (
      (Array.isArray(colors.primaries) ? colors.primaries : [])
        .filter(isNonEmptyString)
        .slice(0, 3)
        .join(" / ") || "多色"
    );
  return "未标注";
}

function parseColorParts(value: unknown): {
  mode: string;
  primary: string[];
  accent: string[];
} {
  if (Array.isArray(value))
    return {
      mode: "single",
      primary: value.filter(isNonEmptyString).slice(0, 1),
      accent: value.filter(isNonEmptyString).slice(1),
    };
  if (!value || typeof value !== "object")
    return { mode: "single", primary: [], accent: [] };
  const colors = value as Record<string, unknown>;
  const mode = stringValue(colors.mode, "single");
  if (mode === "main_with_accent")
    return {
      mode,
      primary: [colors.primary].filter(isNonEmptyString),
      accent: stringList(colors.accents),
    };
  if (mode === "multicolor")
    return {
      mode,
      primary: stringList(colors.primaries),
      accent: stringList(colors.accents),
    };
  return {
    mode,
    primary: [colors.primary].filter(isNonEmptyString),
    accent: stringList(colors.accents),
  };
}

function formatSeasons(value: unknown): string {
  if (!Array.isArray(value)) return "未标注";
  return (
    value
      .filter(isNonEmptyString)
      .map((season) => MINI_SEASON_LABELS[season] ?? season)
      .slice(0, 4)
      .join(" / ") || "未标注"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function colorList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(isNonEmptyString);
  if (!value || typeof value !== "object") return [];
  const colors = value as Record<string, unknown>;
  if (colors.mode === "single")
    return [colors.primary].filter(isNonEmptyString);
  if (colors.mode === "main_with_accent")
    return [colors.primary, ...stringList(colors.accents)].filter(
      isNonEmptyString,
    );
  if (colors.mode === "multicolor") return stringList(colors.primaries);
  return [];
}

function toCardColor(name: string): {
  name: string;
  swatch: string;
  needsBorder: boolean;
} {
  const normalized = name.endsWith("色") ? name.slice(0, -1) : name;
  const swatch = MINI_COLOR_SWATCHES[name] ?? MINI_COLOR_SWATCHES[normalized];
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
  return dateText
    ? `最近 ${dateText} · 穿过 ${dates.length} 次`
    : `穿过 ${dates.length} 次`;
}

function garmentStatusText(value: unknown): string {
  const status =
    value === "inactive"
      ? "archived"
      : typeof value === "string"
        ? value
        : "active";
  return (
    MINI_GARMENT_STATUS_LABELS[status] ??
    MINI_GARMENT_STATUS_LABELS.active ??
    status
  );
}

function locationText(value: unknown): string {
  if (value === "home") return "默认衣橱";
  return stringValue(value, "默认衣橱");
}

function scoreText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}/5`
    : "未识别";
}

function temperatureText(value: unknown): string {
  const { minC: min, maxC: max } = normalizeTemperatureRange(value);
  if (min !== undefined && max !== undefined) return `${min}℃ - ${max}℃`;
  if (min !== undefined) return `${min}℃以上`;
  if (max !== undefined) return `${max}℃以下`;
  return "未识别";
}

function normalizeTemperatureRange(value: unknown): {
  minC?: number;
  maxC?: number;
} {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const minC =
    typeof record.minC === "number"
      ? record.minC
      : typeof record.min === "number"
        ? record.min
        : undefined;
  const maxC =
    typeof record.maxC === "number"
      ? record.maxC
      : typeof record.max === "number"
        ? record.max
        : undefined;
  return {
    ...(minC !== undefined ? { minC } : {}),
    ...(maxC !== undefined ? { maxC } : {}),
  };
}

function fitText(payload: Record<string, unknown>): string {
  return (
    [
      FIT_GENDER_LABELS[firstString(payload.fitGender, payload.fit)] ??
        firstString(payload.fitGender, payload.fit),
      firstString(payload.fitNotes),
    ]
      .filter(Boolean)
      .join(" · ") || "未记录"
  );
}

function wishlistStatusText(value: unknown): string {
  if (value && typeof value === "object")
    return wishlistStatusText(wishlistStatus(value as Record<string, unknown>));
  const status = typeof value === "string" ? value : "interested";
  return (
    MINI_WISHLIST_STATUS_LABELS[status] ??
    MINI_WISHLIST_STATUS_LABELS.interested ??
    status
  );
}

function wishlistStatus(
  payload: Record<string, unknown>,
): "interested" | "purchased" | "rejected" | "archived" {
  if (
    payload.status === "purchased" ||
    payload.purchased === true ||
    typeof payload.convertedItemId === "number" ||
    isNonEmptyString(payload.convertedAt)
  )
    return "purchased";
  if (payload.status === "rejected") return "rejected";
  if (payload.status === "archived") return "archived";
  return "interested";
}

function planType(value: unknown): MiniCalendarPlanType {
  return value === "travel" || value === "business" || value === "custom"
    ? value
    : "custom";
}

function planTone(
  value: unknown,
  type: MiniCalendarPlanType,
): MiniCalendarPlanTone {
  if (
    typeof value === "string" &&
    PLAN_TONES.has(value as MiniCalendarPlanTone)
  )
    return value as MiniCalendarPlanTone;
  if (type === "travel") return "clay";
  if (type === "business") return "moss";
  return "denim";
}

function planEntryStatus(value: unknown): MiniOutfitPlanEntryStatus {
  if (value === "worn" || value === "skipped" || value === "changed")
    return value;
  return "planned";
}

function outfitPlanRole(value: unknown): "primary" | "backup" | "other" {
  if (value === "primary" || value === "backup") return value;
  return "other";
}

function defaultPlanTitle(type: MiniCalendarPlanType): string {
  if (type === "travel") return "未命名旅行";
  if (type === "business") return "未命名出差";
  return "未命名计划";
}

function localDateKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
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
  for (const char of value)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return Math.abs(hash) || 1;
}
