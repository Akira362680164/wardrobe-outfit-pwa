import { calculateDraftReviewSummary, type GarmentIntakeDraft } from "@/lib/intake-draft";
import type { NormalizedCropBox } from "@/lib/image";

export const GARMENT_INTAKE_MAX_IMAGES = 20;

export type GarmentIntakeImageSource = "camera" | "album";

export type GarmentIntakeImageStatus =
  | "selected"
  | "cropping"
  | "cropped"
  | "recognizing"
  | "recognized"
  | "failed";

export interface GarmentIntakeImageItem {
  id: string;
  fileName: string;
  source: GarmentIntakeImageSource;
  originalDataUrl: string;
  displayDataUrl: string;
  croppedImageDataUrl?: string;
  thumbnailDataUrl?: string;
  cropBox?: NormalizedCropBox;
  rotationDeg: 0 | 90 | 180 | 270;
  status: GarmentIntakeImageStatus;
  draft?: GarmentIntakeDraft;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GarmentIntakePickedImage {
  fileName: string;
  source: GarmentIntakeImageSource;
  dataUrl: string;
}

export interface GarmentIntakeBatchSaveResult {
  total: number;
  saved: number;
  failed: number;
  failedIds: string[];
}

export function createGarmentIntakeImageItem(
  input: GarmentIntakePickedImage,
  now?: string,
): GarmentIntakeImageItem {
  const timestamp = now ?? new Date().toISOString();
  return {
    id: `img-${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: input.fileName,
    source: input.source,
    originalDataUrl: input.dataUrl,
    displayDataUrl: input.dataUrl,
    rotationDeg: 0,
    status: "selected",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function appendGarmentIntakeImages(
  current: GarmentIntakeImageItem[],
  incoming: GarmentIntakePickedImage[],
  now?: string,
): GarmentIntakeImageItem[] {
  const timestamp = now ?? new Date().toISOString();
  const newItems = incoming.map((img) => createGarmentIntakeImageItem(img, timestamp));
  const combined = [...current, ...newItems];
  if (combined.length > GARMENT_INTAKE_MAX_IMAGES) {
    return combined.slice(0, GARMENT_INTAKE_MAX_IMAGES);
  }
  return combined;
}

export function removeGarmentIntakeImage(
  current: GarmentIntakeImageItem[],
  id: string,
): GarmentIntakeImageItem[] {
  return current.filter((item) => item.id !== id);
}

export function moveGarmentIntakeImage(
  current: GarmentIntakeImageItem[],
  id: string,
  direction: "prev" | "next",
): GarmentIntakeImageItem[] {
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) return current;
  if (direction === "prev") {
    if (index === 0) return current;
    const next = [...current];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    return next;
  } else {
    if (index === current.length - 1) return current;
    const next = [...current];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    return next;
  }
}

export function setGarmentIntakeImageCrop(
  current: GarmentIntakeImageItem[],
  id: string,
  patch: {
    croppedImageDataUrl: string;
    cropBox?: NormalizedCropBox;
    thumbnailDataUrl?: string;
    rotationDeg?: 0 | 90 | 180 | 270;
  },
): GarmentIntakeImageItem[] {
  const now = new Date().toISOString();
  return current.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      croppedImageDataUrl: patch.croppedImageDataUrl,
      cropBox: patch.cropBox,
      thumbnailDataUrl: patch.thumbnailDataUrl,
      rotationDeg: patch.rotationDeg ?? item.rotationDeg,
      displayDataUrl: patch.croppedImageDataUrl,
      status: "cropped" as const,
      updatedAt: now,
    };
  });
}

export function setGarmentIntakeImageDraft(
  current: GarmentIntakeImageItem[],
  id: string,
  draft: GarmentIntakeDraft,
): GarmentIntakeImageItem[] {
  const now = new Date().toISOString();
  return current.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      draft,
      status: "recognized" as const,
      updatedAt: now,
    };
  });
}

export function setGarmentIntakeImageError(
  current: GarmentIntakeImageItem[],
  id: string,
  error: string,
): GarmentIntakeImageItem[] {
  const now = new Date().toISOString();
  return current.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      error,
      status: "failed" as const,
      updatedAt: now,
    };
  });
}

export function getRecognizedGarmentIntakeImages(
  current: GarmentIntakeImageItem[],
): GarmentIntakeImageItem[] {
  return current.filter((item) => item.status === "recognized");
}

export function getSavableGarmentIntakeImages(
  current: GarmentIntakeImageItem[],
): GarmentIntakeImageItem[] {
  // v1.1.31 commit2: 改为依赖 canSave，避免失败草稿 + 缺失字段被误判可保存。
  return current.filter((item) => {
    if (!item.draft) return false;
    if (item.status !== "recognized" && item.status !== "failed") return false;
    return calculateDraftReviewSummary(item.draft).canSave;
  });
}
// v1.1.31 commit2: 失败草稿 + 步骤 3 候选名单 + 成功名单 + 严格 savable。
// getReviewableGarmentIntakeImages: recognized + failed 都进步骤 3。
// getSuccessfullyRecognizedGarmentIntakeImages: 仅 recognized，便于统计“已识别 N 件”。
// getSavableGarmentIntakeImages: 仅依赖 draft.calculateDraftReviewSummary().canSave。
// setGarmentIntakeImageRecognitionFailure: 写失败草稿 + status=failed + error。

export function setGarmentIntakeImageRecognitionFailure(
  current: GarmentIntakeImageItem[],
  id: string,
  draft: GarmentIntakeDraft,
  error: string,
): GarmentIntakeImageItem[] {
  const now = new Date().toISOString();
  return current.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      draft,
      status: "failed" as const,
      error,
      updatedAt: now,
    };
  });
}

export function getReviewableGarmentIntakeImages(
  current: GarmentIntakeImageItem[],
): GarmentIntakeImageItem[] {
  return current.filter(
    (item) => (item.status === "recognized" || item.status === "failed") && Boolean(item.draft),
  );
}

export function getSuccessfullyRecognizedGarmentIntakeImages(
  current: GarmentIntakeImageItem[],
): GarmentIntakeImageItem[] {
  return current.filter((item) => item.status === "recognized" && Boolean(item.draft));
}
