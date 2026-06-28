"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Loader2,
  RefreshCw,
  RotateCw,
  Save,
  Shirt,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { IntakeFlowShell, type IntakeFlowStep } from "@/components/intake-flow-shell";
import { ImageCropEditor, type ImageCropEditorHandle } from "@/components/image-crop-editor";
import { CategorySubcategoryPicker } from "@/components/category-subcategory-picker";
import { FitGenderChips } from "@/components/fit-gender-chips";
import { TemperatureRangeSlider } from "@/components/temperature-range-slider";
import { getIntakeSourceLabel } from "@/components/intake-source-badge";
import { AiConfidencePill, calculateDraftConfidenceScore } from "@/components/item/ai-confidence-pill";
import { ReviewPill } from "@/components/item/review-pill";
import { EditSectionCard } from "@/components/item-shell/edit-section-card";
import { ItemColorFields } from "@/components/item/color-fields";
import {
  createIntakeField,
  type DraftReviewSummary,
  type GarmentIntakeDraft,
  type IntakeField,
  type IntakeFieldSource,
} from "@/lib/intake-draft";
import {
  buildLocalGarmentDraft,
  type LocalImageProcessingResult,
} from "@/lib/intake-local-draft";
import { fileToCompressedDataUrl, rotateImageDataUrl } from "@/lib/image";
import { GarmentRecognitionError } from "@/lib/device-minimax";
import { generateThumbnailSafe } from "@/lib/thumbnail-runtime";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import {
  FIT_NOTES_MAX_LEN,
  SEASON_LABELS,
  STATUS_LABELS,
  STYLE_LABELS,
  type ClosetLocation,
  type GarmentCategory,
  type GarmentFitGender,
  type GarmentStatus,
  type GarmentStyle,
  type Season,
  type TemperatureRange,
} from "@/lib/types";
import {
  GARMENT_INTAKE_MAX_IMAGES,
  createGarmentIntakeImageItem,
  appendGarmentIntakeImages,
  removeGarmentIntakeImage,
  setGarmentIntakeImageCrop,
  setGarmentIntakeImageDraft,
  getRecognizedGarmentIntakeImages,
  getReviewableGarmentIntakeImages,
  getSavableGarmentIntakeImages,
  setGarmentIntakeImageRecognitionFailure,
  type GarmentIntakeImageItem,
  type GarmentIntakePickedImage,
} from "@/lib/garment-intake-multi-image";
import {
  buildFailedRecognitionDraft,
  isFailedDraftManualRecoveryComplete,
  mergeRetryRecognitionDraft,
  validateSubcategoryForCategory,
} from "@/lib/intake-recognition-retry";

export type IntakeAsyncResult<T> = T | Promise<T>;

export type GarmentImageSource = "camera" | "album";

export interface GarmentImageProcessingInput {
  imageDataUrl: string;
  sourceImageDataUrl?: string;
  /** v1.1.31 commit2: 真实 fileName，从 picked image 传入。仅用于诊断/请求上下文。 */
  fileName?: string;
}

export interface GarmentIntakeFlowProps {
  title?: string;
  flowKind?: "garment" | "wishlist";
  initialImages?: GarmentIntakePickedImage[];
  initialDrafts?: GarmentIntakeDraft[];
  /** v1.1.31 commit1: 真实衣橱位置列表，必传。种草流程也会传入但 UI 不展示。 */
  locations: ClosetLocation[];
  defaultLocationId?: string;
  isSaving?: boolean;
  onPickImages: (source: GarmentImageSource, remaining: number) => IntakeAsyncResult<GarmentIntakePickedImage[]>;
  onProcessImage?: (input: GarmentImageProcessingInput) => IntakeAsyncResult<LocalImageProcessingResult>;
  onEnhanceDraft?: (draft: GarmentIntakeDraft) => IntakeAsyncResult<GarmentIntakeDraft>;
  onDraftChange?: (drafts: GarmentIntakeDraft[]) => void;
  onSaveBatch: (drafts: GarmentIntakeDraft[]) => IntakeAsyncResult<void>;
  onExit?: () => void;
}

// P2-01 fix: 两步录入 — AI 识别是过渡状态，不是独立步骤
export const GARMENT_INTAKE_STEPS: IntakeFlowStep[] = [
  { id: "select_photo", label: "选择照片" },
  { id: "confirm_params", label: "确认信息" },
];

export const CATEGORY_OPTIONS: GarmentCategory[] = [
  "tops",
  "pants",
  "skirts",
  "one_piece",
  "shoes",
  "bags",
  "hats",
  "jewelry",
  "accessories",
];

export const SEASON_OPTIONS: Season[] = ["spring", "summer", "autumn", "winter", "all"];
export const STYLE_OPTIONS: GarmentStyle[] = ["casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation"];
export const STATUS_OPTIONS: GarmentStatus[] = ["active", "laundry", "repair", "archived"];

export function GarmentIntakeFlow({
  title = "添加单品",
  flowKind = "garment",
  initialImages,
  initialDrafts: _initialDrafts,
  defaultLocationId = "home",
  locations,
  isSaving = false,
  onPickImages,
  onProcessImage,
  onEnhanceDraft: _onEnhanceDraft,
  onDraftChange: _onDraftChange,
  onSaveBatch,
  onExit,
}: GarmentIntakeFlowProps) {
  const [stepIndex, setStepIndex] = useState<"select_photo" | "confirm_params">("select_photo");
  const [imageItems, setImageItems] = useState<GarmentIntakeImageItem[]>(() => {
    if (initialImages && initialImages.length > 0) {
      return initialImages.map((img) => createGarmentIntakeImageItem(img));
    }
    return [];
  });
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionProgress, setRecognitionProgress] = useState<{ current: number; total: number } | null>(null);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [error, setError] = useState("");
  // v1.1.31 commit2: 当前单件重新识别状态。
  const [retryingReviewId, setRetryingReviewId] = useState<string | null>(null);
  // v1.1.31 commit2: 部分保存确认
  const [pendingSaveDrafts, setPendingSaveDrafts] = useState<GarmentIntakeDraft[] | null>(null);

  const activeImage = useMemo(
    () => imageItems.find((item) => item.id === activeImageId) ?? null,
    [imageItems, activeImageId],
  );

  // v1.1.31 commit2: 步骤 3 候选名单 = recognized + failed。
  const recognizedItems = useMemo(() => getReviewableGarmentIntakeImages(imageItems), [imageItems]);
  const successCount = useMemo(
    () => getRecognizedGarmentIntakeImages(imageItems).length,
    [imageItems],
  );
  const savableItems = useMemo(() => getSavableGarmentIntakeImages(imageItems), [imageItems]);

  const activeReviewIndex = useMemo(() => {
    if (!activeReviewId) return 0;
    const idx = recognizedItems.findIndex((item) => item.id === activeReviewId);
    return idx >= 0 ? idx : 0;
  }, [recognizedItems, activeReviewId]);

  const locked = isPicking || isCropping || isRecognizing || isSavingBatch || isSaving || retryingReviewId !== null;
  const flowNoun = flowKind === "wishlist" ? "种草" : "单品";

  // Initialize activeReviewId when entering confirm step
  useEffect(() => {
    if (stepIndex === "confirm_params" && recognizedItems.length > 0 && !activeReviewId) {
      setActiveReviewId(recognizedItems[0].id);
    }
  }, [stepIndex, recognizedItems, activeReviewId]);

  // v1.1.20-dev commit2 (P1 诊断): intake_flow_step_changed — 单品录入
  // 录入卡哪步 / 步骤切换轨迹都在日志里, 复现"为什么没保存"必备。
  useEffect(() => {
    recordDiagnosticEvent("intake_flow_step_changed", {
      flow: flowKind,
      step: stepIndex,
      imageCount: imageItems.length,
      recognizedCount: recognizedItems.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, flowKind]);

  function getActiveIndex() {
    if (!activeImageId) return -1;
    return imageItems.findIndex((item) => item.id === activeImageId);
  }

  async function handleAddFromCamera() {
    if (isPicking) return;
    setIsPicking(true);
    setError("");
    try {
      const picked = await onPickImages("camera", GARMENT_INTAKE_MAX_IMAGES - imageItems.length);
      if (picked.length > 0) {
        const remaining = GARMENT_INTAKE_MAX_IMAGES - imageItems.length;
        const toAdd = picked.slice(0, Math.min(picked.length, remaining));
        if (picked.length > remaining) {
          setError(`最多一次录入 ${GARMENT_INTAKE_MAX_IMAGES} 张图片，已截断`);
        }
        setImageItems((prev) => appendGarmentIntakeImages(prev, toAdd));
      }
    } catch (err) {
      setError(formatIntakeError(err, "图片读取失败，请重试"));
    } finally {
      setIsPicking(false);
    }
  }

  async function handleAddFromAlbum() {
    if (isPicking) return;
    setIsPicking(true);
    setError("");
    try {
      const picked = await onPickImages("album", GARMENT_INTAKE_MAX_IMAGES - imageItems.length);
      if (picked.length > 0) {
        const remaining = GARMENT_INTAKE_MAX_IMAGES - imageItems.length;
        const toAdd = picked.slice(0, Math.min(picked.length, remaining));
        if (picked.length > remaining) {
          setError(`最多一次录入 ${GARMENT_INTAKE_MAX_IMAGES} 张图片，已截断`);
        }
        setImageItems((prev) => appendGarmentIntakeImages(prev, toAdd));
      }
    } catch (err) {
      setError(formatIntakeError(err, "图片读取失败，请重试"));
    } finally {
      setIsPicking(false);
    }
  }

  function handleRemoveImage(id: string) {
    setImageItems((prev) => removeGarmentIntakeImage(prev, id));
    if (activeImageId === id) {
      const remaining = imageItems.filter((item) => item.id !== id);
      if (remaining.length === 0) {
        setActiveImageId(null);
      } else {
        const idx = imageItems.findIndex((item) => item.id === id);
        const nextIdx = idx > 0 ? idx - 1 : 0;
        setActiveImageId(remaining[nextIdx]?.id ?? null);
      }
    }
  }

  function handleClearAll() {
    setImageItems([]);
    setActiveImageId(null);
  }

  async function handleCropConfirm(croppedDataUrl: string, cropBox?: import("@/lib/image").NormalizedCropBox) {
    if (!activeImageId || !activeImage) return;
    setIsCropping(false);
    try {
      const thumbnailDataUrl = await generateThumbnailSafe(croppedDataUrl);
      setImageItems((prev) =>
        setGarmentIntakeImageCrop(prev, activeImageId, {
          croppedImageDataUrl: croppedDataUrl,
          cropBox,
          thumbnailDataUrl: thumbnailDataUrl.thumbnailDataUrl,
        }),
      );
    } catch {
      setError("裁切失败，请重试");
    }
  }

  const handleRotate = useCallback(async (direction: "left" | "right") => {
    if (!activeImageId || !activeImage) return;
    const newDeg = direction === "left"
      ? ((activeImage.rotationDeg - 90 + 360) % 360) as 0 | 90 | 180 | 270
      : ((activeImage.rotationDeg + 90) % 360) as 0 | 90 | 180 | 270;
    try {
      const sourceUrl = activeImage.croppedImageDataUrl ?? activeImage.originalDataUrl;
      const rotateDeg = newDeg === 0 ? 90 : newDeg; // ponytail: use 90 for the actual rotation
      const rotated = await rotateImageDataUrl(sourceUrl, rotateDeg as 90 | 180 | 270);
      const thumbnailDataUrl = await generateThumbnailSafe(rotated);
      setImageItems((prev) =>
        prev.map((item) => {
          if (item.id !== activeImageId) return item;
          return {
            ...item,
            rotationDeg: newDeg,
            displayDataUrl: rotated,
            croppedImageDataUrl: rotated,
            thumbnailDataUrl: thumbnailDataUrl.thumbnailDataUrl,
            cropBox: undefined,
          };
        }),
      );
    } catch {
      setError("旋转图片失败，请重试");
    }
  }, [activeImageId, activeImage, setImageItems, setError]);

  async function handleResetCrop() {
    if (!activeImageId || !activeImage) return;
    try {
      const { thumbnailDataUrl } = await generateThumbnailSafe(activeImage.originalDataUrl);
      setImageItems((prev) =>
        prev.map((item) => {
          if (item.id !== activeImageId) return item;
          return {
            ...item,
            displayDataUrl: item.originalDataUrl,
            croppedImageDataUrl: undefined,
            cropBox: undefined,
            rotationDeg: 0 as const,
            thumbnailDataUrl,
            status: "selected" as const,
          };
        }),
      );
    } catch {
      setImageItems((prev) =>
        prev.map((item) => {
          if (item.id !== activeImageId) return item;
          return {
            ...item,
            displayDataUrl: item.originalDataUrl,
            croppedImageDataUrl: undefined,
            cropBox: undefined,
            rotationDeg: 0 as const,
            status: "selected" as const,
          };
        }),
      );
    }
  }

  async function handleDeleteCurrentImage() {
    if (!activeImageId) return;
    const idx = getActiveIndex();
    handleRemoveImage(activeImageId);
    // After removal, select adjacent image
    const remaining = imageItems.filter((item) => item.id !== activeImageId);
    if (remaining.length === 0) {
      setActiveImageId(null);
      setStepIndex("select_photo");
    } else {
      const nextIdx = Math.min(idx, remaining.length - 1);
      setActiveImageId(remaining[nextIdx]?.id ?? null);
    }
  }

  function handlePrevImage() {
    const idx = getActiveIndex();
    if (idx > 0) {
      setActiveImageId(imageItems[idx - 1].id);
    }
  }

  function handleNextImage() {
    const idx = getActiveIndex();
    if (idx < imageItems.length - 1) {
      setActiveImageId(imageItems[idx + 1].id);
    }
  }

  async function processAllImagesForRecognition() {
    setIsRecognizing(true);
    setRecognitionProgress(null);
    setError("");
    try {
      const pendingItems = imageItems.filter(
        (item) => item.status !== "failed" && item.status !== "recognized",
      );
      const total = pendingItems.length;
      const reviewableBefore = imageItems.filter(
        (item) => (item.status === "recognized" || item.status === "failed") && item.draft,
      ).length;
      let completed = 0;
      let newlyResolved = 0;

      if (total === 0) {
        if (reviewableBefore > 0) {
          setStepIndex("confirm_params");
        }
        return;
      }

      for (const item of pendingItems) {
        completed += 1;
        setRecognitionProgress({ current: completed, total });
        setImageItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "recognizing" as const } : it,
          ),
        );
        try {
          const draft = await recognizeImageItem(item);
          setImageItems((prev) => setGarmentIntakeImageDraft(prev, item.id, draft));
          newlyResolved += 1;
        } catch (err) {
          // v1.1.31 commit2: 失败写失败草稿 + status=failed + 错误文案，绝不假成功。
          const message = err instanceof Error ? err.message : "识别失败";
          const imageToProcess = item.croppedImageDataUrl ?? item.displayDataUrl ?? item.originalDataUrl;
          const failedDraft = buildFailedRecognitionDraft({
            id: item.draft?.id,
            imageDataUrl: imageToProcess,
            sourceImageDataUrl: item.originalDataUrl,
            cropBox: item.cropBox,
            thumbnailDataUrl: item.thumbnailDataUrl,
            transparentImageDataUrl: item.draft?.transparentImageDataUrl,
            locationId: defaultLocationId,
          });
          setImageItems((prev) =>
            setGarmentIntakeImageRecognitionFailure(prev, item.id, failedDraft, message),
          );
        }
      }
      // v1.1.31 commit2: 即使全部失败，只要存在失败草稿也进入步骤 3。
      const totalReviewable = reviewableBefore + newlyResolved + (total - newlyResolved);
      if (totalReviewable > 0) {
        // 找到第一个 reviewable item 作为 activeReviewId
        const firstReviewable = imageItems.find(
          (it) => (it.status === "recognized" || it.status === "failed") && it.draft,
        );
        if (firstReviewable) setActiveReviewId(firstReviewable.id);
        setStepIndex("confirm_params");
      }
    } finally {
      setIsRecognizing(false);
      setRecognitionProgress(null);
    }
  }

  // v1.1.31 commit2: 共享的"识别一张"函数，首次批量识别 + 步骤 3 重新识别都走这里。
  async function recognizeImageItem(item: GarmentIntakeImageItem): Promise<GarmentIntakeDraft> {
    const imageToProcess =
      item.croppedImageDataUrl ?? item.displayDataUrl ?? item.originalDataUrl;
    if (!onProcessImage) {
      // 无 onProcessImage：返回 default 草稿。
      const result = fallbackImageProcessingResult(imageToProcess, "garment");
      return buildLocalGarmentDraft({
        ...result,
        imageDataUrl: imageToProcess,
        sourceImageDataUrl: item.originalDataUrl,
        cropBox: item.cropBox,
        thumbnailDataUrl: item.thumbnailDataUrl,
        locationId: defaultLocationId,
      });
    }
    const processed = await onProcessImage({
      imageDataUrl: imageToProcess,
      sourceImageDataUrl: item.originalDataUrl,
      fileName: item.fileName,
    });
    const aiTag = (processed as { aiTag?: import("@/lib/types").GarmentTagResult }).aiTag;
    if (!aiTag) {
      // v1.1.31 patch5: 任何"无 aiTag"的结果都不应伪装为可编辑默认草稿。
      // 由 processAllImagesForRecognition / handleRetryCurrentItem 的 catch 走 failed draft
      // 路径（status=failed + blocking ai_recognition_failed issue + 错误文案）。
      throw new GarmentRecognitionError(
        "not_configured",
        "未配置 MiniMax Key，无法进行 AI 识别。",
        false,
      );
    }
    const localDraft = buildLocalGarmentDraft({
      ...processed,
      ...mapAiTagToGarmentDraftInput(aiTag, item.fileName),
      imageDataUrl: imageToProcess,
      sourceImageDataUrl: item.originalDataUrl,
      cropBox: item.cropBox,
      thumbnailDataUrl: item.thumbnailDataUrl,
      locationId: defaultLocationId,
    });
    if (aiTag) {
      // v1.1.31 commit3: 跨分类 subcategory 校验。
      const safe = validateSubcategoryForCategory(
        localDraft.category.value,
        localDraft.subcategory?.value,
      );
      if (!safe && localDraft.subcategory) {
        localDraft.subcategory = {
          ...localDraft.subcategory,
          value: "",
          needsReview: true,
        };
      }
    }
    return localDraft;
  }

  // v1.1.31 commit2: 步骤 3 重新识别当前件。
  async function handleRetryCurrentItem(reviewId: string) {
    if (retryingReviewId) return; // 防重复点击
    const item = imageItems.find((it) => it.id === reviewId);
    if (!item) return;
    setRetryingReviewId(reviewId);
    setError("");
    const startedAt = Date.now();
    recordDiagnosticEvent("intake_single_retry_started", {
      flowKind,
      imageItemId: reviewId,
    });
    try {
      setImageItems((prev) =>
        prev.map((it) =>
          it.id === reviewId ? { ...it, status: "recognizing" as const, error: undefined } : it,
        ),
      );
      const newDraft = await recognizeImageItem(item);
      const merged = item.draft
        ? mergeRetryRecognitionDraft(item.draft, newDraft)
        : newDraft;
      setImageItems((prev) =>
        prev.map((it) => {
          if (it.id !== reviewId) return it;
          return {
            ...it,
            draft: merged,
            status: "recognized" as const,
            error: undefined,
            updatedAt: new Date().toISOString(),
          };
        }),
      );
      recordDiagnosticEvent("intake_single_retry_succeeded", {
        flowKind,
        imageItemId: reviewId,
        attemptDurationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "重新识别失败";
      recordDiagnosticEvent("intake_single_retry_failed", {
        flowKind,
        imageItemId: reviewId,
        attemptDurationMs: Date.now() - startedAt,
        errorCode: (err as { code?: string })?.code ?? "service",
      });
      // 失败时保留现有草稿，绝不重置为 garment 假成功。
      setImageItems((prev) =>
        prev.map((it) =>
          it.id === reviewId
            ? {
                ...it,
                status: item.status === "recognized" ? "recognized" as const : "failed" as const,
                error: msg,
                updatedAt: new Date().toISOString(),
              }
            : it,
        ),
      );
      setError(`重新识别失败：${msg}`);
    } finally {
      setRetryingReviewId(null);
    }
  }

  function handleBack() {
    if (locked) return;
    setError("");
    if (isCropping) {
      setIsCropping(false);
      return;
    }
    if (stepIndex === "confirm_params") {
      setStepIndex("select_photo");
      setActiveReviewId(null);
    }
  }

  async function handleNext() {
    if (locked) return;
    setError("");
    if (stepIndex === "select_photo") {
      if (imageItems.length === 0) {
        setError("请先拍照或选择相册图片");
        return;
      }
      // P2-01: 直接进入 AI 识别加载状态，跳过独立编辑步骤
      await processAllImagesForRecognition();
      return;
    }
    if (stepIndex === "confirm_params") {
      const drafts = savableItems.map((item) => item.draft!).filter(Boolean);
      if (drafts.length === 0) {
        setError(`没有可保存的${flowNoun}`);
        return;
      }
      // v1.1.31 commit2: 还有未完成项目时弹出部分保存确认。
      const remainingFailed = recognizedItems.length - savableItems.length;
      if (remainingFailed > 0) {
        setPendingSaveDrafts(drafts);
        return;
      }
      setIsSavingBatch(true);
      try {
        await onSaveBatch(drafts);
      } catch (err) {
        setError(formatIntakeError(err, `保存${flowNoun}失败，请重试`));
      } finally {
        setIsSavingBatch(false);
      }
    }
  }

  function patchReviewDraft(patch: Partial<GarmentIntakeDraft>) {
    if (!activeReviewId) return;
    setImageItems((prev) =>
      prev.map((item) => {
        if (item.id !== activeReviewId || !item.draft) return item;
        // P1-6: 切换大类时二级细分清空（避免「上衣-高跟鞋」矛盾组合，§4.2 业务规则）
        const merged = patch.category && patch.category.value !== item.draft.category.value
          ? { ...item.draft, ...patch, subcategory: userField<string>("") }
          : { ...item.draft, ...patch };
        // v1.1.31 commit2: 用户手动补全失败草稿后移除 blocking issue。
        if (
          merged.processingIssues.some((issue) => issue.code === "ai_recognition_failed" && issue.severity === "blocking") &&
          isFailedDraftManualRecoveryComplete(merged)
        ) {
          merged.processingIssues = merged.processingIssues.filter(
            (issue) => issue.code !== "ai_recognition_failed",
          );
        }
        // v1.1.31 commit3: 跨分类 subcategory 校验
        if (merged.subcategory && merged.subcategory.value) {
          const safe = validateSubcategoryForCategory(merged.category.value, merged.subcategory.value);
          if (!safe) {
            merged.subcategory = { ...merged.subcategory, value: "", needsReview: true };
          }
        }
        const updatedDraft = { ...merged, updatedAt: new Date().toISOString() };
        return { ...item, draft: updatedDraft };
      }),
    );
  }

  function handlePrevReview() {
    if (activeReviewIndex > 0) {
      setActiveReviewId(recognizedItems[activeReviewIndex - 1].id);
    }
  }

  function handleNextReview() {
    if (activeReviewIndex < recognizedItems.length - 1) {
      setActiveReviewId(recognizedItems[activeReviewIndex + 1].id);
    }
  }

  const stepIndexNumber = stepIndex === "select_photo" ? 0 : 1;

  const nextLabel =
    stepIndex === "select_photo"
      ? "下一步（AI 识别）"
      : `保存 ${savableItems.length} 件${flowNoun}`;

  const nextDisabled =
    locked ||
    (stepIndex === "select_photo" && imageItems.length === 0) ||
    (stepIndex === "confirm_params" && savableItems.length === 0);

  const hasUnsavedDraft = imageItems.length > 0;

  const processingText = isPicking
    ? "正在打开相册或读取图片..."
    : isCropping
      ? "正在处理图片..."
      : isRecognizing && recognitionProgress
        ? `正在识别第 ${recognitionProgress.current} 件 / 共 ${recognitionProgress.total} 件`
        : undefined;

  return (
    <IntakeFlowShell
      title={title}
      steps={GARMENT_INTAKE_STEPS}
      currentStepIndex={stepIndexNumber}
      isProcessing={isPicking || isCropping || isRecognizing || isSavingBatch}
      processingText={processingText}
      error={error}
      hasUnsavedDraft={hasUnsavedDraft}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      backDisabled={stepIndex === "select_photo"}
      onBack={handleBack}
      onNext={handleNext}
      onExit={onExit}
    >
      {stepIndex === "select_photo" ? (
        isCropping && activeImage ? (
          <MultiImageCropStep
            imageItem={activeImage}
            imageItems={imageItems}
            activeIndex={getActiveIndex()}
            onCropConfirm={handleCropConfirm}
            onRotate={handleRotate}
            onReset={handleResetCrop}
            onDelete={handleDeleteCurrentImage}
            onPrev={handlePrevImage}
            onNext={handleNextImage}
            onSelectImage={setActiveImageId}
          />
        ) : (
          <MultiImageSelectStep
            imageItems={imageItems}
            onAddFromCamera={handleAddFromCamera}
            onAddFromAlbum={handleAddFromAlbum}
            onRemoveImage={handleRemoveImage}
            onClearAll={handleClearAll}
            onSelectImage={setActiveImageId}
            activeImageId={activeImageId}
            isPicking={isPicking}
            flowKind={flowKind}
            onCropActive={() => { if (activeImage) setIsCropping(true); }}
          />
        )
      ) : null}
      {stepIndex === "confirm_params" && recognizedItems.length > 0 ? (
        <MultiImageReviewStep
          recognizedItems={recognizedItems}
          successCount={successCount}
          activeReviewId={activeReviewId}
          activeReviewIndex={activeReviewIndex}
          onPatchDraft={patchReviewDraft}
          onPrev={handlePrevReview}
          onNext={handleNextReview}
          onSelectItem={setActiveReviewId}
          onRetryCurrent={handleRetryCurrentItem}
          retryingReviewId={retryingReviewId}
          flowKind={flowKind}
          locations={locations}
        />
      ) : null}
      {pendingSaveDrafts ? (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/35 px-4" onClick={() => setPendingSaveDrafts(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-base font-semibold">还有 {recognizedItems.length - pendingSaveDrafts.length} 件{flowNoun}尚未完成确认</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/58">
              本次将保存 {pendingSaveDrafts.length} 件，未完成的 {recognizedItems.length - pendingSaveDrafts.length} 件不会入库。
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPendingSaveDrafts(null)} className="h-11 rounded-lg border border-ink/10 bg-white text-sm font-semibold">
                继续修改
              </button>
              <button
                type="button"
                onClick={async () => {
                  const drafts = pendingSaveDrafts;
                  setPendingSaveDrafts(null);
                  setIsSavingBatch(true);
                  try {
                    await onSaveBatch(drafts);
                  } catch (err) {
                    setError(formatIntakeError(err, `保存${flowNoun}失败，请重试`));
                  } finally {
                    setIsSavingBatch(false);
                  }
                }}
                className="h-11 rounded-lg bg-denim text-sm font-semibold text-white"
              >
                保存 {pendingSaveDrafts.length} 件
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </IntakeFlowShell>
  );
}

// Step 1: Multi-image selection — v1.1.14 uses IntakeStepOneImagePicker
function MultiImageSelectStep({
  imageItems,
  onAddFromCamera,
  onAddFromAlbum,
  onRemoveImage,
  onClearAll,
  onSelectImage,
  activeImageId,
  isPicking,
  flowKind,
  onCropActive,
}: {
  imageItems: GarmentIntakeImageItem[];
  onAddFromCamera: () => void;
  onAddFromAlbum: () => void;
  onRemoveImage: (id: string) => void;
  onClearAll: () => void;
  onSelectImage: (id: string) => void;
  activeImageId: string | null;
  isPicking: boolean;
  flowKind: "garment" | "wishlist";
  onCropActive?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasImages = imageItems.length > 0;
  const displayItems = expanded ? imageItems : imageItems.slice(0, 4);
  const extraCount = expanded ? 0 : imageItems.length - 4;
  const flowNoun = flowKind === "wishlist" ? "种草" : "单品";

  // Custom preview: shown inside IntakeStepSection when images are selected
  const previewNode = hasImages ? (
    <>
      <p className="text-xs text-ink/55 mb-2">已选择 {imageItems.length} 张{flowNoun}照片，可点击缩略图裁切/旋转图片</p>
      <div className="overflow-hidden rounded-lg bg-mist mb-3">
        {activeImageId ? (
          <img
            src={imageItems.find((i) => i.id === activeImageId)?.displayDataUrl ?? ""}
            alt="当前选中图片"
            className="h-[min(58dvh,420px)] w-full object-contain"
          />
        ) : (
          <img
            src={imageItems[0].displayDataUrl}
            alt="已选图片"
            className="h-[min(58dvh,420px)] w-full object-contain"
          />
        )}
      </div>
      {/* Thumbnail row */}
      <div className="flex gap-2 flex-wrap mb-3">
        {displayItems.map((item, idx) => (
          <div
            key={item.id}
            className={`relative w-14 h-14 rounded-lg overflow-hidden border-2 ${
              item.id === activeImageId ? "border-denim" : "border-transparent"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectImage(item.id)}
              className="block h-full w-full"
              aria-label={`选择第 ${idx + 1} 张图片`}
            >
              <img src={item.displayDataUrl} alt={`缩略图 ${idx + 1}`} className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => onRemoveImage(item.id)}
              className="absolute -top-1 -right-1 z-10 w-5 h-5 rounded-full bg-clay text-white grid place-items-center"
              aria-label={`删除第 ${idx + 1} 张图片`}
            >
              <X size={10} />
            </button>
            {item.status === "recognized" && (
              <span className="absolute bottom-0 left-0 right-0 bg-moss/80 text-white text-[9px] text-center py-0.5">已识别</span>
            )}
            {item.status === "failed" && (
              <span className="absolute bottom-0 left-0 right-0 bg-clay/80 text-white text-[9px] text-center py-0.5">失败</span>
            )}
          </div>
        ))}
        {extraCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-14 h-14 rounded-lg bg-ink/10 grid place-items-center text-xs font-semibold text-ink/55"
          >
            +{extraCount}
          </button>
        )}
      </div>
      {activeImageId && onCropActive ? (
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={onCropActive}
            className="flex-1 h-9 rounded-lg border border-ink/10 bg-white text-xs font-semibold"
          >
            裁切/旋转
          </button>
          <button
            type="button"
            onClick={() => onRemoveImage(activeImageId)}
            className="w-20 h-9 rounded-lg border border-clay/30 text-clay text-xs font-semibold"
          >
            删除
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAddFromCamera}
          disabled={isPicking}
          className="flex-1 h-10 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35 flex items-center justify-center gap-1"
        >
          <Camera size={14} /> 继续拍照
        </button>
        <button
          type="button"
          onClick={onAddFromAlbum}
          disabled={isPicking}
          className="flex-1 h-10 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35 flex items-center justify-center gap-1"
        >
          <ImageIcon size={14} /> 继续从图库选择
        </button>
      </div>
      <button
        type="button"
        onClick={onClearAll}
        className="w-full h-10 rounded-lg border border-clay/30 text-clay text-sm font-semibold mt-2"
      >
        清空
      </button>
    </>
  ) : undefined;

  return (
    <IntakeStepOneImagePicker
      icon={<Shirt size={16} aria-hidden="true" />}
      title={`选择${flowNoun}照片`}
      placeholder={`请拍照或从图库选择${flowNoun}图片`}
      pickedCount={imageItems.length}
      maxCount={20}
      onCameraClick={onAddFromCamera}
      onGalleryClick={onAddFromAlbum}
      disabled={isPicking}
      previewNode={previewNode}
    />
  );
}

// Step 2: Multi-image crop
function MultiImageCropStep({
  imageItem,
  imageItems,
  activeIndex,
  onCropConfirm,
  onRotate,
  onReset,
  onDelete,
  onPrev,
  onNext,
  onSelectImage,
}: {
  imageItem: GarmentIntakeImageItem;
  imageItems: GarmentIntakeImageItem[];
  activeIndex: number;
  onCropConfirm: (croppedDataUrl: string, cropBox?: import("@/lib/image").NormalizedCropBox) => void;
  onRotate: (direction: "left" | "right") => void;
  onReset: () => void;
  onDelete: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectImage: (id: string) => void;
}) {
  const cropEditorRef = useRef<ImageCropEditorHandle>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropReady, setCropReady] = useState(false);

  function handleConfirmCrop(croppedDataUrl: string, cropBox: import("@/lib/image").NormalizedCropBox) {
    onCropConfirm(croppedDataUrl || imageItem.displayDataUrl, cropBox);
    setShowCropper(false);
    setCropReady(false);
  }

  if (showCropper) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100dvh - 280px)", minHeight: 360 }}>
        <IntakeStepSection
          title="拖动图片调整取景范围"
          icon={<Shirt size={16} aria-hidden="true" />}
        >
          <div className="text-xs text-ink/50 mb-2">裁切和旋转后将用于 AI 识别与正式入库</div>
        </IntakeStepSection>
        <div className="flex-1 min-h-0">
          <ImageCropEditor
            ref={cropEditorRef}
            source={imageItem.displayDataUrl}
            variant="embedded"
            onCancel={() => {
              setCropReady(false);
              setShowCropper(false);
            }}
            onConfirm={handleConfirmCrop}
            onReadyChange={setCropReady}
          />
        </div>
        <div className="flex gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setShowCropper(false)}
            className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => cropEditorRef.current?.rotate()}
            className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <RotateCw size={16} /> 旋转
          </button>
          <button
            type="button"
            onClick={() => cropEditorRef.current?.runConfirm()}
            disabled={!cropReady}
            className="flex-1 h-12 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-35"
          >
            确认图片
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <IntakeStepSection
        title={`正在编辑 ${activeIndex + 1} / ${imageItems.length}`}
        icon={<Shirt size={16} aria-hidden="true" />}
      >
        <div className="overflow-hidden rounded-lg bg-mist">
          <img
            src={imageItem.displayDataUrl}
            alt="待处理图片"
            className="h-[min(58dvh,420px)] w-full object-contain"
          />
        </div>
      </IntakeStepSection>

      <div className="flex gap-2 px-4">
        <button
          type="button"
          onClick={() => {
            setCropReady(false);
            setShowCropper(true);
          }}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35"
        >
          裁切
        </button>
        <button
          type="button"
          onClick={() => onRotate("right")}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold flex items-center justify-center gap-1"
        >
          <RotateCw size={16} /> 旋转
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold"
        >
          重置
        </button>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center justify-center gap-1 mx-4 h-10 rounded-lg border border-clay/30 text-clay text-sm font-semibold"
      >
        <Trash2 size={14} /> 删除此图
      </button>

      {/* Thumbnail strip */}
      <div className="flex min-w-0 gap-2 px-4 overflow-x-auto pb-1">
        {imageItems.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectImage(item.id)}
            className={`relative w-12 h-12 shrink-0 rounded-lg overflow-hidden border-2 ${
              item.id === imageItem.id ? "border-denim" : "border-transparent"
            }`}
          >
            <img src={item.displayDataUrl} alt={`图片${idx + 1}`} className="w-full h-full object-cover" />
            {/* v1.1.16-dev commit1 §3.4.1 第 5 点: 显示「AI 正在识别第 N 张」 */}
            {item.status === "recognizing" && (
              <span className="absolute inset-0 bg-denim/55 grid place-items-center text-[8px] font-semibold text-white">识别中</span>
            )}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-2 px-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={activeIndex === 0}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35 flex items-center justify-center gap-1"
        >
          <ChevronLeft size={16} /> 上一张
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={activeIndex >= imageItems.length - 1}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35 flex items-center justify-center gap-1"
        >
          下一张 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// Step 3: Multi-image review
function MultiImageReviewStep({
  recognizedItems,
  successCount,
  activeReviewId,
  activeReviewIndex,
  onPatchDraft,
  onPrev,
  onNext,
  onSelectItem,
  onRetryCurrent,
  retryingReviewId,
  flowKind,
  locations,
}: {
  recognizedItems: GarmentIntakeImageItem[];
  successCount: number;
  activeReviewId: string | null;
  activeReviewIndex: number;
  onPatchDraft: (patch: Partial<GarmentIntakeDraft>) => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectItem: (id: string) => void;
  onRetryCurrent: (reviewId: string) => void;
  retryingReviewId: string | null;
  flowKind: "garment" | "wishlist";
  locations: ClosetLocation[];
}) {
  const activeItem = recognizedItems.find((item) => item.id === activeReviewId);
  const draft = activeItem?.draft;
  const visibleNeedsReviewFields = draft ? countStep3VisibleNeedsReviewFields(draft) : 0;
  const flowNoun = flowKind === "wishlist" ? "种草" : "单品";
  const previewDataUrl = activeItem?.draft?.croppedImageDataUrl
    ?? activeItem?.draft?.imageDataUrl
    ?? activeItem?.displayDataUrl
    ?? "";
  // v1.1.16-dev commit1 §3.4.1 第 8 点: 失败草稿顶部显示「AI 识别失败,已生成待确认草稿」banner
  const aiFailed = activeItem?.status === "failed";

  return (
    <div className="grid min-w-0 max-w-full gap-4 overflow-hidden">
      {aiFailed ? (
        <div className="rounded-lg border border-clay/40 bg-clay/8 px-3 py-2.5 text-xs text-clay" role="alert">
          AI 识别失败，已生成待确认草稿。请手动填写名称、分类、颜色等信息。
        </div>
      ) : null}
      <IntakeStepSection
        title={
          successCount < recognizedItems.length
            ? `已识别 ${successCount} / ${recognizedItems.length} 件${flowNoun}`
            : `已识别 ${recognizedItems.length} 件${flowNoun}`
        }
        icon={<Tag size={16} aria-hidden="true" />}
        right={
          activeReviewId ? (
            retryingReviewId === activeReviewId ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-denim/10 px-2 py-1 text-[11px] font-medium text-denim"
                aria-live="polite"
              >
                <Loader2 size={12} className="animate-spin" aria-hidden="true" /> 识别中
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onRetryCurrent(activeReviewId)}
                disabled={retryingReviewId !== null}
                className="inline-flex items-center gap-1 rounded-md bg-denim/10 px-2 py-1 text-[11px] font-medium text-denim active:bg-denim/20 disabled:opacity-50"
                aria-label="重新识别当前单品"
                data-intake-action="retry-current-item"
              >
                <RefreshCw size={12} aria-hidden="true" /> 重新识别
              </button>
            )
          ) : null
        }
      >
        {previewDataUrl ? (
          <div className="mb-3 overflow-hidden rounded-lg bg-mist">
            <img
              src={previewDataUrl}
              alt={`当前${flowNoun}图片`}
              className="h-[min(48dvh,420px)] w-full object-contain"
            />
          </div>
        ) : null}
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {recognizedItems.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (retryingReviewId) return;
                onSelectItem(item.id);
              }}
              disabled={retryingReviewId !== null && retryingReviewId !== item.id}
              className={`relative shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 ${
                item.id === activeReviewId ? "border-denim" : "border-transparent"
              } ${retryingReviewId && retryingReviewId !== item.id ? "opacity-50" : ""}`}
            >
              <img
                src={item.draft?.thumbnailDataUrl ?? item.displayDataUrl}
                alt={`单品${idx + 1}`}
                className="w-full h-full object-cover"
              />
              {retryingReviewId === item.id ? (
                <span className="absolute inset-0 grid place-items-center bg-denim/55 text-[8px] font-semibold text-white">
                  识别中
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </IntakeStepSection>

      {draft ? (
        <>
          <EditSectionCard
            title={flowKind === "wishlist" ? "校对种草草稿" : "校对衣物草稿"}
            icon={<Tag size={16} aria-hidden="true" />}
            right={
              draft ? (
                <DraftQualityRow
                  needsReviewFields={visibleNeedsReviewFields}
                  aiConfidenceScore={calculateDraftConfidenceScore(draft)}
                />
              ) : null
            }
          >
            <p className="text-xs leading-relaxed text-ink/50">
              核对 AI 识别结果，红色“待确认”字段建议手动确认后再保存。
            </p>
          </EditSectionCard>

          <EditSectionCard title="基础信息">
            <div className="grid gap-3" data-item-form-section="intake-basic">
              <TextField
                label="名称"
                value={draft.name.value}
                field={draft.name}
                onChange={(value) => onPatchDraft({ name: userField(value) })}
              />
              <CategorySubcategoryPicker
                category={draft.category.value}
                subcategory={draft.subcategory?.value}
                onCategoryChange={(next) => onPatchDraft({ category: userField<GarmentCategory>(next) })}
                onSubcategoryChange={(next) => onPatchDraft({ subcategory: userField<string>(next ?? "") })}
              />
              {flowKind === "garment" ? (
                <>
                  <SelectField
                    label="衣橱位置"
                    value={draft.locationId.value}
                    options={(locations ?? []).map((loc) => ({ value: loc.id, label: loc.name }))}
                    onChange={(value) => onPatchDraft({ locationId: userField(value) })}
                  />
                  <SelectField
                    label="状态"
                    value={draft.status.value}
                    options={STATUS_OPTIONS.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
                    onChange={(value) => onPatchDraft({ status: userField(value as GarmentStatus) })}
                  />
                </>
              ) : null}
              {flowKind === "wishlist" && draft.status ? (
                <SelectField
                  label="状态"
                  value={String(draft.status.value)}
                  options={[
                    { value: "interested", label: "感兴趣" },
                    { value: "rejected", label: "不感兴趣" },
                    { value: "archived", label: "归档" },
                  ]}
                  onChange={(value) => onPatchDraft({ status: userField(value as never) } as Partial<GarmentIntakeDraft>)}
                />
              ) : null}
              <TextField
                label={flowKind === "wishlist" ? "价格" : "购入价格"}
                value={draft.price?.value ?? ""}
                field={draft.price}
                placeholder="非必填，例如 399"
                onChange={(value) => onPatchDraft({ price: userField(value) })}
                optional
              />
              <TextField
                label={flowKind === "wishlist" ? "链接" : "商品链接"}
                value={draft.productUrl?.value ?? ""}
                field={draft.productUrl}
                placeholder="非必填，商品链接"
                onChange={(value) => onPatchDraft({ productUrl: userField(value) })}
                optional
              />
              {flowKind === "garment" ? (
                <TextField
                  label="购买日期"
                  value={draft.purchaseDate?.value ?? ""}
                  field={draft.purchaseDate}
                  placeholder="YYYY-MM-DD"
                  onChange={(value) => onPatchDraft({ purchaseDate: userField(value) })}
                  optional
                />
              ) : null}
            </div>
          </EditSectionCard>

          <EditSectionCard title="颜色">
            <div className="grid gap-3" data-item-form-section="intake-color">
              <ItemColorFields
                mode="edit"
                colors={draft.colors.value}
                sourceLabel={getIntakeSourceLabel(draft.colors)}
                onChange={(colors) => onPatchDraft({ colors: userField(colors) })}
              />
            </div>
          </EditSectionCard>

          <EditSectionCard title="穿着属性">
            <div className="grid gap-3" data-item-form-section="intake-wear">
              <FitGenderChips
                value={draft.fitGender?.value ?? "unknown"}
                sourceLabel={getIntakeSourceLabel(draft.fitGender)}
                onChange={(value) => onPatchDraft({ fitGender: userField<GarmentFitGender>(value) })}
              />
              <TextField
                label="版型说明"
                value={draft.fitNotes?.value ?? ""}
                field={draft.fitNotes}
                placeholder={`最多 ${FIT_NOTES_MAX_LEN} 字，例如「宽松男款衬衫，肩线下落」`}
                maxLength={FIT_NOTES_MAX_LEN}
                onChange={(value) => onPatchDraft({ fitNotes: userField(value) })}
                optional
              />
              <TagToggleGroup
                label="季节"
                values={draft.seasons.value}
                options={SEASON_OPTIONS.map((season) => ({ value: season, label: SEASON_LABELS[season] }))}
                onChange={(values) => onPatchDraft({ seasons: userField(values) })}
              />
              <TagToggleGroup
                label="风格"
                values={draft.styles.value}
                options={STYLE_OPTIONS.map((style) => ({ value: style, label: STYLE_LABELS[style] }))}
                onChange={(values) => onPatchDraft({ styles: userField(values) })}
              />
              <TextField
                label="材质"
                value={draft.material?.value ?? ""}
                field={draft.material}
                onChange={(value) => onPatchDraft({ material: userField(value) })}
                optional
              />
              <NumberStepper
                label="正式度"
                value={draft.formality.value}
                field={draft.formality}
                min={1}
                max={5}
                onChange={(value) => onPatchDraft({ formality: userField(value) })}
              />
              <NumberStepper
                label="保暖度"
                value={draft.warmth.value}
                field={draft.warmth}
                min={1}
                max={5}
                onChange={(value) => onPatchDraft({ warmth: userField(value) })}
              />
              <TemperatureRangeSlider
                value={draft.temperatureRange?.value ?? undefined}
                onChange={(value) => onPatchDraft({ temperatureRange: userField<TemperatureRange | null>(value) })}
              />
            </div>
          </EditSectionCard>

          <EditSectionCard title="备注">
            <div data-item-form-section="intake-notes">
              <TextareaField
                label="备注"
                value={draft.notes?.value ?? ""}
                field={draft.notes}
                placeholder="补充版型、材质观感或搭配提示"
                onChange={(value) => onPatchDraft({ notes: userField(value) })}
                optional
              />
            </div>
          </EditSectionCard>
        </>
      ) : null}

      {/* Navigation */}
      <div className="flex gap-2 px-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={activeReviewIndex === 0}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35 flex items-center justify-center gap-1"
        >
          <ChevronLeft size={16} /> 上一件
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={activeReviewIndex >= recognizedItems.length - 1}
          className="flex-1 h-12 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-35 flex items-center justify-center gap-1"
        >
          下一件 <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function IntakeStepSection({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon?: ReactNode;
  /** Optional right-side slot rendered next to the section title. */
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <EditSectionCard title={title} icon={icon} right={right}>
      {children}
    </EditSectionCard>
  );
}

export function FilePickCard({
  title,
  subtitle,
  icon,
  compact = false,
  capture,
  onClick,
  onFileSelected,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  compact?: boolean;
  capture?: "user" | "environment";
  onClick?: () => void;
  onFileSelected: (file: File | undefined) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-ink/10 bg-[#fbfbf8] text-center active:bg-mist ${
        compact ? "min-h-[64px] p-2" : "min-h-[116px] p-3"
      }`}
      onClick={onClick}
    >
      <input
        type="file"
        accept="image/*"
        capture={capture}
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => onFileSelected(event.target.files?.[0])}
      />
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-denim/10 text-denim">{icon}</span>
      <span className="mt-2 text-sm font-semibold">{title}</span>
      {subtitle ? <span className="mt-0.5 text-[11px] text-ink/45">{subtitle}</span> : null}
    </label>
  );
}

export function ProcessingResultList({
  rows,
}: {
  rows: Array<{ ok: boolean; text: string }>;
}) {
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.text} className="flex items-start gap-2 rounded-md bg-[#fbfbf8] px-2.5 py-2 text-xs text-ink/65">
          {row.ok ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden="true" />
          ) : (
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-clay" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 leading-relaxed">{row.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ProcessingIssueList({
  issues,
}: {
  issues: Array<{ code: string; severity: string; message: string; recoverable: boolean }>;
}) {
  if (issues.length === 0) return null;
  return (
    <IntakeStepSection title="需要留意" icon={<AlertTriangle size={16} aria-hidden="true" />}>
      <div className="grid gap-2">
        {issues.map((issue) => (
          <div key={`${issue.code}-${issue.message}`} className="rounded-md bg-clay/6 px-2.5 py-2 text-xs leading-relaxed text-ink/62">
            <span className="font-semibold text-clay">{issue.severity === "blocking" ? "阻塞" : issue.severity === "review" ? "需确认" : "提示"}</span>
            <span className="ml-1">{issue.message}</span>
          </div>
        ))}
      </div>
    </IntakeStepSection>
  );
}

export function DraftQualitySummary({ summary }: { summary: DraftReviewSummary }) {
  return (
    <section className="grid grid-cols-3 gap-2">
      <MetricPill label="字段" value={String(summary.totalFields)} />
      <MetricPill label="待确认" value={String(summary.needsReviewFields)} tone={summary.needsReviewFields > 0 ? "clay" : "moss"} />
      <MetricPill label="可保存" value={summary.canSave ? "是" : "否"} tone={summary.canSave ? "moss" : "clay"} />
    </section>
  );
}

/**
 * v1.1.23 six-page design §3.1 + §3.2: 校对草稿 section 标题行右侧 QualityRow。
 * - 左：整件级 AI 置信度胶囊 (AiConfidencePill)；无 score 时不渲染。
 * - 右：字段级"待确认 N" review-pill；N === 0 时不渲染。
 * - 仅用于 P1 衣橱录入 Step 3 / P2 种草录入 Step 3。详情/编辑页严禁使用。
 */
export function DraftQualityRow({
  needsReviewFields,
  aiConfidenceScore,
}: {
  needsReviewFields: number;
  aiConfidenceScore: number | null;
}) {
  return (
    <span className="flex items-center gap-1.5" data-quality-row="step3">
      <AiConfidencePill score={aiConfidenceScore} />
      {needsReviewFields > 0 ? (
        <ReviewPill show testId="review-pill-count" />
      ) : null}
      {needsReviewFields > 0 ? (
        <span className="text-[11px] font-semibold text-clay" aria-label={`待确认 ${needsReviewFields} 项`}>
          {needsReviewFields}
        </span>
      ) : null}
    </span>
  );
}

export function TextField<TValue extends string>({
  label,
  value,
  field,
  placeholder,
  onChange,
  maxLength,
  optional = false,
}: {
  label: string;
  value: TValue;
  field?: IntakeField<unknown>;
  placeholder?: string;
  onChange: (value: string) => void;
  maxLength?: number;
  optional?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <FieldLabel label={label} field={field} optional={optional} />
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        className="h-11 w-full min-w-0 rounded-lg border border-ink/10 bg-[#fbfbf8] px-3 text-sm outline-none focus:border-denim/45"
      />
      {maxLength ? (
        <span className="text-right text-[10px] text-ink/40">
          {value.length}/{maxLength}
        </span>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  value,
  field,
  options,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  field?: IntakeField<unknown>;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <FieldLabel label={label} field={field} optional={optional} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full min-w-0 rounded-lg border border-ink/10 bg-[#fbfbf8] px-3 text-sm outline-none focus:border-denim/45"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NumberStepper({
  label,
  value,
  field,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  field?: IntakeField<unknown>;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const safeValue = Math.min(max, Math.max(min, value));
  return (
    <div className="grid min-w-0 gap-1.5">
      <FieldLabel label={label} field={field} />
      <div className="grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-lg border border-ink/10 bg-[#fbfbf8]">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, safeValue - 1))}
          className="h-11 border-r border-ink/8 text-lg font-semibold text-denim disabled:opacity-35"
          disabled={safeValue <= min}
        >
          -
        </button>
        <div className="text-center text-sm font-semibold">{safeValue}</div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, safeValue + 1))}
          className="h-11 border-l border-ink/8 text-lg font-semibold text-denim disabled:opacity-35"
          disabled={safeValue >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function TagToggleGroup<TValue extends string>({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: TValue[];
  options: Array<{ value: TValue; label: string }>;
  onChange: (values: TValue[]) => void;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs font-medium text-ink/55">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(toggleArrayValue(values, option.value))}
              className={`min-h-[34px] rounded-full px-3 text-xs font-semibold ${
                selected ? "bg-denim text-white" : "border border-ink/10 bg-[#fbfbf8] text-ink/58"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// v1.1.14: 共享步骤一图片选择器，同时服务添加单品和添加种草步骤一
export function IntakeStepOneImagePicker({
  icon,
  title,
  placeholder,
  pickedCount,
  maxCount = 20,
  onCameraClick,
  onGalleryClick,
  disabled,
  previewNode,
}: {
  icon: ReactNode;
  title: string;
  placeholder: string;
  pickedCount?: number;
  maxCount?: number;
  onCameraClick: () => void;
  onGalleryClick: () => void;
  disabled?: boolean;
  previewNode?: ReactNode;
}) {
  return (
    <div className="grid gap-4">
      <IntakeStepSection title={title} icon={icon}>
        {previewNode ? previewNode : <EmptyStateBox text={placeholder} />}
      </IntakeStepSection>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onCameraClick}
          disabled={disabled}
          className="min-h-[144px] rounded-xl border border-ink/10 bg-white text-sm font-semibold flex flex-col items-center justify-center gap-2"
        >
          <Camera size={24} className="text-denim" />
          拍照
        </button>
        <button
          type="button"
          onClick={onGalleryClick}
          disabled={disabled}
          className="min-h-[144px] rounded-xl border border-ink/10 bg-white text-sm font-semibold flex flex-col items-center justify-center gap-2"
        >
          <ImageIcon size={24} className="text-denim" />
          从图库选择
        </button>
      </div>
      <p className="text-[10px] text-ink/40 text-center">
        {pickedCount !== undefined && pickedCount > 0
          ? `已选择 ${pickedCount} 张 · `
          : ""}
        支持一次选择多张，最多 {maxCount} 张
      </p>
    </div>
  );
}

export function EmptyStateBox({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-ink/12 bg-white/60 p-4 text-center text-xs text-ink/45">{text}</div>;
}

export function TextareaField({
  label,
  value,
  field,
  placeholder,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  field?: IntakeField<unknown>;
  placeholder?: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <FieldLabel label={label} field={field} optional={optional} />
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full min-w-0 resize-none rounded-lg border border-ink/10 bg-[#fbfbf8] px-3 py-2 text-sm leading-relaxed outline-none focus:border-denim/45"
      />
    </label>
  );
}

export function DraftFieldLine({
  label,
  field,
  value,
}: {
  label: string;
  field: IntakeField<unknown>;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)_52px] items-center gap-2 rounded-md bg-[#fbfbf8] px-2.5 py-2 text-xs">
      <span className="text-ink/45">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
      <FieldSourceBadge field={field} />
    </div>
  );
}

export function ConfirmSummaryCard({
  title,
  rows,
  footer,
  onEdit,
}: {
  title: string;
  rows: Array<[string, string]>;
  footer: string;
  onEdit: () => void;
}) {
  return (
    <IntakeStepSection title="确认信息" icon={<Save size={16} aria-hidden="true" />}>
      <div className="rounded-lg bg-[#fbfbf8] p-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-3 grid gap-2">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[74px_minmax(0,1fr)] gap-2 text-xs">
              <span className="text-ink/45">{label}</span>
              <span className="min-w-0 break-words font-medium">{value || "未填写"}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink/55">{footer}</p>
      <button type="button" onClick={onEdit} className="mt-3 h-10 w-full rounded-lg border border-ink/10 bg-white text-sm font-semibold text-ink/65">
        返回修改
      </button>
    </IntakeStepSection>
  );
}

export function ImagePreviewPanel({
  title,
  imageDataUrl,
}: {
  title: string;
  imageDataUrl: string;
}) {
  return (
    <IntakeStepSection title={title} icon={<ImageIcon size={16} aria-hidden="true" />}>
      {imageDataUrl ? (
        <div className="overflow-hidden rounded-lg bg-mist">
          <img src={imageDataUrl} alt={title} className="h-[min(58dvh,420px)] w-full object-contain" />
        </div>
      ) : (
        <EmptyStateBox text="暂无图片" />
      )}
    </IntakeStepSection>
  );
}

function FieldLabel({ label, field, optional = false }: { label: string; field?: IntakeField<unknown>; optional?: boolean }) {
  // v1.1.23 six-page design §3.2: 可选字段 (价格 / 链接 / 材质 / 购买日期 / 版型说明)
  // 缺失时一律不显示 "待确认" 胶囊。
  const hideBadge = optional && isEmptyFieldValue(field?.value);
  return (
    <span className="flex items-center justify-between gap-2 text-xs font-medium text-ink/55">
      <span>{label}</span>
      {field && !hideBadge ? <FieldSourceBadge field={field} /> : null}
    </span>
  );
}

const STEP3_VISIBLE_REVIEW_FIELD_KEYS = new Set([
  "name",
  "category",
  "subcategory",
  "colors",
  "seasons",
  "styles",
  "formality",
  "warmth",
  "temperatureRange",
  "locationId",
  "status",
  "material",
  "price",
  "productUrl",
  "purchaseDate",
  "fitGender",
  "fitNotes",
  "notes",
]);

const STEP3_OPTIONAL_REVIEW_FIELD_KEYS = new Set([
  "material",
  "price",
  "productUrl",
  "purchaseDate",
  "fitNotes",
  "notes",
]);

function countStep3VisibleNeedsReviewFields(draft: GarmentIntakeDraft): number {
  return Object.entries(draft).filter(([key, value]) => {
    if (!STEP3_VISIBLE_REVIEW_FIELD_KEYS.has(key)) return false;
    if (!isIntakeFieldForReview(value)) return false;
    if (!value.needsReview) return false;
    if (STEP3_OPTIONAL_REVIEW_FIELD_KEYS.has(key) && isEmptyFieldValue(value.value)) return false;
    return true;
  }).length;
}

function isIntakeFieldForReview(value: unknown): value is IntakeField<unknown> {
  return Boolean(value && typeof value === "object" && "value" in value && "source" in value && "confidence" in value);
}

function isEmptyFieldValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function FieldSourceBadge({ field }: { field: IntakeField<unknown> }) {
  // v1.1.23 six-page design §3.2: 字段右上角只保留 "待确认" 或不显示。
  // 默认 / 已修改 / AI 等 source 标签一律不再渲染。展示交给 ReviewPill。
  const show = field.needsReview || fieldSourceLabel(field.source, field.needsReview) === "待确认";
  return <ReviewPill show={show} />;
}

function MetricPill({
  label,
  value,
  tone = "denim",
}: {
  label: string;
  value: string;
  tone?: "denim" | "moss" | "clay";
}) {
  const toneClass = tone === "moss" ? "text-moss bg-moss/8" : tone === "clay" ? "text-clay bg-clay/8" : "text-denim bg-denim/8";
  return (
    <div className={`rounded-lg px-2.5 py-2 ${toneClass}`}>
      <div className="text-[10px] font-medium opacity-75">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

export function userField<T>(value: T): IntakeField<T> {
  return createIntakeField(value, "user", "high", { needsReview: false });
}

export function fallbackImageProcessingResult(imageDataUrl: string, mode: "garment" | "product_photo" | "product_screenshot"): LocalImageProcessingResult {
  void imageDataUrl;
  return {
    transparentBackgroundStatus: mode === "product_screenshot" ? "skipped" : "skipped",
    qualityWarnings: [],
  };
}

export async function buildIntakeThumbnailDataUrl(imageDataUrl: string, existingThumbnailDataUrl?: string): Promise<string | undefined> {
  if (existingThumbnailDataUrl && existingThumbnailDataUrl !== imageDataUrl) return existingThumbnailDataUrl;
  const result = await generateThumbnailSafe(imageDataUrl);
  return result.thumbnailDataUrl;
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return fileToCompressedDataUrl(file);
}

export function parseTagInput(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toggleArrayValue<TValue extends string>(values: TValue[], value: TValue): TValue[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/**
 * v1.1.23 six-page design §3.2: 字段 source 标签收紧。
 * - "默认" / "已修改" / "AI" 三类 source 标签全部删除。
 * - 仅当 needsReview === true 或 field 命中"识别失败 / 必填缺失 / 归一化失败"四规则时
 *   返回 "待确认"；其余 source 一律返回空串（UI 不显示胶囊）。
 * - 业务字段层应直接传 needsReview；本函数对 ai/local/default 三种 source
 *   在 needsReview 缺失时保守返回空串。
 */
export function fieldSourceLabel(source: IntakeFieldSource, needsReview = false): string {
  if (needsReview) return "待确认";
  // source === "user" 永远不需要 source badge (用户已主动确认)。
  if (source === "user") return "";
  // 兜底: ai / local / default 都不是 "待确认"。
  return "";
}

export function labelSeasons(seasons: Season[]): string {
  return seasons.map((season) => SEASON_LABELS[season]).join(" / ") || "未填写";
}

export function labelStyles(styles: GarmentStyle[]): string {
  return styles.map((style) => STYLE_LABELS[style]).join(" / ") || "未填写";
}

export function formatIntakeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && error.message !== "read_failed" && error.message !== "invalid_result") {
    return error.message;
  }
  return fallback;
}

// v1.1.16-dev commit1 §3.4.1: 把 MiniMax 返回的 GarmentTagResult 映射为
// BuildLocalGarmentDraftInput 的字段, 让 buildLocalGarmentDraft 生成 AI 字段为 source="ai" 的草稿。
function mapAiTagToGarmentDraftInput(tag: import("@/lib/types").GarmentTagResult, fallbackName: string) {
  const name = tag.candidateNames?.[0] || fallbackName;
  return {
    nameGuess: name,
    categoryGuess: tag.category,
    subcategory: tag.subcategory,
    colors: tag.colors,
    mainColorConfidence: (tag.confidence >= 0.7 ? "high" : "medium") as "high" | "medium" | "low",
    temperatureRange: tag.temperatureRange,
    seasons: tag.seasons,
    styles: tag.styles,
    formality: tag.formality,
    warmth: tag.warmth,
    notes: tag.notes,
    material: tag.material,
    fitGender: tag.fitGender,
    fitNotes: tag.fitNotes,
  } as Partial<{
    nameGuess: string;
    categoryGuess: import("@/lib/types").GarmentCategory;
    subcategory: string;
    colors: import("@/lib/types").ColorInfo;
    mainColorConfidence: "high" | "medium" | "low";
    temperatureRange: import("@/lib/types").TemperatureRange;
    seasons: import("@/lib/types").Season[];
    styles: import("@/lib/types").GarmentStyle[];
    formality: number;
    warmth: number;
    notes: string;
    material: string;
    fitGender: import("@/lib/types").GarmentFitGender;
    fitNotes: string;
  }>;
}
