import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import packageJson from "../../package.json";
import type { AppRoute } from "@/lib/app-route";
import { routeToDebugLabel } from "@/lib/app-route";
import type { BackfillState } from "@/lib/thumbnail-backfill";
import type { ClosetLocation, SavedOutfit, WardrobeItem, WishlistItem } from "@/lib/types";
import { getGarmentCardColors, getColorSwatchStyle } from "@/lib/catalog-card-format";
import { getAllColors } from "@/lib/color-fields";

const DIAGNOSTIC_LOG_FOLDER = "WardrobeLogs";
const DIAGNOSTIC_LOG_FOLDER_LABEL = "Documents/WardrobeLogs";
const MAX_EVENTS = 300;
const MAX_LOG_ITEMS = 200;
const MAX_LOG_OUTFITS = 120;
const MAX_LOG_WISHLIST = 120;

export interface DiagnosticEvent {
  ts: string;
  type: string;
  detail?: unknown;
}

export interface DiagnosticExportResult {
  fileName: string;
  path: string;
  directoryLabel: string;
  mode: "native" | "download";
  uri?: string;
}

export interface BuildDiagnosticLogInput {
  activeView: string;
  route: AppRoute;
  items: WardrobeItem[];
  locations: ClosetLocation[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  backfillState: BackfillState;
  miniMaxSettings: {
    apiHost?: string;
    model?: string;
    fallbackModel?: string;
    apiKey?: string;
  };
}

const diagnosticEvents: DiagnosticEvent[] = [];

export function recordDiagnosticEvent(type: string, detail?: unknown): void {
  diagnosticEvents.push({
    ts: new Date().toISOString(),
    type,
    detail: sanitizeValue(detail),
  });
  if (diagnosticEvents.length > MAX_EVENTS) {
    diagnosticEvents.splice(0, diagnosticEvents.length - MAX_EVENTS);
  }
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return diagnosticEvents.map((event) => ({ ...event, detail: sanitizeValue(event.detail) }));
}

export function buildWardrobeDiagnosticLog(input: BuildDiagnosticLogInput) {
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
    exportedAt: new Date().toISOString(),
    app: {
      name: packageJson.name,
      version: packageJson.version,
      capacitorPlatform: Capacitor.getPlatform(),
      nativePlatform: Capacitor.isNativePlatform(),
    },
    environment: getEnvironmentSnapshot(),
    navigation: {
      activeView: input.activeView,
      route: input.route,
      routeLabel: routeToDebugLabel(input.route),
    },
    miniMax: {
      hasKey: Boolean(input.miniMaxSettings.apiKey?.trim()),
      apiHost: input.miniMaxSettings.apiHost,
      model: input.miniMaxSettings.model,
      fallbackModel: input.miniMaxSettings.fallbackModel,
    },
    counts: {
      items: input.items.length,
      locations: input.locations.length,
      outfits: input.outfits.length,
      wishlistItems: input.wishlistItems.length,
    },
    thumbnailBackfill: sanitizeValue(input.backfillState),
    locations: input.locations.map((location) => ({
      id: location.id,
      name: location.name,
      sortOrder: location.sortOrder,
      updatedAt: location.updatedAt,
    })),
    items,
    itemsTruncated: input.items.length > items.length,
    outfits,
    outfitsTruncated: input.outfits.length > outfits.length,
    wishlistItems,
    wishlistTruncated: input.wishlistItems.length > wishlistItems.length,
    recentEvents: getDiagnosticEvents(),
  };
}

export async function exportWardrobeDiagnosticLog(input: BuildDiagnosticLogInput): Promise<DiagnosticExportResult> {
  const log = buildWardrobeDiagnosticLog(input);
  const fileName = getDiagnosticFileName(log.exportedAt);
  const data = JSON.stringify(log, null, 2);

  if (!Capacitor.isNativePlatform()) {
    downloadJson(data, fileName);
    return {
      fileName,
      path: fileName,
      directoryLabel: "浏览器下载目录",
      mode: "download",
    };
  }

  await Filesystem.mkdir({
    path: DIAGNOSTIC_LOG_FOLDER,
    directory: Directory.Documents,
    recursive: true,
  }).catch(() => {});

  const path = `${DIAGNOSTIC_LOG_FOLDER}/${fileName}`;
  const result = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  return {
    fileName,
    path,
    uri: result.uri,
    directoryLabel: DIAGNOSTIC_LOG_FOLDER_LABEL,
    mode: "native",
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
    sourceImage: summarizeImageDataUrl(item.sourceImageDataUrl),
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

function getDiagnosticFileName(exportedAt: string): string {
  const stamp = exportedAt.replaceAll(":", "-").replaceAll(".", "-").replace("T", "-").replace("Z", "");
  return `wardrobe-log-${stamp}.json`;
}

function downloadJson(data: string, fileName: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([data], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeValue(value: unknown, key = "", depth = 0): unknown {
  if (/api[-_ ]?key|token|secret|password/i.test(key)) return "[redacted]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return summarizeImageDataUrl(value);
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
