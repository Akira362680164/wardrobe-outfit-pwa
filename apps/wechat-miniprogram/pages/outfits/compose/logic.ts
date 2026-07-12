import { MINI_CATEGORY_LABELS } from "../../../generated/catalogs";
import type {
  MiniClosetLocation,
  MiniGarment,
} from "../../../services/workspace";

export interface SelectableGarment extends MiniGarment {
  selected: boolean;
}

export interface OutfitDraft {
  name: string;
  seasons: string[];
  sceneTags: string[];
  styleTags: string[];
  pairingTags: string[];
  temperatureRange?: { minC?: number; maxC?: number };
  notes: string;
}

export interface LocationOption {
  id: string;
  name: string;
  count: number;
}

export interface CategoryChip {
  key: string;
  label: string;
  count: number;
}

export interface CompositionSlot {
  key: string;
  label: string;
  present: boolean;
  statusText: string;
}

export interface CompositionSummary {
  slots: CompositionSlot[];
  summary: string;
}

export function activeSelectableGarments(items: MiniGarment[]): SelectableGarment[] {
  return items
    .filter((item) => item.status === "active" && Number.isFinite(item.legacyItemId))
    .map((item) => ({ ...item, selected: false }));
}

export function buildLocationOptions(
  garments: MiniGarment[],
  locations: MiniClosetLocation[],
): LocationOption[] {
  const fallback = locations.length
    ? locations
    : [{ id: "home", name: "默认衣橱", note: "", sortOrder: 1 }];
  return [
    { id: "all", name: "全部衣橱", count: garments.length },
    ...fallback.map((location) => ({
      id: location.id,
      name: location.name,
      count: garments.filter((garment) => garment.locationId === location.id).length,
    })),
  ];
}

export function buildCategoryChips(garments: MiniGarment[]): CategoryChip[] {
  const counts = new Map<string, number>();
  for (const garment of garments) {
    counts.set(garment.category, (counts.get(garment.category) ?? 0) + 1);
  }
  return [
    { key: "all", label: "全部", count: garments.length },
    ...Array.from(counts.entries()).map(([key, count]) => ({
      key,
      count,
      label:
        MINI_CATEGORY_LABELS[key] ??
        garments.find((garment) => garment.category === key)?.categoryLabel ??
        key,
    })),
  ];
}

export function filterGarments(
  garments: MiniGarment[],
  locationId: string,
  category: string,
  query: string,
): MiniGarment[] {
  const needle = query.trim().toLowerCase();
  return garments.filter((garment) => {
    if (locationId !== "all" && garment.locationId !== locationId) return false;
    if (category !== "all" && garment.category !== category) return false;
    if (!needle) return true;
    return [garment.name, garment.categoryLabel, garment.colorText]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

export function buildLocalOutfitDraft(items: MiniGarment[]): OutfitDraft {
  const names = uniqueStrings(items.map((item) => item.name));
  return {
    name:
      names.length === 0
        ? "待确认套装"
        : names.length === 1
          ? `${names[0]}套装`
          : `${names[0]}等${names.length}件`,
    seasons: uniqueStrings(items.flatMap((item) => item.seasons)).slice(0, 5),
    sceneTags: [],
    styleTags: uniqueStrings(items.flatMap((item) => item.styleLabels)).slice(0, 6),
    pairingTags: [],
    temperatureRange: aggregateTemperatureRange(items),
    notes: "",
  };
}

export function analyzeComposition(items: MiniGarment[]): CompositionSummary {
  const hasOnePiece = items.some((item) => item.category === "one_piece");
  const definitions = [
    ["top", "上装", hasOnePiece || items.some((item) => item.category === "tops")],
    ["bottom", "下装", hasOnePiece || items.some((item) => item.category === "pants" || item.category === "skirts")],
    ["shoes", "鞋", items.some((item) => item.category === "shoes")],
    ["bag", "包", items.some((item) => item.category === "bags")],
    ["outerwear", "外套", items.some((item) => item.category === "tops" && item.subcategory.includes("jacket"))],
    ["accessory", "配饰", items.some((item) => ["hats", "jewelry", "accessories"].includes(item.category))],
  ] as const;
  const slots = definitions.map(([key, label, present]) => ({
    key,
    label,
    present,
    statusText: present ? "已覆盖" : "未覆盖",
  }));
  const missingEssentials = slots
    .filter((slot) => ["top", "bottom", "shoes"].includes(slot.key) && !slot.present)
    .map((slot) => slot.label);
  return {
    slots,
    summary: missingEssentials.length
      ? `已选择 ${items.length} 件，基础组成还缺 ${missingEssentials.join("、")}。`
      : `已覆盖基础穿搭组成，共 ${items.length} 件。`,
  };
}

export function parseTagInput(value: string): string[] {
  return uniqueStrings(value.split(/[、,，\n]+/)).slice(0, 8);
}

function aggregateTemperatureRange(
  items: MiniGarment[],
): { minC?: number; maxC?: number } | undefined {
  const mins = items
    .map((item) => item.temperatureRange.minC)
    .filter((value): value is number => typeof value === "number");
  const maxs = items
    .map((item) => item.temperatureRange.maxC)
    .filter((value): value is number => typeof value === "number");
  if (!mins.length && !maxs.length) return undefined;
  const minC = mins.length ? Math.max(...mins) : undefined;
  const maxC = maxs.length ? Math.min(...maxs) : undefined;
  if (typeof minC === "number" && typeof maxC === "number" && minC > maxC) {
    return { minC: Math.min(...mins), maxC: Math.max(...maxs) };
  }
  return {
    ...(typeof minC === "number" ? { minC } : {}),
    ...(typeof maxC === "number" ? { maxC } : {}),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
