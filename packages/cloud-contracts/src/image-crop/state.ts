import type { ImageCropSuggestion } from "./contracts.js";

export type ImageCropState = "idle" | "queued" | "processing" | "applied" | "failed" | "manual";

export interface ImageCropItemState {
  clientItemId: string;
  revision: number;
  cropState: ImageCropState;
  completed: boolean;
  suggestion?: ImageCropSuggestion;
  failureReason?: string;
}

export function queueImageCrop(item: ImageCropItemState): ImageCropItemState {
  return { ...item, revision: item.revision + 1, cropState: "queued", completed: false, suggestion: undefined, failureReason: undefined };
}

export function startImageCrop(item: ImageCropItemState, revision: number): ImageCropItemState {
  return revision === item.revision && item.cropState === "queued" ? { ...item, cropState: "processing" } : item;
}

export function applyAutomaticImageCrop(item: ImageCropItemState, revision: number, suggestion: ImageCropSuggestion): ImageCropItemState {
  if (revision !== item.revision || item.cropState === "manual") return item;
  return { ...item, cropState: "applied", completed: true, suggestion, failureReason: undefined };
}

export function failAutomaticImageCrop(item: ImageCropItemState, revision: number, reason: string): ImageCropItemState {
  if (revision !== item.revision || item.cropState === "manual") return item;
  return { ...item, cropState: "failed", completed: true, failureReason: reason, suggestion: undefined };
}

export function applyManualImageCrop(item: ImageCropItemState): ImageCropItemState {
  return { ...item, revision: item.revision + 1, cropState: "manual", completed: true, failureReason: undefined };
}

export function imageCropProgress(items: ImageCropItemState[]): { completed: number; total: number } {
  return { completed: items.filter((item) => item.completed).length, total: items.length };
}
