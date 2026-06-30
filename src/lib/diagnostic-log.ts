import { Capacitor } from "@capacitor/core";
import packageJson from "../../package.json";
import type { AppRoute } from "@/lib/app-route";
import { routeToDebugLabel } from "@/lib/app-route";
import type { ClosetLocation, SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { getGarmentCardColors, getColorSwatchStyle } from "@/lib/catalog-card-format";
import { getAllColors } from "@/lib/color-fields";

const MAX_EVENTS = 1000;
const MAX_LOG_ITEMS = 200;
const MAX_LOG_OUTFITS = 120;
const MAX_LOG_WISHLIST = 120;

export interface DiagnosticEvent {
  eventId: string;
  occurredAt: string;
  monotonicMs?: number;
  category:
    | "ui"
    | "navigation"
    | "lifecycle"
    | "local_data"
    | "connectivity"
    | "network"
    | "auth"
    | "workspace"
    | "sync"
    | "asset"
    | "ai"
    | "diagnostic"
    | "error";
  name: string;
  phase?: "started" | "succeeded" | "failed" | "cancelled" | "changed" | "scheduled";
  severity: "debug" | "info" | "warning" | "error";
  route?: string;
  view?: string;
  requestId?: string;
  operationId?: string;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  transport?: "fetch" | "capacitor_http" | "cos_direct";
  httpStatus?: number;
  errorCode?: string;
  durationMs?: number;
  attempt?: number;
  retryAfterMs?: number;
  connectivityBefore?: string;
  connectivityAfter?: string;
  metadata?: Record<string, unknown>;
}

export interface ClientBuildIdentity {
  appVersion: string;
  versionCode: number;
  gitCommit: string;
  gitCommitShort: string;
  buildTime: string;
  buildChannel: "internal" | "release";
  repository: string;
}

export interface BuildDiagnosticLogInput {
  activeView: string;
  route: AppRoute;
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  backfillState?: unknown;
  miniMaxSettings: {
    apiHost?: string;
    model?: string;
    fallbackModel?: string;
    apiKey?: string;
  };
  assetDiagnostics?: unknown;
}

export interface RemoteDiagnosticPayload {
  schemaVersion: number;
  generatedAt: string;
  clientRequestId: string;
  build: ClientBuildIdentity;
  userReport: { description: string | null };
  app: { name: string; capacitorPlatform: string; nativePlatform: boolean };
  environment: Record<string, unknown>;
  navigation: { activeView: string; route: AppRoute; routeLabel: string };
  network: Record<string, unknown>;
  server: Record<string, unknown>;
  auth: Record<string, unknown>;
  workspace: Record<string, unknown>;
  sync: Record<string, unknown>;
  assets: Record<string, unknown>;
  counts: { items: number; locations: number; outfits: number; wishlistItems: number };
  thumbnailBackfill: unknown;
  locations: Array<{ id: string; name: string; sortOrder: number; updatedAt: string }>;
  items: unknown[];
  outfits: unknown[];
  wishlistItems: unknown[];
  recentEvents: DiagnosticEvent[];
}

export type DiagnosticUploadState =
  | { phase: "idle" }
  | { phase: "describing"; message: "请描述遇到的问题…"; problemDescription: string }
  | { phase: "building"; message: "正在整理诊断数据…"; problemDescription: string | null }
  | { phase: "authorizing"; message: "正在创建诊断工单…"; problemDescription: string | null }
  | { phase: "uploading"; message: "正在上传诊断数据…"; caseId: string; problemDescription: string | null }
  | { phase: "confirming"; message: "正在确认上传结果…"; caseId: string; problemDescription: string | null }
  | {
      phase: "success";
      message: "上传成功";
      caseId: string;
      uploadedAt: string;
      expiresAt: string;
      appVersion: string;
      gitCommitShort: string;
    }
  | {
      phase: "failed";
      stage: "build" | "authorize" | "upload" | "confirm";
      caseId?: string;
      errorCode: string;
      message: string;
      problemDescription: string | null;
    };

export interface LastDiagnosticUpload {
  caseId: string;
  uploadedAt: string;
  appVersion: string;
  gitCommitShort: string;
}

let eventIdCounter = 0;
const diagnosticEvents: DiagnosticEvent[] = [];

function generateEventId(): string {
  return `${Date.now().toString(36)}-${++eventIdCounter}`;
}

export function recordDiagnosticEvent(
  typeOrCategory: string,
  nameOrDetail?: string | Record<string, unknown>,
  detail?: Omit<Partial<DiagnosticEvent>, "category" | "name">,
): void {
  // 兼容旧调用方式: recordDiagnosticEvent("diagnostic_export_started", { activeView, route })
  if (typeof nameOrDetail === "object" || nameOrDetail === undefined) {
    const event: DiagnosticEvent = {
      eventId: generateEventId(),
      occurredAt: new Date().toISOString(),
      category: "diagnostic",
      name: typeOrCategory,
      severity: "info",
      metadata: nameOrDetail,
    };
    diagnosticEvents.push(event);
    trimEvents();
    return;
  }

  // 新调用方式: recordDiagnosticEvent("ui", "button_clicked", { ... })
  const event: DiagnosticEvent = {
    eventId: generateEventId(),
    occurredAt: new Date().toISOString(),
    category: typeOrCategory as DiagnosticEvent["category"],
    name: nameOrDetail,
    severity: "info",
    ...detail,
  };
  diagnosticEvents.push(event);
  trimEvents();
}

function trimEvents(): void {
  if (diagnosticEvents.length <= MAX_EVENTS) return;
  // 优先删除最早的 debug/info，保留 warning/error
  const toDelete = diagnosticEvents.length - MAX_EVENTS;
  let deleted = 0;
  for (let i = 0; i < diagnosticEvents.length && deleted < toDelete; i++) {
    if (diagnosticEvents[i].severity === "debug" || diagnosticEvents[i].severity === "info") {
      diagnosticEvents.splice(i, 1);
      i--;
      deleted++;
    }
  }
  // 如果还不够，删除最早的任何事件
  if (diagnosticEvents.length > MAX_EVENTS) {
    diagnosticEvents.splice(0, diagnosticEvents.length - MAX_EVENTS);
  }
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return diagnosticEvents.map((event) => ({
    ...event,
    metadata: event.metadata ? (sanitizeValue(event.metadata) as Record<string, unknown>) : undefined,
  }));
}

export function getClientBuildIdentity(): ClientBuildIdentity {
  return {
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version,
    versionCode: Number(process.env.NEXT_PUBLIC_VERSION_CODE ?? 0),
    gitCommit: process.env.NEXT_PUBLIC_GIT_COMMIT ?? "",
    gitCommitShort: process.env.NEXT_PUBLIC_GIT_COMMIT_SHORT ?? "",
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
    buildChannel: (process.env.NEXT_PUBLIC_BUILD_CHANNEL as "internal" | "release") ?? "internal",
    repository: process.env.NEXT_PUBLIC_REPOSITORY ?? "Akira362680164/wardrobe-outfit-pwa",
  };
}

export function buildWardrobeDiagnosticLog(input: BuildDiagnosticLogInput): RemoteDiagnosticPayload {
  const build = getClientBuildIdentity();

  const items = input.items.slice(0, MAX_LOG_ITEMS).map(summarizeItem);
  const outfits = input.outfits.slice(0, MAX_LOG_OUTFITS).map((outfit) => ({
    id: outfit.id,
    name: outfit.name,
    itemIds: outfit.itemIds,
    source: outfit.source,
    favorite: outfit.favorite,
    updatedAt: outfit.updatedAt,
  }));
  const wishlistItems = input.wishlistItems.slice(0, MAX_LOG_WISHLIST).map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    category: item.category,
    colors: item.colors,
    cardColors: getAllColors(item.colors),
    convertedItemId: item.convertedItemId,
    image: summarizeImageDataUrl(item.imageDataUrl),
    sourceImage: summarizeImageDataUrl(item.sourceImageDataUrl),
    thumbnailStatus: (item as WishlistItem & { thumbnailStatus?: string }).thumbnailStatus,
    updatedAt: item.updatedAt,
  }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    clientRequestId: generateClientRequestId(),
    build,
    userReport: {
      description: null as string | null,
    },
    app: {
      name: packageJson.name,
      capacitorPlatform: Capacitor.getPlatform(),
      nativePlatform: Capacitor.isNativePlatform(),
    },
    environment: getEnvironmentSnapshot(),
    navigation: {
      activeView: input.activeView,
      route: input.route,
      routeLabel: routeToDebugLabel(input.route),
    },
    network: getNetworkSnapshot(),
    server: getServerSnapshot(),
    auth: getAuthSnapshot(),
    workspace: getWorkspaceSnapshot(),
    sync: getSyncSnapshot(),
    assets: getAssetSnapshot(input.assetDiagnostics),
    counts: {
      items: input.items.length,
      locations: input.locations.length,
      outfits: input.outfits.length,
      wishlistItems: input.wishlistItems.length,
    },
    thumbnailBackfill: sanitizeValue(input.backfillState ?? { enabled: false }),
    locations: input.locations.map((location) => ({
      id: location.id,
      name: location.name,
      sortOrder: location.sortOrder,
      updatedAt: location.updatedAt,
    })),
    items,
    outfits,
    wishlistItems,
    recentEvents: getDiagnosticEvents(),
  };
}

export function summarizeImageDataUrl(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) {
    return { present: false };
  }
  const mime = /^data:([^;,]+)/i.exec(value)?.[1]?.toLowerCase() ?? "unknown";
  return {
    present: true,
    mime,
    length: value.length,
    isSvg: mime === "image/svg+xml",
    isHeic: mime === "image/heic" || mime === "image/heif",
    isWebp: mime === "image/webp",
    isJpeg: mime === "image/jpeg" || mime === "image/jpg",
    isPng: mime === "image/png",
    fingerprint: fingerprintString(value),
  };
}

function summarizeItem(item: WardrobeItem) {
  const cardColors = getGarmentCardColors(item);
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    status: item.status,
    locationId: item.locationId,
    colorMode: item.colors.mode,
    rawColors: item.colors,
    cardColors,
    cardSwatches: cardColors.map((color) => ({ color, ...getColorSwatchStyle(color) })),
    image: summarizeImageDataUrl(item.imageDataUrl),
    thumbnail: summarizeImageDataUrl(item.thumbnailDataUrl),
    thumbnailStatus: item.thumbnailStatus,
    thumbnailVersion: item.thumbnailVersion,
    cropBox: item.cropBox,
    referenceImages: (item.referenceOutfitImages ?? []).map((ref) => ({
      id: ref.id,
      caption: ref.caption,
      image: summarizeImageDataUrl(ref.imageDataUrl),
      sourceImage: summarizeImageDataUrl(ref.sourceImageDataUrl),
      thumbnail: summarizeImageDataUrl(ref.thumbnailDataUrl),
      thumbnailStatus: ref.thumbnailStatus,
      thumbnailVersion: ref.thumbnailVersion,
      cropBox: ref.cropBox,
      updatedAt: ref.updatedAt,
    })),
    updatedAt: item.updatedAt,
  };
}

function getEnvironmentSnapshot() {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const win = typeof window !== "undefined" ? window : null;
  const vv = win?.visualViewport;
  return {
    userAgent: nav?.userAgent,
    platform: nav?.platform,
    language: nav?.language,
    viewport: win ? { width: win.innerWidth, height: win.innerHeight, devicePixelRatio: win.devicePixelRatio } : null,
    visualViewport: vv ? { width: vv.width, height: vv.height, scale: vv.scale } : null,
  };
}

function getNetworkSnapshot() {
  return {
    browserOnline: typeof navigator !== "undefined" ? navigator.onLine : null,
    systemNetworkConnected: null as boolean | null,
    connectivityState: "unknown" as string,
    transport: "fetch" as "fetch" | "capacitor_http" | "mixed",
    apiHostLabel: "default",
    recentRequestCount: 0,
    recentFailureCount: 0,
    recentTimeoutCount: 0,
    recentRetryCount: 0,
  };
}

function getServerSnapshot() {
  return {
    apiVersion: undefined as string | undefined,
    apiGitCommit: undefined as string | undefined,
    apiEnvironment: undefined as string | undefined,
    lastKnownHealth: "unknown" as "ok" | "failed" | "unknown",
    lastKnownReady: "unknown" as "ok" | "failed" | "unknown",
    lastServerTime: undefined as string | undefined,
  };
}

function getAuthSnapshot() {
  return {
    phase: "unknown",
    authenticated: false,
    hasCachedSession: false,
    hasAccessToken: false,
    hasRefreshToken: false,
  };
}

function getWorkspaceSnapshot() {
  return {
    status: "unknown",
    activeWorkspacePresent: false,
    bootstrapCompleted: false,
  };
}

function getSyncSnapshot() {
  return {
    enabled: false,
    status: "unknown",
    pendingMutationCount: 0,
    pushingMutationCount: 0,
    failedMutationCount: 0,
    conflictCount: 0,
  };
}

function getAssetSnapshot(assetDiagnostics?: unknown) {
  if (assetDiagnostics) return sanitizeValue(assetDiagnostics) as Record<string, unknown>;
  return {
    available: false,
    pendingUploadCount: 0,
    failedUploadCount: 0,
  };
}

function generateClientRequestId(): string {
  return crypto.randomUUID();
}

export function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  const sensitiveKeyPattern = /api[-_ ]?key|token|secret|password|authorization|cookie|jwt|refresh/i;
  if (sensitiveKeyPattern.test(key)) return "[redacted]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return summarizeImageDataUrl(value);
    if (/^Bearer\s+/i.test(value)) return "[redacted:bearer]";
    if (/^eyJ[\w-]*\.eyJ[\w-]*\.[\w-]*$/i.test(value)) return "[redacted:jwt]";
    if (/^\+?\d{10,15}$/.test(value)) return value.slice(0, 3) + "****" + value.slice(-4);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      const [local, domain] = value.split("@");
      return local.slice(0, 2) + "***@" + domain;
    }
    const urlPattern = /^(https?:\/\/[^?]+)\??(.*)$/i;
    const urlMatch = urlPattern.exec(value);
    if (urlMatch && urlMatch[2]) {
      const params = new URLSearchParams(urlMatch[2]);
      for (const [pKey] of params) {
        if (/token|key|secret|code/i.test(pKey)) {
          params.set(pKey, "[redacted]");
        }
      }
      return urlMatch[1] + "?" + params.toString();
    }
    // 遮盖文件系统路径中的用户主目录
    if (value.startsWith("/Users/") || value.startsWith("/home/")) {
      return value.replace(/^(\/Users\/[^/]+|\/home\/[^/]+)/, "[home]");
    }
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (depth > 5) return "[max-depth]";
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeValue(item, key, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      out[entryKey] = sanitizeValue(entryValue, entryKey, depth + 1);
    }
    return out;
  }
  return String(value);
}

function fingerprintString(value: string): string {
  const sample = value.length <= 1024 ? value : `${value.slice(0, 512)}${value.slice(-512)}`;
  let hash = 2166136261;
  for (let i = 0; i < sample.length; i++) {
    hash ^= sample.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
