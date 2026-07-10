import {
  normalizeGarmentCategory,
  normalizeSeasonList,
  normalizeStyleList,
  normalizeSubcategoryForCategory,
  normalizeSystemColorValue,
  type GarmentCategory,
  type SystemColor,
} from "@wardrobe/domain-catalog";

type NormalizedColorInfo =
  | { mode: "single"; primary: SystemColor | "未标注" }
  | { mode: "main_with_accent"; primary: SystemColor; accents: SystemColor[] }
  | { mode: "multicolor"; primaries: SystemColor[] };

export function normalizeGarmentPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizeCatalogItemPayload(payload);
}

export function normalizeWishlistPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizeCatalogItemPayload(payload);
}

export function normalizeWorkspacePayload(
  resource: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (resource === "garments") return normalizeGarmentPayload(payload);
  if (resource === "wishlist") return normalizeWishlistPayload(payload);
  return payload;
}

function normalizeCatalogItemPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  let needsReview = payload.needsReview === true;

  const category = normalizeGarmentCategory(payload.category);
  const normalizedCategory: GarmentCategory = category ?? "tops";
  next.category = normalizedCategory;
  if (!category) needsReview = true;

  const rawSubcategory = typeof payload.subcategory === "string" ? payload.subcategory.trim() : "";
  const subcategory = normalizeSubcategoryForCategory(normalizedCategory, rawSubcategory);
  if (subcategory) next.subcategory = subcategory;
  else delete next.subcategory;
  if (rawSubcategory && !subcategory) needsReview = true;

  const normalizedColors = normalizeColorInfo(payload.colors);
  next.colors = normalizedColors.colors;
  if (normalizedColors.needsReview) needsReview = true;

  const seasons = normalizeSeasonList(payload.seasons);
  next.seasons = seasons;
  if (hasInvalidEnumValues(payload.seasons, seasons)) needsReview = true;

  const styles = normalizeStyleList(payload.styles);
  next.styles = styles;
  if (hasInvalidEnumValues(payload.styles, styles)) needsReview = true;

  if (needsReview) next.needsReview = true;
  else if (payload.needsReview === false) next.needsReview = false;
  else delete next.needsReview;

  return next;
}

function normalizeColorInfo(value: unknown): { colors: NormalizedColorInfo; needsReview: boolean } {
  if (!isRecord(value)) return fallbackColors();

  if (value.mode === "single") {
    if (value.primary === "未标注") return { colors: { mode: "single", primary: "未标注" }, needsReview: false };
    const primary = normalizeSystemColorValue(value.primary);
    return primary ? { colors: { mode: "single", primary }, needsReview: false } : fallbackColors();
  }

  if (value.mode === "main_with_accent") {
    const primary = normalizeSystemColorValue(value.primary);
    if (!primary) return fallbackColors();
    const accents = normalizeColorArray(value.accents, primary);
    return {
      colors: { mode: "main_with_accent", primary, accents: accents.values },
      needsReview: accents.hadInvalid,
    };
  }

  if (value.mode === "multicolor") {
    const primaries = normalizeColorArray(value.primaries);
    if (primaries.values.length === 0) return fallbackColors();
    return {
      colors: { mode: "multicolor", primaries: primaries.values },
      needsReview: primaries.hadInvalid,
    };
  }

  return fallbackColors();
}

function normalizeColorArray(value: unknown, excluded?: SystemColor): { values: SystemColor[]; hadInvalid: boolean } {
  if (!Array.isArray(value)) return { values: [], hadInvalid: value !== undefined };
  const values: SystemColor[] = [];
  let hadInvalid = false;
  for (const entry of value) {
    const normalized = normalizeSystemColorValue(entry);
    if (!normalized) {
      hadInvalid = true;
      continue;
    }
    if (normalized === excluded || values.includes(normalized)) continue;
    values.push(normalized);
  }
  return { values, hadInvalid };
}

function fallbackColors(): { colors: NormalizedColorInfo; needsReview: true } {
  return { colors: { mode: "single", primary: "未标注" }, needsReview: true };
}

function hasInvalidEnumValues(value: unknown, normalized: readonly string[]): boolean {
  if (value === undefined) return false;
  if (!Array.isArray(value)) return true;
  return value.some((entry) => typeof entry !== "string" || !normalized.includes(entry));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
