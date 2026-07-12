import type { IntakeCropBox, IntakeCropRatio } from "./intake";

export type CropTarget = "intake" | "garment-edit" | "wishlist-edit" | "tryon" | "profile";

export interface CropJob {
  id: string;
  target: CropTarget;
  targetId?: string;
  sourcePath: string;
  cropBox?: IntakeCropBox;
  rotationDeg: 0 | 90 | 180 | 270;
  cropRatio: IntakeCropRatio;
}

export interface CropResult extends Omit<CropJob, "id"> {
  jobId: string;
  processedPath: string;
  cropBox: IntakeCropBox;
}

let activeJob: CropJob | null = null;
let pendingResult: CropResult | null = null;

export function startCropJob(input: Omit<CropJob, "id">): CropJob {
  const job: CropJob = {
    ...input,
    id: `crop-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
  activeJob = job;
  pendingResult = null;
  return job;
}

export function getCropJob(id?: string): CropJob | null {
  if (!activeJob || (id && activeJob.id !== id)) return null;
  return activeJob;
}

export function completeCropJob(result: CropResult): void {
  pendingResult = result;
  activeJob = null;
}

export function cancelCropJob(id?: string): void {
  if (!id || activeJob?.id === id) activeJob = null;
}

export function consumeCropResult(target: CropTarget, targetId?: string): CropResult | null {
  if (!pendingResult || pendingResult.target !== target) return null;
  if (targetId && pendingResult.targetId !== targetId) return null;
  const result = pendingResult;
  pendingResult = null;
  return result;
}

export function clearCropWorkflow(): void {
  activeJob = null;
  pendingResult = null;
}
