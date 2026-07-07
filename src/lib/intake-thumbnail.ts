import type { GarmentIntakeDraft } from "@/lib/intake-draft";
import { generateThumbnailSafe, prepareGarmentThumbnail } from "@/lib/thumbnail-runtime";

export const INTAKE_THUMBNAIL_GENERATION_FAILED = "INTAKE_THUMBNAIL_GENERATION_FAILED";

export function isIntakeThumbnailGenerationError(error: unknown): boolean {
  return error instanceof Error && error.message === INTAKE_THUMBNAIL_GENERATION_FAILED;
}

export async function ensureGarmentIntakeDraftThumbnail(
  draft: GarmentIntakeDraft,
): Promise<GarmentIntakeDraft> {
  if (!draft.imageDataUrl) throw new Error("GARMENT_ORIGINAL_IMAGE_MISSING");
  const cropRevision = draft.cropRevision ?? (draft.cropBox ? 1 : 0);
  if (
    draft.thumbnailDataUrl
    && (draft.thumbnailCropRevision ?? cropRevision) === cropRevision
  ) {
    return {
      ...draft,
      cropRevision,
      thumbnailCropRevision: draft.thumbnailCropRevision ?? cropRevision,
    };
  }
  const thumbnail = await prepareGarmentThumbnail({
    originalDataUrl: draft.imageDataUrl,
    cropBox: draft.cropBox,
    cropRevision,
  });
  if (thumbnail.thumbnailStatus !== "ready" || !thumbnail.thumbnailDataUrl) {
    throw new Error(INTAKE_THUMBNAIL_GENERATION_FAILED);
  }
  return {
    ...draft,
    cropRevision,
    thumbnailDataUrl: thumbnail.thumbnailDataUrl,
    thumbnailCropRevision: thumbnail.thumbnailCropRevision ?? cropRevision,
  };
}

type LocalImageDraft = {
  localOriginalDataUrl?: string;
  localCroppedPreviewDataUrl?: string;
  localThumbnailDataUrl?: string;
  localCropBox?: GarmentIntakeDraft["cropBox"];
};

export async function ensureLocalImageThumbnail<TDraft extends LocalImageDraft>(
  draft: TDraft,
): Promise<TDraft> {
  if (!isDataImage(draft.localOriginalDataUrl) || isDataImage(draft.localThumbnailDataUrl)) return draft;
  const thumbnail = draft.localCropBox
    ? await prepareGarmentThumbnail({
        originalDataUrl: draft.localOriginalDataUrl,
        cropBox: draft.localCropBox,
      })
    : await generateThumbnailSafe(draft.localCroppedPreviewDataUrl || draft.localOriginalDataUrl);
  if (thumbnail.thumbnailStatus !== "ready" || !thumbnail.thumbnailDataUrl) {
    throw new Error(INTAKE_THUMBNAIL_GENERATION_FAILED);
  }
  return { ...draft, localThumbnailDataUrl: thumbnail.thumbnailDataUrl };
}

function isDataImage(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}
