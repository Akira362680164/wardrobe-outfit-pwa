import {
  CURRENT_THUMBNAIL_VERSION,
  type GarmentStatus,
  type GarmentStyle,
  type GarmentFitGender,
  type SavedOutfit,
  type Season,
  type WardrobeItem,
  type WishlistItem,
} from "@/lib/types";
import { emptyColorInfo } from "@/lib/color-fields";
import { normalizeTemperatureRange } from "@/lib/temperature-range";
import {
  calculateDraftReviewSummary,
  type GarmentIntakeDraft,
  type IntakeField,
  type OutfitIntakeDraft,
  type WishlistIntakeDraft,
} from "@/lib/intake-draft";

export function garmentDraftToWardrobeItem(
  draft: GarmentIntakeDraft,
  options: { now?: string } = {},
): Omit<WardrobeItem, "id"> {
  const now = options.now ?? new Date().toISOString();
  const imageDataUrl = resolveGarmentImageDataUrl(draft);

  return {
    name: requiredText(fieldValue(draft.name, ""), "未命名衣物"),
    imageDataUrl,
    sourceImageDataUrl: draft.sourceImageDataUrl || draft.croppedImageDataUrl || imageDataUrl,
    cropBox: draft.cropBox,
    category: fieldValue(draft.category, "tops"),
    colors: fieldValue(draft.colors, emptyColorInfo()),
    seasons: nonEmptyArray(fieldValue<Season[]>(draft.seasons, []), ["all"]),
    styles: nonEmptyArray(fieldValue<GarmentStyle[]>(draft.styles, []), ["casual"]),
    formality: clampNumber(fieldValue(draft.formality, 3), 1, 5),
    warmth: clampNumber(fieldValue(draft.warmth, 3), 1, 5),
    temperatureRange: normalizeTemperatureRange(fieldValue(draft.temperatureRange, null)),
    locationId: requiredText(fieldValue(draft.locationId, ""), "home"),
    status: fieldValue<GarmentStatus>(draft.status, "active"),
    notes: optionalText(draft.notes),
    fitGender: draft.fitGender ? fieldValue<GarmentFitGender>(draft.fitGender, "unknown") : undefined,
    fitNotes: optionalText(draft.fitNotes),
    price: optionalPrice(draft.price),
    productUrl: optionalText(draft.productUrl),
    purchaseDate: optionalText(draft.purchaseDate),
    subcategory: optionalText(draft.subcategory),
    material: optionalText(draft.material),
    thumbnailDataUrl: draft.thumbnailDataUrl,
    ...(draft.thumbnailDataUrl
      ? { thumbnailVersion: CURRENT_THUMBNAIL_VERSION, thumbnailUpdatedAt: now, thumbnailStatus: "ready" as const }
      : {}),
    wornDates: [],
    needsReview: calculateDraftReviewSummary(draft).needsReviewFields > 0 || draft.processingIssues.length > 0,
    aiConfidence: typeof draft.aiConfidenceScore === "number" ? draft.aiConfidenceScore / 100 : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function wishlistDraftToWishlistItem(
  draft: WishlistIntakeDraft,
  options: { id?: string; now?: string } = {},
): WishlistItem {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id ?? `wishlist-intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: requiredText(fieldValue(draft.name, ""), "未命名种草单品"),
    imageDataUrl: draft.imageDataUrl || draft.croppedImageDataUrl || "",
    sourceImageDataUrl: draft.sourceImageDataUrl || draft.croppedImageDataUrl || draft.imageDataUrl,
    thumbnailDataUrl: draft.thumbnailDataUrl,
    category: fieldValue(draft.category, "tops"),
    subcategory: optionalText(draft.subcategory),
    colors: fieldValue(draft.colors, emptyColorInfo()),
    seasons: fieldValue(draft.seasons, []),
    styles: fieldValue(draft.styles, []),
    formality: clampNumber(fieldValue(draft.formality, 3), 1, 5),
    warmth: clampNumber(fieldValue(draft.warmth, 3), 1, 5),
    temperatureRange: normalizeTemperatureRange(fieldValue(draft.temperatureRange, null)),
    material: optionalText(draft.material),
    price: optionalPrice(draft.price),
    productUrl: optionalText(draft.productUrl),
    fitGender: draft.fitGender ? fieldValue<GarmentFitGender>(draft.fitGender, "unknown") : undefined,
    fitNotes: optionalText(draft.fitNotes),
    notes: optionalText(draft.notes),
    status: fieldValue(draft.status, "interested"),
    createdAt: now,
    updatedAt: now,
  };
}

export function garmentDraftToWishlistItem(
  draft: GarmentIntakeDraft,
  options: { id?: string; now?: string } = {},
): WishlistItem {
  const now = options.now ?? new Date().toISOString();
  const imageDataUrl = resolveGarmentImageDataUrl(draft);

  return {
    id: options.id ?? `wishlist-intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: requiredText(fieldValue(draft.name, ""), "未命名种草单品"),
    imageDataUrl,
    sourceImageDataUrl: draft.sourceImageDataUrl || draft.croppedImageDataUrl || imageDataUrl,
    cropBox: draft.cropBox,
    thumbnailDataUrl: draft.thumbnailDataUrl,
    category: fieldValue(draft.category, "tops"),
    subcategory: optionalText(draft.subcategory),
    colors: fieldValue(draft.colors, emptyColorInfo()),
    seasons: fieldValue(draft.seasons, []),
    styles: fieldValue(draft.styles, []),
    formality: clampNumber(fieldValue(draft.formality, 3), 1, 5),
    warmth: clampNumber(fieldValue(draft.warmth, 3), 1, 5),
    temperatureRange: normalizeTemperatureRange(fieldValue(draft.temperatureRange, null)),
    material: optionalText(draft.material),
    price: optionalPrice(draft.price),
    productUrl: optionalText(draft.productUrl),
    fitGender: draft.fitGender ? fieldValue<GarmentFitGender>(draft.fitGender, "unknown") : undefined,
    fitNotes: optionalText(draft.fitNotes),
    notes: optionalText(draft.notes),
    status: "interested",
    createdAt: now,
    updatedAt: now,
  };
}

export function outfitDraftToSavedOutfit(
 draft: OutfitIntakeDraft,
 options: { id?: string; now?: string; itemIds?: number[]; unknownItemNotes?: string[] } = {},
): SavedOutfit {
 const now = options.now ?? new Date().toISOString();
 const itemIds = uniqueNumbers(options.itemIds ?? fieldValue(draft.itemIds, []));
 const unknownNotes = options.unknownItemNotes ?? fieldValue(draft.unknownItemNotes, []);
 const baseNotes = fieldValue(draft.notes, "");
 const sourceImageDataUrl = draft.sourceImageDataUrl;
 const notes = [baseNotes, ...unknownNotes.map(formatUnknownOutfitNote)]
 .map((text) => text.trim())
 .filter(Boolean)
 .join("\n");

 return {
 id: options.id ?? `outfit-intake-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
 name: requiredText(fieldValue(draft.name, ""), "未命名套装"),
 itemIds,
 source: fieldValue(draft.source, "manual"),
 sourceImageDataUrl,
 coverImageDataUrl: sourceImageDataUrl,
 thumbnailDataUrl: draft.thumbnailDataUrl,
 // v1.0: 创建流程默认不收藏,详情页可单独切换
 favorite: fieldValue(draft.favorite, false),
 seasons: fieldValue(draft.seasons, []),
 sceneTags: fieldValue(draft.sceneTags, []),
 styleTags: fieldValue(draft.styleTags, []),
 pairingTags: fieldValue(draft.pairingTags, []),
 temperatureRange: normalizeTemperatureRange(fieldValue(draft.temperatureRange, null)),
 notes: notes || undefined,
 createdAt: now,
 updatedAt: now,
 };
}

export function isIntakeDraftReadyToSave(draft: GarmentIntakeDraft | WishlistIntakeDraft | OutfitIntakeDraft): boolean {
  return calculateDraftReviewSummary(draft).canSave;
}

function fieldValue<T>(field: IntakeField<T> | undefined, fallback: T): T {
  return field?.value ?? fallback;
}

function resolveGarmentImageDataUrl(draft: GarmentIntakeDraft): string {
  const shouldUseTransparent = fieldValue(draft.useTransparentImage, false);
  if (shouldUseTransparent && draft.transparentImageDataUrl) return draft.transparentImageDataUrl;
  // ponytail: imageDataUrl stores ORIGINAL image, cropBox drives display cropping.
  // sourceImageDataUrl is the original full photo before any crop.
  return draft.sourceImageDataUrl || draft.croppedImageDataUrl || draft.imageDataUrl || "";
}

function optionalText(field: IntakeField<string> | undefined): string | undefined {
  const value = field?.value.trim();
  return value || undefined;
}

function optionalPrice(field: IntakeField<string> | undefined): number | undefined {
  const value = optionalText(field);
  if (!value) return undefined;
  const numeric = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function requiredText(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function nonEmptyArray<T>(values: T[], fallback: T[]): T[] {
  return values.length ? values : fallback;
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value))));
}

function formatUnknownOutfitNote(note: string): string {
  const clean = note.trim();
  if (!clean) return "";
  if (clean.startsWith("已")) return clean;
  return `未知单品待处理：${clean}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
