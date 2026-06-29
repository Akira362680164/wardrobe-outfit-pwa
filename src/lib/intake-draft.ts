import type {
  ColorInfo,
  GarmentCategory,
  GarmentFitGender,
  GarmentStatus,
  GarmentStyle,
  SavedOutfit,
  Season,
  TemperatureRange,
  WardrobeItem,
  WishlistStatus,
} from "@/lib/types";

export type IntakeFieldSource = "default" | "local" | "ai" | "user";
export type IntakeFieldConfidence = "high" | "medium" | "low" | "unknown";

export interface IntakeField<T> {
  value: T;
  source: IntakeFieldSource;
  confidence: IntakeFieldConfidence;
  needsReview?: boolean;
  reason?: string;
}

export type BatchAiItemStatus =
  | "pending"
  | "local_ready"
  | "ai_queued"
  | "ai_running"
  | "ai_done"
  | "needs_review"
  | "failed"
  | "skipped"
  | "confirmed";

export type IntakeDraftKind = "garment" | "wishlist" | "outfit";
export type IntakeIssueSeverity = "blocking" | "review" | "info";

export interface IntakeProcessingIssue {
  code:
    | "transparent_background_failed"
    | "thumbnail_failed"
    | "main_color_failed"
    | "image_quality_low"
    | "unknown_item_detected"
    | "missing_required_field"
    | "ai_recognition_failed";
  severity: IntakeIssueSeverity;
  message: string;
  recoverable: boolean;
}

export interface GarmentIntakeDraft {
  id: string;
  kind: "garment";
  imageDataUrl?: string;
  sourceImageDataUrl?: string;
  croppedImageDataUrl?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  thumbnailDataUrl?: string;
  transparentImageDataUrl?: string;
  useTransparentImage: IntakeField<boolean>;
  name: IntakeField<string>;
  category: IntakeField<GarmentCategory>;
  subcategory?: IntakeField<string>;
  colors: IntakeField<ColorInfo>;
  seasons: IntakeField<Season[]>;
  styles: IntakeField<GarmentStyle[]>;
  formality: IntakeField<number>;
  warmth: IntakeField<number>;
  temperatureRange?: IntakeField<TemperatureRange | null>;
  locationId: IntakeField<string>;
  status: IntakeField<GarmentStatus>;
  material?: IntakeField<string>;
  price?: IntakeField<string>;
  productUrl?: IntakeField<string>;
  purchaseDate?: IntakeField<string>;
  fitGender?: IntakeField<GarmentFitGender>;
  fitNotes?: IntakeField<string>;
  notes?: IntakeField<string>;
  processingIssues: IntakeProcessingIssue[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistIntakeDraft {
  id: string;
  kind: "wishlist";
  recognitionOnly: true;
  imageDataUrl?: string;
  sourceImageDataUrl?: string;
  croppedImageDataUrl?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  thumbnailDataUrl?: string;
  imageKind: IntakeField<"product_photo" | "product_screenshot" | "manual">;
  name: IntakeField<string>;
  category: IntakeField<GarmentCategory>;
  subcategory?: IntakeField<string>;
  colors: IntakeField<ColorInfo>;
  seasons: IntakeField<Season[]>;
  styles: IntakeField<GarmentStyle[]>;
  formality: IntakeField<number>;
  warmth: IntakeField<number>;
  temperatureRange?: IntakeField<TemperatureRange | null>;
  material?: IntakeField<string>;
  price?: IntakeField<string>;
  productUrl?: IntakeField<string>;
  fitGender?: IntakeField<GarmentFitGender>;
  fitNotes?: IntakeField<string>;
  notes?: IntakeField<string>;
  status: IntakeField<WishlistStatus>;
  processingIssues: IntakeProcessingIssue[];
  createdAt: string;
  updatedAt: string;
}

export interface OutfitIntakeDraft {
  id: string;
  kind: "outfit";
  imageDataUrl?: string;
  sourceImageDataUrl?: string;
  thumbnailDataUrl?: string;
  itemIds: IntakeField<number[]>;
  itemNames: IntakeField<string[]>;
  unknownItemNotes: IntakeField<string[]>;
  name: IntakeField<string>;
  seasons: IntakeField<Season[]>;
  sceneTags: IntakeField<string[]>;
  styleTags: IntakeField<string[]>;
  pairingTags: IntakeField<string[]>;
  temperatureRange: IntakeField<TemperatureRange | null>;
  source: IntakeField<SavedOutfit["source"]>;
  favorite: IntakeField<boolean>;
  notes: IntakeField<string>;
  processingIssues: IntakeProcessingIssue[];
  createdAt: string;
  updatedAt: string;
}

export type AnyIntakeDraft = GarmentIntakeDraft | WishlistIntakeDraft | OutfitIntakeDraft;

export interface BatchIntakeItem<TDraft extends AnyIntakeDraft = AnyIntakeDraft> {
  id: string;
  index: number;
  sourceImageDataUrl?: string;
  croppedImageDataUrl?: string;
  thumbnailDataUrl?: string;
  draft: TDraft;
  status: BatchAiItemStatus;
  error?: string;
}

export interface DraftReviewSummary {
  totalFields: number;
  needsReviewFields: number;
  missingRequiredFields: string[];
  blockingIssues: number;
  reviewIssues: number;
  transparentBackgroundFailed: boolean;
  canSave: boolean;
}

export interface BatchIntakeSummary {
  total: number;
  completed: number;
  saveable: number;
  failed: number;
  needsReview: number;
  confirmed: number;
  progressPercent: number;
  isProcessing: boolean;
  canSaveAny: boolean;
  canSaveAllSaveable: boolean;
}

const requiredFields: Record<IntakeDraftKind, string[]> = {
  garment: ["name", "category", "colors", "seasons", "styles", "locationId", "status"],
  wishlist: ["name", "category", "colors", "status"],
  outfit: ["name", "itemIds"],
};

export function createIntakeField<T>(
  value: T,
  source: IntakeFieldSource,
  confidence: IntakeFieldConfidence,
  options: { needsReview?: boolean; reason?: string } = {},
): IntakeField<T> {
  return {
    value,
    source,
    confidence,
    needsReview: options.needsReview ?? source !== "user",
    reason: options.reason,
  };
}

export function createIntakeIssue(
  code: IntakeProcessingIssue["code"],
  message: string,
  options: { severity?: IntakeIssueSeverity; recoverable?: boolean } = {},
): IntakeProcessingIssue {
  return {
    code,
    message,
    severity: options.severity ?? "review",
    recoverable: options.recoverable ?? true,
  };
}

export function createIntakeDraftId(kind: IntakeDraftKind, now = new Date().toISOString()): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${kind}-intake-${Date.parse(now) || Date.now()}-${suffix}`;
}

export function mergeIntakeFields<T>(
  fields: Array<IntakeField<T> | undefined | null>,
  options: { fieldKey?: string; defaultValue?: T } = {},
): IntakeField<T> | undefined {
  const candidates = fields.filter((field): field is IntakeField<T> => Boolean(field) && !isBlankValue(field!.value));
  if (options.defaultValue !== undefined) {
    candidates.push(createIntakeField(options.defaultValue, "default", "low", { needsReview: true }));
  }
  if (candidates.length === 0) return undefined;

  const winner = [...candidates].sort((a, b) => getFieldPriority(b) - getFieldPriority(a))[0]!;
  const localLow = candidates.find((field) => field.source === "local" && field.confidence === "low");
  if (
    options.fieldKey === "colors" &&
    winner.source === "ai" &&
    localLow &&
    getFieldPriority(winner) > getFieldPriority(localLow)
  ) {
    return {
      ...winner,
      needsReview: true,
      reason: winner.reason ?? "AI判断，请确认",
    };
  }
  return winner;
}

export function calculateDraftReviewSummary(draft: AnyIntakeDraft): DraftReviewSummary {
  const fields = collectDraftFields(draft);
  const missingRequiredFields = requiredFields[draft.kind].filter((key) => isBlankValue(fields[key]?.value));
  const blockingIssues = draft.processingIssues.filter((issue) => issue.severity === "blocking").length;
  const reviewIssues = draft.processingIssues.filter((issue) => issue.severity === "review").length;
  const transparentBackgroundFailed = draft.processingIssues.some((issue) => issue.code === "transparent_background_failed");
  return {
    totalFields: Object.keys(fields).length,
    needsReviewFields: Object.values(fields).filter((field) => field.needsReview).length,
    missingRequiredFields,
    blockingIssues,
    reviewIssues,
    transparentBackgroundFailed,
    canSave: blockingIssues === 0 && missingRequiredFields.length === 0,
  };
}

export function summarizeBatchIntakeItems(items: BatchIntakeItem[]): BatchIntakeSummary {
  const completedStatuses: BatchAiItemStatus[] = ["ai_done", "needs_review", "failed", "skipped", "confirmed"];
  const processingStatuses: BatchAiItemStatus[] = ["pending", "local_ready", "ai_queued", "ai_running"];
  const saveable = items.filter(isBatchIntakeItemSaveable).length;
  const completed = items.filter((item) => completedStatuses.includes(item.status)).length;
  return {
    total: items.length,
    completed,
    saveable,
    failed: items.filter((item) => item.status === "failed").length,
    needsReview: items.filter((item) => item.status === "needs_review").length,
    confirmed: items.filter((item) => item.status === "confirmed").length,
    progressPercent: items.length === 0 ? 0 : Math.round((completed / items.length) * 100),
    isProcessing: items.some((item) => processingStatuses.includes(item.status)),
    canSaveAny: saveable > 0,
    canSaveAllSaveable: saveable > 0 && items.every((item) => item.status === "failed" || item.status === "skipped" || isBatchIntakeItemSaveable(item)),
  };
}

export function isBatchIntakeItemSaveable(item: BatchIntakeItem): boolean {
  if (!["local_ready", "ai_done", "needs_review", "confirmed"].includes(item.status)) return false;
  return calculateDraftReviewSummary(item.draft).canSave;
}

export function collectItemIdsFromWardrobeItems(items: WardrobeItem[]): number[] {
  return items.map((item) => item.id).filter((id): id is number => typeof id === "number" && Number.isFinite(id));
}

function collectDraftFields(draft: AnyIntakeDraft): Record<string, IntakeField<unknown>> {
  const result: Record<string, IntakeField<unknown>> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (key === "processingIssues") continue;
    if (isIntakeField(value)) result[key] = value as IntakeField<unknown>;
  }
  return result;
}

function isIntakeField(value: unknown): value is IntakeField<unknown> {
  if (!value || typeof value !== "object") return false;
  return "source" in value && "confidence" in value && "value" in value;
}

function getFieldPriority(field: IntakeField<unknown>): number {
  if (field.source === "user") return 1000;
  if (field.source === "ai" && field.confidence === "high") return 800;
  if (field.source === "local" && field.confidence === "high") return 700;
  if (field.source === "ai" && field.confidence === "medium") return 600;
  if (field.source === "ai" && field.confidence === "low") return 500;
  if (field.source === "local" && field.confidence === "medium") return 400;
  if (field.source === "local" && field.confidence === "low") return 300;
  if (field.source === "default") return 100;
  return 0;
}

function isBlankValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
