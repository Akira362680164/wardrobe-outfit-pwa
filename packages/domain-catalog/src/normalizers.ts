import {
  GARMENT_CATEGORY_IDS,
  getCategoryGroupById,
  mapLegacyCategoryToCatalogGroup,
  type GarmentCategory,
} from "./categories.js";
import { SEASON_VALUES, type Season } from "./seasons.js";
import { STYLE_VALUES, type GarmentStyle } from "./styles.js";

const GARMENT_CATEGORY_SET: ReadonlySet<string> = new Set(GARMENT_CATEGORY_IDS);
const SEASON_SET: ReadonlySet<string> = new Set(SEASON_VALUES);
const STYLE_SET: ReadonlySet<string> = new Set(STYLE_VALUES);

export function isGarmentCategory(value: unknown): value is GarmentCategory {
  return typeof value === "string" && GARMENT_CATEGORY_SET.has(value);
}

export function normalizeGarmentCategory(value: unknown): GarmentCategory | null {
  if (isGarmentCategory(value)) return value;
  if (typeof value !== "string") return null;
  return mapLegacyCategoryToCatalogGroup(value) ?? null;
}

export function normalizeSubcategoryForCategory(category: GarmentCategory, value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const clean = value.trim();
  return getCategoryGroupById(category)?.subcategories.some((subcategory) => subcategory.id === clean)
    ? clean
    : undefined;
}

export function normalizeSeasonList(value: unknown): Season[] {
  return normalizeEnumList(value, SEASON_SET) as Season[];
}

export function normalizeStyleList(value: unknown): GarmentStyle[] {
  return normalizeEnumList(value, STYLE_SET) as GarmentStyle[];
}

function normalizeEnumList(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && allowed.has(entry)))];
}
