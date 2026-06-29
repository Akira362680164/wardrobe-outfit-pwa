import type {
 ColorInfo,
 GarmentCategory,
 GarmentFitGender,
 GarmentStyle,
 SavedOutfit,
 Season,
 TemperatureRange,
 WardrobeItem,
} from "@/lib/types";
import { STYLE_LABELS } from "@/lib/types";
import { emptyColorInfo, migrateLegacyColorFields, normalizeAiColorInfo } from "@/lib/color-fields";
import {
  collectItemIdsFromWardrobeItems,
  createIntakeDraftId,
  createIntakeField,
  createIntakeIssue,
  type GarmentIntakeDraft,
  type IntakeFieldConfidence,
  type IntakeProcessingIssue,
  type OutfitIntakeDraft,
  type WishlistIntakeDraft,
} from "@/lib/intake-draft";

export interface LocalImageProcessingResult {
  thumbnailDataUrl?: string;
  mainColor?: string;
  mainColorConfidence?: IntakeFieldConfidence;
  accentColors?: string[];
  transparentImageDataUrl?: string;
  transparentBackgroundStatus?: "ready" | "failed" | "skipped";
  qualityWarnings?: string[];
  /** AI 识别标签（来自识别管线，首次录入和重新识别共用）。 */
  aiTag?: import("./types").GarmentTagResult;
  aiSourceImageDataUrl?: string;
  aiFallback?: boolean;
}

export interface BuildLocalGarmentDraftInput extends LocalImageProcessingResult {
  id?: string;
  /** AI 识别整件级置信度 (0-1)，来自 aiTag.confidence。 */
  aiConfidence?: number;
  imageDataUrl: string;
  sourceImageDataUrl?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  nameGuess?: string;
  categoryGuess?: GarmentCategory;
  subcategory?: string;
  colors?: ColorInfo;
  colorMode?: ColorInfo["mode"];
  primaryColors?: string[];
  accentColors?: string[];
  secondaryColors?: string[];
  seasons?: Season[];
  styles?: GarmentStyle[];
  formality?: number;
  warmth?: number;
  temperatureRange?: TemperatureRange;
  material?: string;
  price?: string;
  productUrl?: string;
  purchaseDate?: string;
  fitGender?: GarmentFitGender;
  fitNotes?: string;
  notes?: string;
  locationId?: string;
  now?: string;
}

export interface BuildLocalWishlistDraftInput extends Omit<BuildLocalGarmentDraftInput, "locationId"> {
  imageKind?: "product_photo" | "product_screenshot" | "manual";
  productNameVisible?: string;
  price?: string;
  productUrl?: string;
}

export interface BuildLocalOutfitDraftInput {
  id?: string;
  items: WardrobeItem[];
  unknownItemNotes?: string[];
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  nameGuess?: string;
  notes?: string;
  source?: SavedOutfit["source"];
  now?: string;
}

const defaultCategory: GarmentCategory = "tops";
const defaultSeasons: Season[] = ["all"];
const defaultStyles: GarmentStyle[] = ["casual"];

export function buildLocalGarmentDraft(input: BuildLocalGarmentDraftInput): GarmentIntakeDraft {
  const now = input.now ?? new Date().toISOString();
  const normalizedColors = normalizeDraftColors(input);
  const mainColor = getDraftMainColor(normalizedColors.colors);
  const mainColorConfidence = mainColor ? input.mainColorConfidence ?? "high" : "low";
  const issues = buildImageIssues(input);

  return {
    id: input.id ?? createIntakeDraftId("garment", now),
    kind: "garment",
    ...(typeof input.aiConfidence === "number" ? { aiConfidence: clampAiConfidence(input.aiConfidence) } : {}),
    imageDataUrl: input.transparentImageDataUrl || input.imageDataUrl,
    sourceImageDataUrl: input.sourceImageDataUrl,
    croppedImageDataUrl: input.imageDataUrl,
    cropBox: input.cropBox,
    thumbnailDataUrl: input.thumbnailDataUrl,
    transparentImageDataUrl: input.transparentImageDataUrl,
    useTransparentImage: createIntakeField(Boolean(input.transparentImageDataUrl), input.transparentImageDataUrl ? "local" : "default", "high", { needsReview: false }),
    name: textField(input.nameGuess, "待确认单品", now),
    category: createIntakeField(input.categoryGuess ?? defaultCategory, input.categoryGuess ? "local" : "default", input.categoryGuess ? "medium" : "low", { needsReview: !input.categoryGuess }),
    subcategory: textField(input.subcategory, "", now),
    colors: createIntakeField(normalizedColors.colors, mainColor ? "local" : "default", mainColorConfidence, {
      needsReview: mainColorConfidence !== "high",
      reason: mainColor ? normalizedColors.reviewReason : "本地主色提取失败，将交给 AI 判断",
    }),
    seasons: createIntakeField(input.seasons?.length ? input.seasons : defaultSeasons, input.seasons?.length ? "local" : "default", "low", { needsReview: !input.seasons?.length }),
    styles: createIntakeField(input.styles?.length ? input.styles : defaultStyles, input.styles?.length ? "local" : "default", "low", { needsReview: !input.styles?.length }),
    formality: createIntakeField(input.formality ?? 3, input.formality ? "local" : "default", "low", { needsReview: !input.formality }),
    warmth: createIntakeField(input.warmth ?? 3, input.warmth ? "local" : "default", "low", { needsReview: !input.warmth }),
    temperatureRange: createIntakeField(input.temperatureRange ?? null, input.temperatureRange ? "local" : "default", "low", { needsReview: !input.temperatureRange }),
    locationId: createIntakeField(input.locationId ?? "home", input.locationId ? "local" : "default", "low", { needsReview: !input.locationId }),
    status: createIntakeField("active", "default", "high", { needsReview: false }),
    material: textField(input.material, "", now),
    price: textField(input.price, "", now),
    productUrl: textField(input.productUrl, "", now),
    purchaseDate: textField(input.purchaseDate, new Date(now).toISOString().slice(0, 10), now),
    fitGender: createIntakeField(input.fitGender ?? "unknown", input.fitGender ? "local" : "default", "low", { needsReview: !input.fitGender }),
    fitNotes: textField(input.fitNotes, "", now),
    notes: textField(input.notes, "", now),
    processingIssues: issues,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildLocalWishlistDraft(input: BuildLocalWishlistDraftInput): WishlistIntakeDraft {
  const now = input.now ?? new Date().toISOString();
  const base = buildLocalGarmentDraft({ ...input, locationId: "home", now });
  return {
    id: input.id ?? createIntakeDraftId("wishlist", now),
    kind: "wishlist",
    recognitionOnly: true,
    imageDataUrl: base.imageDataUrl,
    sourceImageDataUrl: base.sourceImageDataUrl,
    croppedImageDataUrl: base.croppedImageDataUrl,
    thumbnailDataUrl: base.thumbnailDataUrl,
    imageKind: createIntakeField(input.imageKind ?? "product_photo", input.imageKind ? "user" : "default", "medium", { needsReview: !input.imageKind }),
    name: textField(input.productNameVisible ?? input.nameGuess, "待确认种草单品", now),
    category: base.category,
    subcategory: base.subcategory,
    colors: base.colors,
    seasons: base.seasons,
    styles: base.styles,
    formality: base.formality,
    warmth: base.warmth,
    temperatureRange: base.temperatureRange,
    material: base.material,
    price: textField(input.price, "", now),
    productUrl: textField(input.productUrl, "", now),
    fitGender: base.fitGender,
    fitNotes: base.fitNotes,
    notes: base.notes,
    status: createIntakeField("interested", "default", "high", { needsReview: false }),
    processingIssues: base.processingIssues,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeDraftColors(input: BuildLocalGarmentDraftInput): { colors: ColorInfo; needsReview: boolean; reviewReason?: string } {
  if (input.colors) return normalizeAiColorInfo(input.colors);
  const legacy = migrateLegacyColorFields({
    colorMode: input.colorMode,
    mainColor: input.mainColor,
    primaryColors: input.primaryColors,
    secondaryColors: input.secondaryColors,
    accentColors: input.accentColors,
  });
  const normalized = normalizeAiColorInfo(legacy);
  if (!normalized.needsReview) return normalized;
  if (input.mainColor || input.primaryColors?.length || input.accentColors?.length || input.secondaryColors?.length) {
    return { colors: legacy, needsReview: true, reviewReason: normalized.reviewReason };
  }
  return { colors: emptyColorInfo(), needsReview: true, reviewReason: normalized.reviewReason };
}

function getDraftMainColor(colors: ColorInfo): string {
  if (colors.mode === "multicolor") return colors.primaries[0] ?? "";
  return colors.primary ?? "";
}

export function buildLocalOutfitDraftFromItems(input: BuildLocalOutfitDraftInput): OutfitIntakeDraft {
  const now = input.now ?? new Date().toISOString();
  const itemIds = collectItemIdsFromWardrobeItems(input.items);
  const itemNames = input.items.map((item) => item.name).filter(Boolean);
  const issues: IntakeProcessingIssue[] = [];
  if (input.unknownItemNotes?.length) {
    issues.push(createIntakeIssue("unknown_item_detected", "图片中有未知单品，不能静默创建，请选择关联、建草稿或忽略", { severity: "review" }));
  }
  if (itemIds.length !== input.items.length) {
    issues.push(createIntakeIssue("missing_required_field", "部分套装组成缺少正式衣物 ID", { severity: "review" }));
  }

  return {
    id: input.id ?? createIntakeDraftId("outfit", now),
    kind: "outfit",
    sourceImageDataUrl: input.sourceImageDataUrl,
    thumbnailDataUrl: input.thumbnailDataUrl,
    itemIds: createIntakeField(itemIds, "local", itemIds.length ? "high" : "low", { needsReview: itemIds.length === 0 }),
    itemNames: createIntakeField(itemNames, "local", "high", { needsReview: false }),
    unknownItemNotes: createIntakeField(input.unknownItemNotes ?? [], input.unknownItemNotes?.length ? "ai" : "default", "low", { needsReview: Boolean(input.unknownItemNotes?.length) }),
    name: textField(input.nameGuess, buildOutfitName(itemNames), now),
    seasons: createIntakeField(aggregateSeasons(input.items), "local", "medium", { needsReview: true }),
    sceneTags: createIntakeField(inferScenesFromStyles(aggregateStyleTagsAsChinese(input.items)), "local", "medium", { needsReview: true }),
    styleTags: createIntakeField(aggregateStyleTagsAsChinese(input.items), "local", "medium", { needsReview: true }),
    pairingTags: createIntakeField([], "default", "low", { needsReview: true }),
    temperatureRange: createIntakeField(aggregateTemperatureRange(input.items), "local", "medium", { needsReview: true }),
    source: createIntakeField(input.source ?? "manual", input.source ? "user" : "default", "high", { needsReview: false }),
    /* v1.0: 创建流程默认不收藏,详情页可单独切换 */
    favorite: createIntakeField(false, "default", "high", { needsReview: false }),
    notes: textField(input.notes, "", now),
    processingIssues: issues,
    createdAt: now,
    updatedAt: now,
  };
}

function buildImageIssues(input: LocalImageProcessingResult): IntakeProcessingIssue[] {
  const issues: IntakeProcessingIssue[] = [];
  if (input.transparentBackgroundStatus === "failed") {
    issues.push(createIntakeIssue("transparent_background_failed", "背景较复杂，暂未生成透明底；已保留裁切图，不影响后续录入", { severity: "info" }));
  }
  if (!input.thumbnailDataUrl) {
    issues.push(createIntakeIssue("thumbnail_failed", "缩略图未生成，将使用裁切图显示", { severity: "info" }));
  }
  if (!input.mainColor) {
    issues.push(createIntakeIssue("main_color_failed", "主色提取不稳定，将交给 AI 判断", { severity: "review" }));
  }
  for (const warning of input.qualityWarnings ?? []) {
    issues.push(createIntakeIssue("image_quality_low", warning, { severity: "review" }));
  }
  return issues;
}

function clampAiConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function textField(value: string | undefined, fallback: string, _now: string, reason?: string) {
  const clean = value?.trim();
  return createIntakeField(clean ?? fallback, clean ? "local" : "default", clean ? "medium" : "low", {
    needsReview: !clean,
    reason,
  });
}

function buildOutfitName(itemNames: string[]): string {
  if (itemNames.length === 0) return "待确认套装";
  if (itemNames.length === 1) return `${itemNames[0]}套装`;
  return `${itemNames[0]}等${itemNames.length}件`;
}

function aggregateSeasons(items: WardrobeItem[]): Season[] {
  const seasons = aggregateStrings(items.flatMap((item) => item.seasons ?? [])) as Season[];
  return seasons.length ? seasons : defaultSeasons;
}

function aggregateTemperatureRange(items: WardrobeItem[]): TemperatureRange | null {
  const ranges = items.map((item) => item.temperatureRange).filter(Boolean) as TemperatureRange[];
  const mins = ranges.map((range) => range.minC).filter((value): value is number => typeof value === "number");
  const maxs = ranges.map((range) => range.maxC).filter((value): value is number => typeof value === "number");
  if (!mins.length && !maxs.length) return null;
  return {
    ...(mins.length ? { minC: Math.max(...mins) } : {}),
    ...(maxs.length ? { maxC: Math.min(...maxs) } : {}),
  };
}

function aggregateStrings(values: string[]): string[] {
  return uniqueStrings(values).slice(0, 6);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

// v1.0: 把单品的英文 styles枚举映射成中文标签, 不混入英文枚举
function aggregateStyleTagsAsChinese(items: WardrobeItem[]): string[] {
 const mapped: string[] = [];
 for (const item of items) {
 for (const s of item.styles ?? []) {
 const trimmed = typeof s === "string" ? s.trim() : "";
 if (!trimmed) continue;
 const label = STYLE_LABELS[s as GarmentStyle] ?? trimmed;
 mapped.push(label);
 }
 }
 return uniqueStrings(mapped).slice(0,6);
}

// v1.0: 根据中文风格标签推断中文场景标签
function inferScenesFromStyles(styleTags: string[]): string[] {
 if (styleTags.length ===0) return [];
 const map: Record<string, string[]> = {
休闲: ["日常", "周末出行"],
通勤: ["通勤", "办公"],
户外: ["户外", "郊游"],
旅行: ["旅行", "度假"],
吃饭: ["聚餐", "朋友聚会"],
甜美: ["约会", "逛街"],
优雅: ["约会", "正式场合"],
 };
 const scenes = new Set<string>();
 for (const tag of styleTags) {
 for (const scene of map[tag] ?? []) scenes.add(scene);
 }
 if (scenes.size ===0) return ["日常"];
 return Array.from(scenes).slice(0,5);
}
