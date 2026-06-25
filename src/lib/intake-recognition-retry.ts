// v1.1.31 commit2 — 当前单件重新识别 / 失败草稿 / 手工恢复门禁
// 单点模块化：
// - AI_RETRY_FIELD_KEYS: 重新识别时只允许 AI 覆盖的字段白名单
// - mergeRetryRecognitionDraft: 保留 user 字段、非 AI 业务字段、图片与标识
// - buildFailedRecognitionDraft: 失败草稿（blocking issue = ai_recognition_failed）
// - isFailedDraftManualRecoveryComplete: 用户手工补全后是否可保存
// - validateSubcategoryForCategory: 跨分类 subcategory 校验

import type { GarmentIntakeDraft, IntakeField, IntakeFieldSource } from "@/lib/intake-draft";
import { createIntakeField, createIntakeIssue } from "@/lib/intake-draft";
import type { ColorInfo, GarmentCategory } from "@/lib/types";
import { getCategoryGroupById } from "@/lib/garment-category-catalog";

/** v1.1.31 commit2: 重新识别时 AI 可覆盖的字段白名单。source === "user" 始终保留。 */
export const AI_RETRY_FIELD_KEYS = [
  "name",
  "category",
  "subcategory",
  "colors",
  "seasons",
  "styles",
  "formality",
  "warmth",
  "temperatureRange",
  "material",
  "fitGender",
  "fitNotes",
  "notes",
] as const;

/** v1.1.31 commit2: 重新识别时永远保留的业务字段（不论 source）。 */
const ALWAYS_KEEP_KEYS = [
  "locationId",
  "status",
  "price",
  "productUrl",
  "purchaseDate",
] as const;

/** v1.1.31 commit2: 永远保留的 image/identity 字段。 */
const IDENTITY_KEYS = [
  "id",
  "kind",
  "imageDataUrl",
  "sourceImageDataUrl",
  "croppedImageDataUrl",
  "cropBox",
  "thumbnailDataUrl",
  "transparentImageDataUrl",
  "useTransparentImage",
  "createdAt",
] as const;

type GarmentFieldKey = keyof GarmentIntakeDraft;

/** v1.1.31 commit2: 合并当前草稿 + 重新识别草稿。 */
export function mergeRetryRecognitionDraft(
  current: GarmentIntakeDraft,
  incoming: GarmentIntakeDraft,
): GarmentIntakeDraft {
  const now = new Date().toISOString();
  const result: GarmentIntakeDraft = { ...current, updatedAt: now };

  // 1. AI 可覆盖字段：user 字段保留；否则取 incoming。
  for (const key of AI_RETRY_FIELD_KEYS) {
    const currentField = current[key] as IntakeField<unknown> | undefined;
    const incomingField = incoming[key] as IntakeField<unknown> | undefined;
    if (!incomingField) continue;
    if (currentField && currentField.source === "user") {
      // 保留用户值
      continue;
    }
    (result as unknown as Record<string, unknown>)[key] = incomingField;
  }

  // 2. 永远保留：locationId / status / price / productUrl / purchaseDate
  for (const key of ALWAYS_KEEP_KEYS) {
    (result as unknown as Record<string, unknown>)[key] = current[key as GarmentFieldKey];
  }

  // 3. 永远保留 image & identity
  for (const key of IDENTITY_KEYS) {
    (result as unknown as Record<string, unknown>)[key] = current[key as GarmentFieldKey];
  }

  // 4. 删除 ai_recognition_failed issue，保留非 AI 类 issue
  result.processingIssues = current.processingIssues.filter(
    (issue) => issue.code !== "ai_recognition_failed",
  );

  return result;
}

/** v1.1.31 commit2: 失败草稿：固定结构，含 blocking ai_recognition_failed issue。 */
export interface FailedRecognitionDraftInput {
  id?: string;
  imageDataUrl?: string;
  sourceImageDataUrl?: string;
  cropBox?: GarmentIntakeDraft["cropBox"];
  thumbnailDataUrl?: string;
  transparentImageDataUrl?: string;
  useTransparentImage?: IntakeField<boolean>;
  /** v1.1.31 commit2: 真实衣橱 ID，仅用于失败草稿默认值。 */
  locationId?: string;
}

export function buildFailedRecognitionDraft(
  base: FailedRecognitionDraftInput,
  now: string = new Date().toISOString(),
): GarmentIntakeDraft {
  const colors: ColorInfo = { mode: "single", primary: "" };
  return {
    id: base.id ?? `garment-failed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "garment",
    imageDataUrl: base.imageDataUrl,
    sourceImageDataUrl: base.sourceImageDataUrl,
    croppedImageDataUrl: base.imageDataUrl,
    cropBox: base.cropBox,
    thumbnailDataUrl: base.thumbnailDataUrl,
    transparentImageDataUrl: base.transparentImageDataUrl,
    useTransparentImage: base.useTransparentImage ?? createIntakeField(false, "default", "low", { needsReview: false }),
    name: createIntakeField("", "default", "low", { needsReview: true }),
    category: createIntakeField("tops", "default", "low", { needsReview: true }),
    subcategory: createIntakeField("", "default", "low", { needsReview: true }),
    colors: createIntakeField(colors, "default", "low", { needsReview: true }),
    seasons: createIntakeField(["all"], "default", "low", { needsReview: true }),
    styles: createIntakeField(["casual"], "default", "low", { needsReview: true }),
    formality: createIntakeField(2, "default", "low", { needsReview: true }),
    warmth: createIntakeField(2, "default", "low", { needsReview: true }),
    temperatureRange: createIntakeField(null, "default", "low", { needsReview: true }),
    locationId: createIntakeField(base.locationId ?? "home", base.locationId ? "local" : "default", "low", { needsReview: !base.locationId }),
    status: createIntakeField("active", "default", "low", { needsReview: false }),
    material: createIntakeField("", "default", "low", { needsReview: true }),
    fitGender: createIntakeField("unknown", "default", "low", { needsReview: true }),
    notes: createIntakeField("", "default", "low", { needsReview: true }),
    processingIssues: [
      createIntakeIssue("ai_recognition_failed", "AI 识别失败，请重新识别或手动填写名称、分类和颜色。", { severity: "blocking", recoverable: true }),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

/** v1.1.31 commit2: 失败草稿在用户手工补全后是否达到保存门禁。 */
export function isFailedDraftManualRecoveryComplete(draft: GarmentIntakeDraft): boolean {
  // 必须满足：名称非空 + 分类为 user source + 颜色有 primary
  if (!draft.name.value.trim()) return false;
  if (draft.category.source !== "user") return false;
  if (!draft.colors.value || (draft.colors.value.mode === "single" && !draft.colors.value.primary)) return false;
  // v1.1.31 patch5: 不再依赖 calculateDraftReviewSummary().blockingIssues。
  // 失败草稿带 blocking ai_recognition_failed issue 正是要由本函数判定满足后被
  // patchReviewDraft 移除；若再以 blockingIssues > 0 短路会陷入死循环：
  //   用户填齐 → 仍然 false → issue 删不掉 → calculateDraftReviewSummary().canSave=false。
  return true;
}

/** v1.1.31 commit3: 跨分类 subcategory 校验。 */
export function validateSubcategoryForCategory(
  category: GarmentCategory,
  subcategory: string | undefined,
): string | undefined {
  if (!subcategory) return undefined;
  const group = getCategoryGroupById(category);
  if (!group) return undefined;
  const exists = group.subcategories.some((s) => s.id === subcategory);
  return exists ? subcategory : undefined;
}

/** v1.1.31 commit2: 把用户当前字段标成 user source，便于门禁判定。 */
export function markFieldAsUser<T>(field: IntakeField<T>): IntakeField<T> {
  return { ...field, source: "user" as IntakeFieldSource, confidence: "high", needsReview: false };
}
