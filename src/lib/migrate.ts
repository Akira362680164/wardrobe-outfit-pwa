import type {
  ColorInfo,
  GarmentCategory,
  GarmentFitGender,
  GarmentStatus,
  GarmentStyle,
  GarmentStyleAdvice,
  OutfitAiSuggestion,
  OutfitCalendarPlan,
  OutfitCalendarPlanTone,
  OutfitCalendarPlanType,
  OutfitPlanEntry,
  OutfitPlanEntryRole,
  OutfitPlanEntryStatus,
  OutfitRealImage,
  OutfitWearOrigin,
  PlanPackingChecklistItem,
  PlanPackingChecklistSource,
  ReferenceOutfitImage,
  SavedOutfit,
  Season,
  TemperatureRange,
  ThumbnailStatus,
  WardrobeItem,
  WishlistAssessment,
  WishlistItem,
  WishlistStatus,
  WishlistVerdict,
} from "@/lib/types";
import { FIT_NOTES_MAX_LEN } from "@/lib/types";
import { GARMENT_CATEGORY_CATALOG, getCategoryGroupById, mapLegacyCategoryToCatalogGroup } from "@/lib/garment-category-catalog";
import { migrateLegacyColorFields } from "@/lib/color-fields";
import { sanitizeWornDates } from "@/lib/wear-records";

const THUMBNAIL_STATUS_VALUES: ThumbnailStatus[] = ["ready", "missing", "failed"];

function isThumbnailStatus(v: unknown): v is ThumbnailStatus {
  return typeof v === "string" && (THUMBNAIL_STATUS_VALUES as string[]).includes(v);
}

function sanitizeThumbnailStatus(v: unknown): ThumbnailStatus | undefined {
  return isThumbnailStatus(v) ? v : undefined;
}

const MAX_SUMMARY = 60;
const MAX_SCENES = 3;
const MAX_PAIRING_TIPS = 3;
const MAX_AVOID_TIPS = 2;
const MAX_TIP_LEN = 40;

function sanitizeGarmentStyleAdvice(v: unknown): GarmentStyleAdvice | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.slice(0, MAX_SUMMARY) : "";
  if (!summary) return undefined;
  const scenes = Array.isArray(o.scenes)
    ? o.scenes.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, MAX_SCENES)
    : [];
  const pairingTips = Array.isArray(o.pairingTips)
    ? o.pairingTips.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.slice(0, MAX_TIP_LEN)).slice(0, MAX_PAIRING_TIPS)
    : [];
  const avoidTips = Array.isArray(o.avoidTips)
    ? o.avoidTips.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.slice(0, MAX_TIP_LEN)).slice(0, MAX_AVOID_TIPS)
    : [];
  const generatedAt = typeof o.generatedAt === "string" && o.generatedAt ? o.generatedAt : new Date().toISOString();
  return { summary, scenes, pairingTips, avoidTips, generatedAt };
}

const CATEGORY_VALUES: GarmentCategory[] = [
  "tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "jewelry", "accessories",
];

const SEASON_VALUES: Season[] = ["spring", "summer", "autumn", "winter", "all"];

const STYLE_VALUES: GarmentStyle[] = [
  "casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation",
];

const STATUS_VALUES: GarmentStatus[] = ["active", "laundry", "repair", "archived"];

const FIT_GENDER_VALUES: GarmentFitGender[] = ["menswear", "womenswear", "unisex", "unknown"];

function isFitGender(v: unknown): v is GarmentFitGender {
  return typeof v === "string" && (FIT_GENDER_VALUES as string[]).includes(v);
}

function sanitizeFitNotes(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  return trimmed.length > FIT_NOTES_MAX_LEN ? trimmed.slice(0, FIT_NOTES_MAX_LEN) : trimmed;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isCategory(v: unknown): v is GarmentCategory {
  return typeof v === "string" && (CATEGORY_VALUES as string[]).includes(v);
}

function isSeason(v: unknown): v is Season {
  return typeof v === "string" && (SEASON_VALUES as string[]).includes(v);
}

function isStyle(v: unknown): v is GarmentStyle {
  return typeof v === "string" && (STYLE_VALUES as string[]).includes(v);
}

function isStatus(v: unknown): v is GarmentStatus {
  return typeof v === "string" && (STATUS_VALUES as string[]).includes(v);
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isString) : [];
}

function isCropBox(v: unknown): v is WardrobeItem["cropBox"] {
  if (typeof v !== "object" || v === null) return false;
  const box = v as Record<string, unknown>;
  return (
    typeof box.x === "number" &&
    typeof box.y === "number" &&
    typeof box.width === "number" &&
    typeof box.height === "number"
  );
}

function sanitizeReferenceOutfitImages(v: unknown): ReferenceOutfitImage[] {
  if (!Array.isArray(v)) return [];
  const now = new Date().toISOString();
  const result: ReferenceOutfitImage[] = [];
  v.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) return;
    const obj = entry as Record<string, unknown>;
    const imageDataUrl = typeof obj.imageDataUrl === "string" ? obj.imageDataUrl : "";
    if (!imageDataUrl) return;
    const id = typeof obj.id === "string" && obj.id ? obj.id : `ref-${index}-${Math.random().toString(36).slice(2, 8)}`;
    const sourceImageDataUrl = typeof obj.sourceImageDataUrl === "string" ? obj.sourceImageDataUrl : undefined;
    const cropBox = isCropBox(obj.cropBox) ? obj.cropBox : undefined;
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : now;
    const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : createdAt;
    const thumbnailDataUrl = typeof obj.thumbnailDataUrl === "string" ? obj.thumbnailDataUrl : undefined;
    const thumbnailVersion = typeof obj.thumbnailVersion === "number" ? obj.thumbnailVersion : undefined;
    const thumbnailUpdatedAt = typeof obj.thumbnailUpdatedAt === "string" ? obj.thumbnailUpdatedAt : undefined;
    const thumbnailStatus = sanitizeThumbnailStatus(obj.thumbnailStatus);
    const caption = typeof obj.caption === "string" && obj.caption.trim() ? obj.caption.trim() : undefined;
    const ref: ReferenceOutfitImage = {
      id, imageDataUrl, sourceImageDataUrl, cropBox, caption, createdAt, updatedAt,
      ...(thumbnailDataUrl !== undefined ? { thumbnailDataUrl } : {}),
      ...(thumbnailVersion !== undefined ? { thumbnailVersion } : {}),
      ...(thumbnailUpdatedAt !== undefined ? { thumbnailUpdatedAt } : {}),
      ...(thumbnailStatus !== undefined ? { thumbnailStatus } : {}),
    };
    result.push(ref);
  });
  return result;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeTemperatureRange(input: unknown): TemperatureRange | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const minC = typeof o.minC === "number" && Number.isFinite(o.minC) ? o.minC : undefined;
  const maxC = typeof o.maxC === "number" && Number.isFinite(o.maxC) ? o.maxC : undefined;
  if (minC === undefined && maxC === undefined) return undefined;
  return { ...(minC !== undefined ? { minC } : {}), ...(maxC !== undefined ? { maxC } : {}) };
}

/**
 * v2: 把任意 input.colors 形态归一为合法 ColorInfo。
 *  - 若已是 ColorInfo 形态（包含 mode 字段），直接清洗
 *  - 若是老格式（5 字段）则走 migrateLegacyColorFields 兜底
 */
function sanitizeColorInfo(input: unknown, legacy: {
  colorMode?: unknown;
  mainColor?: unknown;
  accentColors?: unknown;
  primaryColors?: unknown;
  secondaryColors?: unknown;
  colors?: unknown;
}): ColorInfo {
  if (input && typeof input === "object" && "mode" in input) {
    const o = input as Record<string, unknown>;
    if (o.mode === "single") {
      const primary = typeof o.primary === "string" ? o.primary.trim() : "";
      return { mode: "single", primary };
    }
    if (o.mode === "main_with_accent") {
      const primary = typeof o.primary === "string" ? o.primary.trim() : "";
      const accents = Array.isArray(o.accents)
        ? o.accents.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
        : [];
      return { mode: "main_with_accent", primary, accents };
    }
    if (o.mode === "multicolor") {
      const primaries = Array.isArray(o.primaries)
        ? o.primaries.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
        : [];
      return { mode: "multicolor", primaries };
    }
  }
  return migrateLegacyColorFields(legacy);
}

/**
 * v2: 把 free-form 中文 subcategory（如"百褶裙"）反查到对应 catalog id。
 * 命中返回 id；不命中返回 undefined（用户走重新识别 / 手动选）。
 */
function reverseLookupSubcategory(groupId: string | undefined, raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // 已经是 id？
  for (const group of GARMENT_CATEGORY_CATALOG) {
    if (group.subcategories.some((s) => s.id === trimmed)) return trimmed;
  }
  // 给定 group 内 label 反查
  const group = groupId ? getCategoryGroupById(groupId) : undefined;
  if (group) {
    const hit = group.subcategories.find((s) => s.label === trimmed);
    if (hit) return hit.id;
  }
  // 跨 group label 反查兜底
  for (const g of GARMENT_CATEGORY_CATALOG) {
    const hit = g.subcategories.find((s) => s.label === trimmed);
    if (hit) return hit.id;
  }
  return undefined;
}

function sanitizeCategory(raw: unknown): GarmentCategory {
  if (typeof raw === "string") {
    if (isCategory(raw)) return raw;
    const mapped = mapLegacyCategoryToCatalogGroup(raw);
    if (mapped && isCategory(mapped)) return mapped;
    if (typeof console !== "undefined") {
      console.warn("[migrate] item.category not recognized, fallback to 'tops':", raw);
    }
  }
  return "tops";
}

export function migrateItemRecord(input: unknown): WardrobeItem {
  const item = (input ?? {}) as Partial<WardrobeItem> & Record<string, unknown>;
  const now = new Date().toISOString();
  const category = sanitizeCategory(item.category);

  const colors = sanitizeColorInfo((item as Record<string, unknown>).colors, {
    colorMode: (item as Record<string, unknown>).colorMode,
    mainColor: (item as Record<string, unknown>).mainColor,
    accentColors: (item as Record<string, unknown>).accentColors,
    primaryColors: (item as Record<string, unknown>).primaryColors,
    secondaryColors: (item as Record<string, unknown>).secondaryColors,
    colors: (item as Record<string, unknown>).colors,
  });

  const subcategory = reverseLookupSubcategory(category, item.subcategory);
  const priceLegacy = (item as Record<string, unknown>).purchasePrice;
  const price = typeof item.price === "number" && Number.isFinite(item.price)
    ? item.price
    : typeof priceLegacy === "number" && Number.isFinite(priceLegacy)
      ? priceLegacy
      : undefined;

  return {
    id: typeof item.id === "number" ? item.id : undefined,
    name: typeof item.name === "string" && item.name.trim() ? item.name : "未命名衣物",
    imageDataUrl: typeof item.imageDataUrl === "string" ? item.imageDataUrl : "",
    sourceImageDataUrl: typeof item.sourceImageDataUrl === "string" ? item.sourceImageDataUrl : undefined,
    cropBox: isCropBox(item.cropBox) ? item.cropBox : undefined,
    category,
    subcategory,
    colors,
    seasons: Array.isArray(item.seasons) ? item.seasons.filter(isSeason) : [],
    styles: Array.isArray(item.styles) ? item.styles.filter(isStyle) : [],
    formality: clampNumber(item.formality, 3, 1, 5),
    warmth: clampNumber(item.warmth, 3, 1, 5),
    locationId: typeof item.locationId === "string" && item.locationId ? item.locationId : "home",
    status: isStatus(item.status) ? item.status : "active",
    notes: typeof item.notes === "string" && item.notes.trim() ? item.notes : undefined,
    aiConfidence: typeof item.aiConfidence === "number" ? item.aiConfidence : undefined,
    needsReview: typeof item.needsReview === "boolean" ? item.needsReview : undefined,
    fitGender: isFitGender(item.fitGender) ? item.fitGender : "unknown",
    fitNotes: sanitizeFitNotes(item.fitNotes),
    ...(typeof item.thumbnailDataUrl === "string" ? { thumbnailDataUrl: item.thumbnailDataUrl } : {}),
    ...(typeof item.thumbnailVersion === "number" ? { thumbnailVersion: item.thumbnailVersion } : {}),
    ...(typeof item.thumbnailUpdatedAt === "string" ? { thumbnailUpdatedAt: item.thumbnailUpdatedAt } : {}),
    ...(() => {
      const status = sanitizeThumbnailStatus(item.thumbnailStatus);
      return status !== undefined ? { thumbnailStatus: status } : {};
    })(),
    wornDates: sanitizeWornDates(item.wornDates),
    referenceOutfitImages: sanitizeReferenceOutfitImages(item.referenceOutfitImages),
    ...(item.aiStyleAdvice != null
      ? (() => { const a = sanitizeGarmentStyleAdvice(item.aiStyleAdvice); return a ? { aiStyleAdvice: a } : {}; })()
      : {}),
    material: typeof item.material === "string" && item.material.trim() ? item.material.trim() : undefined,
    purchaseDate: typeof item.purchaseDate === "string" && item.purchaseDate.trim() ? item.purchaseDate.trim() : undefined,
    price,
    productUrl: sanitizeProductUrl(item.productUrl),
    temperatureRange: sanitizeTemperatureRange(item.temperatureRange),
    createdAt: typeof item.createdAt === "string" ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : now,
  };
}

export function migrateItemRecords(items: unknown): WardrobeItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => migrateItemRecord(item));
}

// ============================================================
// 通用 sanitizer
// ============================================================

export function sanitizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

export function sanitizeDateKeyArray(input: unknown): string[] {
  return sanitizeWornDates(input);
}

export function sanitizeProductUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export { sanitizeTemperatureRange, sanitizeColorInfo };

const WISHLIST_STATUS_VALUES: WishlistStatus[] = ["interested", "rejected", "archived"];

export function sanitizeWishlistStatus(input: unknown): WishlistStatus {
  if (typeof input === "string") {
    if ((WISHLIST_STATUS_VALUES as string[]).includes(input)) return input as WishlistStatus;
    if (input === "considering") return "interested";
    if (input === "bought") return "archived";
  }
  return "interested";
}

export function sanitizeOutfitSource(input: unknown): SavedOutfit["source"] {
  if (input === "manual" || input === "ai" || input === "capture") return input;
  return "manual";
}

function sanitizeOutfitAiSuggestion(input: unknown): OutfitAiSuggestion | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const summary = typeof o.summary === "string" && o.summary.trim() ? o.summary.trim().slice(0, 90) : "";
  if (!summary) return undefined;
  const replacementSuggestions = Array.isArray(o.replacementSuggestions)
    ? o.replacementSuggestions.flatMap((entry): OutfitAiSuggestion["replacementSuggestions"] => {
        if (!entry || typeof entry !== "object") return [];
        const r = entry as Record<string, unknown>;
        const originalItemId = typeof r.originalItemId === "number" && Number.isFinite(r.originalItemId) ? r.originalItemId : undefined;
        const suggestedItemIds = Array.isArray(r.suggestedItemIds)
          ? Array.from(new Set(r.suggestedItemIds.filter((id): id is number => typeof id === "number" && Number.isFinite(id)))).slice(0, 4)
          : [];
        if (originalItemId == null || suggestedItemIds.length === 0) return [];
        return [{
          originalItemId,
          suggestedItemIds,
          reason: typeof r.reason === "string" && r.reason.trim() ? r.reason.trim().slice(0, 70) : "可作为同类替换候选。",
        }];
      }).slice(0, 8)
    : [];
  const source = o.source === "ai" || o.source === "local" ? o.source : undefined;
  return {
    summary,
    suitableScenes: sanitizeStringArray(o.suitableScenes).slice(0, 5),
    unsuitableScenes: sanitizeStringArray(o.unsuitableScenes).slice(0, 5),
    strengths: sanitizeStringArray(o.strengths).slice(0, 5),
    risks: sanitizeStringArray(o.risks).slice(0, 5),
    replacementSuggestions,
    missingItems: sanitizeStringArray(o.missingItems).slice(0, 5),
    generatedAt: typeof o.generatedAt === "string" && o.generatedAt ? o.generatedAt : new Date().toISOString(),
    ...(source ? { source } : {}),
  };
}

// ============================================================
// SavedOutfit 迁移
// ============================================================

export function migrateSavedOutfitRecord(input: unknown): SavedOutfit {
  const o = (input ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const id = typeof o.id === "string" && o.id ? o.id : `outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "未命名套装";
  const itemIds = Array.isArray(o.itemIds) ? o.itemIds.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : [];

  return {
    id,
    name,
    itemIds,
    coverImageDataUrl: typeof o.coverImageDataUrl === "string" ? o.coverImageDataUrl : undefined,
    previewImageDataUrl: typeof o.previewImageDataUrl === "string" ? o.previewImageDataUrl : undefined,
    destination: typeof o.destination === "string" && o.destination ? o.destination : undefined,
    activity: typeof o.activity === "string" && o.activity ? o.activity : undefined,
    style: typeof o.style === "string" && o.style ? o.style : undefined,
    source: sanitizeOutfitSource(o.source),
    favorite: typeof o.favorite === "boolean" ? o.favorite : true,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
    sourceImageDataUrl: typeof o.sourceImageDataUrl === "string" ? o.sourceImageDataUrl : undefined,
    thumbnailDataUrl: typeof o.thumbnailDataUrl === "string" ? o.thumbnailDataUrl : undefined,
    thumbnailVersion: typeof o.thumbnailVersion === "number" ? o.thumbnailVersion : undefined,
    thumbnailUpdatedAt: typeof o.thumbnailUpdatedAt === "string" ? o.thumbnailUpdatedAt : undefined,
    thumbnailStatus: o.thumbnailStatus === "ready" || o.thumbnailStatus === "failed" ? o.thumbnailStatus : undefined,
    seasons: Array.isArray(o.seasons) ? o.seasons.filter(isSeason) : [],
    sceneTags: sanitizeStringArray(o.sceneTags),
    styleTags: sanitizeStringArray(o.styleTags),
    pairingTags: sanitizeStringArray(o.pairingTags),
    temperatureRange: sanitizeTemperatureRange(o.temperatureRange),
    notes: typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : undefined,
    wornDates: sanitizeDateKeyArray(o.wornDates),
    outfitRealImages: migrateOutfitRealImageRecords(o.outfitRealImages),
    autoCoverImageDataUrl: typeof o.autoCoverImageDataUrl === "string" ? o.autoCoverImageDataUrl : undefined,
    aiSuggestion: sanitizeOutfitAiSuggestion(o.aiSuggestion),
  };
}

export function migrateSavedOutfitRecords(outfits: unknown): SavedOutfit[] {
  if (!Array.isArray(outfits)) return [];
  return outfits.map((o) => migrateSavedOutfitRecord(o));
}

// ============================================================
// OutfitRealImage 迁移
// ============================================================

export function migrateOutfitRealImageRecord(input: unknown): OutfitRealImage | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const now = new Date().toISOString();

  const imageDataUrl = typeof o.imageDataUrl === "string" ? o.imageDataUrl : "";
  if (!imageDataUrl) return null;

  return {
    id: typeof o.id === "string" && o.id ? o.id : `outfit-real-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    imageDataUrl,
    sourceImageDataUrl: typeof o.sourceImageDataUrl === "string" ? o.sourceImageDataUrl : undefined,
    thumbnailDataUrl: typeof o.thumbnailDataUrl === "string" ? o.thumbnailDataUrl : undefined,
    caption: typeof o.caption === "string" && o.caption.trim() ? o.caption.trim() : undefined,
    takenAt: typeof o.takenAt === "string" && o.takenAt ? o.takenAt : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function migrateOutfitRealImageRecords(input: unknown): OutfitRealImage[] {
  if (!Array.isArray(input)) return [];
  return input.map((r) => migrateOutfitRealImageRecord(r)).filter((r): r is OutfitRealImage => r !== null);
}

// ============================================================
// WishlistItem 迁移
// ============================================================

const WISHLIST_VERDICT_VALUES: WishlistVerdict[] = ["worth_buying", "consider", "not_recommended", "unknown"];

function sanitizeWishlistAssessment(input: unknown): WishlistAssessment | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const verdict: WishlistVerdict = typeof o.verdict === "string" && (WISHLIST_VERDICT_VALUES as string[]).includes(o.verdict)
    ? o.verdict as WishlistVerdict
    : "unknown";
  return {
    score: typeof o.score === "number" && Number.isFinite(o.score) ? o.score : undefined,
    verdict,
    summary: typeof o.summary === "string" ? o.summary : "",
    matchReasons: sanitizeStringArray(o.matchReasons),
    conflictReasons: sanitizeStringArray(o.conflictReasons),
    similarOwnedItemIds: Array.isArray(o.similarOwnedItemIds)
      ? o.similarOwnedItemIds.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      : [],
    suggestedOutfits: Array.isArray(o.suggestedOutfits)
      ? o.suggestedOutfits.filter((s): s is Record<string, unknown> => s !== null && typeof s === "object").map((s) => {
          const so = s as Record<string, unknown>;
          return {
            title: typeof so.title === "string" ? so.title : "",
            itemIds: Array.isArray(so.itemIds) ? so.itemIds.filter((v): v is number => typeof v === "number") : [],
            reason: typeof so.reason === "string" ? so.reason : "",
          };
        })
      : [],
    missingItems: sanitizeStringArray(o.missingItems),
    generatedAt: typeof o.generatedAt === "string" && o.generatedAt ? o.generatedAt : new Date().toISOString(),
  };
}

export function migrateWishlistItemRecord(input: unknown): WishlistItem | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const now = new Date().toISOString();

  const imageDataUrl = typeof o.imageDataUrl === "string" ? o.imageDataUrl : "";
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "未命名种草单品";

  if (name === "未命名种草单品" && !imageDataUrl) return null;

  const status = sanitizeWishlistStatus(o.status);
  const category = sanitizeCategory(o.category);
  const colors = sanitizeColorInfo(o.colors, {
    colorMode: o.colorMode,
    mainColor: o.mainColor,
    accentColors: o.accentColors,
    primaryColors: o.primaryColors,
    secondaryColors: o.secondaryColors,
    colors: o.colors,
  });
  const subcategory = reverseLookupSubcategory(category, o.subcategory);

  const userNotes = typeof o.notes === "string" && o.notes.trim()
    ? o.notes.trim()
    : typeof o.note === "string" && o.note.trim()
      ? o.note.trim()
      : undefined;

  return {
    id: typeof o.id === "string" && o.id ? o.id : `wishlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    imageDataUrl,
    sourceImageDataUrl: typeof o.sourceImageDataUrl === "string" ? o.sourceImageDataUrl : undefined,
    thumbnailDataUrl: typeof o.thumbnailDataUrl === "string" ? o.thumbnailDataUrl : undefined,
    category,
    subcategory,
    colors,
    seasons: Array.isArray(o.seasons) ? o.seasons.filter(isSeason) : [],
    styles: Array.isArray(o.styles) ? o.styles.filter(isStyle) : [],
    temperatureRange: sanitizeTemperatureRange(o.temperatureRange),
    formality: typeof o.formality === "number" && Number.isFinite(o.formality) ? o.formality : undefined,
    warmth: typeof o.warmth === "number" && Number.isFinite(o.warmth) ? o.warmth : undefined,
    material: typeof o.material === "string" && o.material.trim() ? o.material.trim() : undefined,
    fitGender: isFitGender(o.fitGender) ? o.fitGender : undefined,
    fitNotes: sanitizeFitNotes(o.fitNotes),
    notes: userNotes,
    price: typeof o.price === "number" && Number.isFinite(o.price) ? o.price : undefined,
    productUrl: sanitizeProductUrl(o.productUrl),
    status,
    convertedItemId: typeof o.convertedItemId === "number" && Number.isFinite(o.convertedItemId) ? o.convertedItemId : undefined,
    convertedAt: typeof o.convertedAt === "string" && o.convertedAt ? o.convertedAt : undefined,
    convertedItemDeletedAt: typeof o.convertedItemDeletedAt === "string" && o.convertedItemDeletedAt ? o.convertedItemDeletedAt : undefined,
    aiAssessment: sanitizeWishlistAssessment(o.aiAssessment),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function migrateWishlistItemRecords(items: unknown): WishlistItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((w) => migrateWishlistItemRecord(w)).filter((w): w is WishlistItem => w !== null);
}

// ============================================================
// 穿搭计划: 日期校验
// ============================================================

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(input: unknown): input is string {
  if (typeof input !== "string") return false;
  if (!DATE_KEY_RE.test(input)) return false;
  const [y, m, d] = input.split("-").map(Number) as [number, number, number];
  if (y! < 2000 || y! > 2100) return false;
  if (m! < 1 || m! > 12) return false;
  if (d! < 1 || d! > 31) return false;
  if (d! > new Date(y!, m!, 0).getDate()) return false;
  return true;
}

const PLAN_TYPE_VALUES: OutfitCalendarPlanType[] = ["travel", "business", "custom"];

export function sanitizeOutfitCalendarPlanType(input: unknown): OutfitCalendarPlanType {
  if (typeof input === "string" && (PLAN_TYPE_VALUES as string[]).includes(input)) return input as OutfitCalendarPlanType;
  return "custom";
}

const PLAN_TONE_VALUES: OutfitCalendarPlanTone[] = ["denim", "moss", "clay", "amber", "rose", "purple", "slate"];

export function sanitizeOutfitCalendarPlanTone(input: unknown): OutfitCalendarPlanTone {
  if (typeof input === "string" && (PLAN_TONE_VALUES as string[]).includes(input)) return input as OutfitCalendarPlanTone;
  return "denim";
}

const PLAN_ENTRY_STATUS_VALUES: OutfitPlanEntryStatus[] = ["planned", "worn", "skipped", "changed"];

function sanitizeOutfitPlanEntryStatus(input: unknown): OutfitPlanEntryStatus {
  if (typeof input === "string" && (PLAN_ENTRY_STATUS_VALUES as string[]).includes(input)) return input as OutfitPlanEntryStatus;
  return "planned";
}

const PACKING_SOURCE_VALUES: PlanPackingChecklistSource[] = ["wardrobe", "manual", "ai", "rule"];

function sanitizePackingSource(input: unknown): PlanPackingChecklistSource {
  if (typeof input === "string" && (PACKING_SOURCE_VALUES as string[]).includes(input)) return input as PlanPackingChecklistSource;
  return "manual";
}

export function migrateOutfitPlanEntryRecord(input: unknown): OutfitPlanEntry | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const now = new Date().toISOString();

  const date = typeof o.date === "string" && isDateKey(o.date) ? o.date : "";
  if (!date) return null;

  const id = typeof o.id === "string" && o.id ? o.id : `plan-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outfitId = typeof o.outfitId === "string" && o.outfitId ? o.outfitId : undefined;
  const itemIds = Array.isArray(o.itemIds) ? o.itemIds.filter((v): v is number => typeof v === "number" && Number.isFinite(v)) : undefined;
  const calendarPlanId = typeof o.calendarPlanId === "string" && o.calendarPlanId ? o.calendarPlanId : undefined;

  const ROLE_VALUES: OutfitPlanEntryRole[] = ["primary", "backup", "morning", "afternoon", "evening", "other"];
  const role = typeof o.role === "string" && (ROLE_VALUES as string[]).includes(o.role)
    ? o.role as OutfitPlanEntryRole
    : undefined;

  const WEAR_ORIGIN_VALUES: OutfitWearOrigin[] = ["planned_confirmed", "manual_actual"];
  const wearOrigin = typeof o.wearOrigin === "string" && (WEAR_ORIGIN_VALUES as string[]).includes(o.wearOrigin)
    ? o.wearOrigin as OutfitWearOrigin
    : undefined;

  return {
    id,
    date,
    outfitId,
    ...(itemIds ? { itemIds } : {}),
    calendarPlanId,
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined,
    scene: typeof o.scene === "string" && o.scene.trim() ? o.scene.trim() : undefined,
    weatherNote: typeof o.weatherNote === "string" && o.weatherNote.trim() ? o.weatherNote.trim() : undefined,
    status: sanitizeOutfitPlanEntryStatus(o.status),
    wornDateLinked: typeof o.wornDateLinked === "string" && isDateKey(o.wornDateLinked) ? o.wornDateLinked : undefined,
    actualOutfitId: typeof o.actualOutfitId === "string" && o.actualOutfitId ? o.actualOutfitId : undefined,
    notes: typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : undefined,
    isPrimary: typeof o.isPrimary === "boolean" ? o.isPrimary : undefined,
    isPrimaryActual: typeof o.isPrimaryActual === "boolean" ? o.isPrimaryActual : undefined,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : undefined,
    role,
    wearOrigin,
    plannedBeforeWorn: typeof o.plannedBeforeWorn === "boolean" ? o.plannedBeforeWorn : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function migrateOutfitPlanEntryRecords(input: unknown): OutfitPlanEntry[] {
  if (!Array.isArray(input)) return [];
  return input.map((e) => migrateOutfitPlanEntryRecord(e)).filter((e): e is OutfitPlanEntry => e !== null);
}

export function migrateOutfitCalendarPlanRecord(input: unknown): OutfitCalendarPlan | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const now = new Date().toISOString();

  const startDate = typeof o.startDate === "string" && isDateKey(o.startDate) ? o.startDate : "";
  const endDate = typeof o.endDate === "string" && isDateKey(o.endDate) ? o.endDate : "";
  if (!startDate || !endDate || startDate > endDate) {
    if (typeof console !== "undefined") console.warn("[migrate] OutfitCalendarPlan dropped: invalid date range", { startDate, endDate });
    return null;
  }

  const id = typeof o.id === "string" && o.id ? o.id : `calendar-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    type: sanitizeOutfitCalendarPlanType(o.type),
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : "未命名计划",
    startDate,
    endDate,
    tone: sanitizeOutfitCalendarPlanTone(o.tone),
    destination: typeof o.destination === "string" && o.destination.trim() ? o.destination.trim() : undefined,
    activities: sanitizeStringArray(o.activities).slice(0, 8),
    weatherNote: typeof o.weatherNote === "string" && o.weatherNote.trim() ? o.weatherNote.trim() : undefined,
    notes: typeof o.notes === "string" && o.notes.trim() ? o.notes.trim() : undefined,
    packingEnabled: typeof o.packingEnabled === "boolean" ? o.packingEnabled : undefined,
    aiSummary: typeof o.aiSummary === "string" && o.aiSummary.trim() ? o.aiSummary.trim() : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function migrateOutfitCalendarPlanRecords(input: unknown): OutfitCalendarPlan[] {
  if (!Array.isArray(input)) return [];
  return input.map((p) => migrateOutfitCalendarPlanRecord(p)).filter((p): p is OutfitCalendarPlan => p !== null);
}

export function migratePlanPackingChecklistItemRecord(input: unknown): PlanPackingChecklistItem | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const now = new Date().toISOString();

  const calendarPlanId = typeof o.calendarPlanId === "string" && o.calendarPlanId ? o.calendarPlanId : "";
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "";
  if (!calendarPlanId || !label) return null;

  const id = typeof o.id === "string" && o.id ? o.id : `packing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    calendarPlanId,
    source: sanitizePackingSource(o.source),
    itemId: typeof o.itemId === "number" && Number.isFinite(o.itemId) ? o.itemId : undefined,
    label,
    category: typeof o.category === "string" && o.category.trim() ? o.category.trim() : undefined,
    quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) && o.quantity >= 1 ? Math.min(o.quantity, 99) : 1,
    dateKeys: Array.isArray(o.dateKeys) ? o.dateKeys.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : undefined,
    checked: typeof o.checked === "boolean" ? o.checked : false,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function migratePlanPackingChecklistItemRecords(input: unknown): PlanPackingChecklistItem[] {
  if (!Array.isArray(input)) return [];
  return input.map((ci) => migratePlanPackingChecklistItemRecord(ci)).filter((ci): ci is PlanPackingChecklistItem => ci !== null);
}
