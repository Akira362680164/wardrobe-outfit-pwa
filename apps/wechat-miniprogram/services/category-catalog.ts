import {
  MINI_CATEGORY_CATALOG,
  MINI_CATEGORY_LABELS,
  MINI_LEGACY_CATEGORY_MAP,
  MINI_SUBCATEGORY_LABELS,
} from "../generated/catalogs";

export type CategoryOption = {
  value: string;
  label: string;
};

export type CategoryGroup = CategoryOption & {
  subcategories: CategoryOption[];
};

export const GARMENT_CATEGORY_CATALOG: CategoryGroup[] = MINI_CATEGORY_CATALOG.map((group) => ({
  value: group.id,
  label: group.label,
  subcategories: group.subcategories.map((subcategory) => ({
    value: subcategory.id,
    label: subcategory.label,
  })),
}));

export const CATEGORY_OPTIONS: CategoryOption[] = GARMENT_CATEGORY_CATALOG.map(({ value, label }) => ({ value, label }));

export function normalizeCategoryId(category: string): string {
  return MINI_CATEGORY_LABELS[category] ? category : MINI_LEGACY_CATEGORY_MAP[category] ?? category;
}

export function getCategoryLabel(category: string): string {
  const normalized = normalizeCategoryId(category);
  return MINI_CATEGORY_LABELS[normalized] ?? "未分类";
}

export function getSubcategoryOptions(category: string): CategoryOption[] {
  const normalized = normalizeCategoryId(category);
  return GARMENT_CATEGORY_CATALOG.find((item) => item.value === normalized)?.subcategories ?? [];
}

export function getSubcategoryLabel(category: string, subcategory?: string): string {
  if (!subcategory) return "";
  return getSubcategoryOptions(category).some((item) => item.value === subcategory)
    ? MINI_SUBCATEGORY_LABELS[subcategory] ?? subcategory
    : subcategory;
}

export function isSubcategoryInCategory(category: string, subcategory?: string): boolean {
  if (!subcategory) return true;
  return getSubcategoryOptions(category).some((item) => item.value === subcategory);
}

export function buildSubcategoryChoices(category: string, selected?: string): Array<CategoryOption & { selected: boolean }> {
  return getSubcategoryOptions(category).map((item) => ({ ...item, selected: item.value === selected }));
}
