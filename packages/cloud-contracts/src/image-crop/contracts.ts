import { z } from "zod";

/** Clients may issue up to ten independent single-image requests at once. */
export const IMAGE_CROP_MAX_IN_FLIGHT = 10;

export const NormalizedCropBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).superRefine((box, context) => {
  if (box.x + box.width > 1 + Number.EPSILON) context.addIssue({ code: z.ZodIssueCode.custom, message: "cropBox exceeds image width" });
  if (box.y + box.height > 1 + Number.EPSILON) context.addIssue({ code: z.ZodIssueCode.custom, message: "cropBox exceeds image height" });
});

export const ImageCropSourceSchema = z.enum(["minimax_grid", "u2netp", "manual"]);
export const ImageCropCoordinateSpaceSchema = z.literal("exif-corrected-normalized-top-left");
export const ImageCropReasonCodeSchema = z.enum([
  "low_confidence",
  "touches_edge",
  "empty_foreground",
  "transparent_or_blank",
  "model_unavailable",
  "processing_timeout",
  "processing_failed",
]);

export const ImageCropSuggestionSchema = z.object({
  clientItemId: z.string().min(1).max(160),
  cropBox: NormalizedCropBoxSchema,
  source: ImageCropSourceSchema,
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  reasonCodes: z.array(ImageCropReasonCodeSchema),
  modelVersion: z.string().min(1).max(120),
  coordinateSpace: ImageCropCoordinateSpaceSchema,
});

export const ImageCropSuggestionRequestSchema = z.object({
  clientItemId: z.string().min(1).max(160),
  revision: z.number().int().nonnegative(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  imageBase64: z.string().min(4).max(10_500_000),
});

export const ImageCropSuggestionResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  suggestion: ImageCropSuggestionSchema,
});

export type NormalizedCropBox = z.infer<typeof NormalizedCropBoxSchema>;
export type ImageCropSuggestion = z.infer<typeof ImageCropSuggestionSchema>;
export type ImageCropSuggestionRequest = z.infer<typeof ImageCropSuggestionRequestSchema>;
export type ImageCropSuggestionResponse = z.infer<typeof ImageCropSuggestionResponseSchema>;

/** Expand by 20% of the detected width/height on every side, then clamp. */
export function expandCropBoxEachSide(box: NormalizedCropBox, ratio = 0.2): NormalizedCropBox {
  const x = Math.max(0, box.x - box.width * ratio);
  const y = Math.max(0, box.y - box.height * ratio);
  const right = Math.min(1, box.x + box.width + box.width * ratio);
  const bottom = Math.min(1, box.y + box.height + box.height * ratio);
  return { x, y, width: right - x, height: bottom - y };
}

export const FULL_IMAGE_CROP_BOX: NormalizedCropBox = { x: 0, y: 0, width: 1, height: 1 };

export function composeNestedCropBoxes(preCropBox: NormalizedCropBox, secondaryCropBox: NormalizedCropBox | undefined): NormalizedCropBox {
  const pre = NormalizedCropBoxSchema.safeParse(preCropBox);
  const secondary = secondaryCropBox ? NormalizedCropBoxSchema.safeParse(secondaryCropBox) : undefined;
  if (!pre.success) return FULL_IMAGE_CROP_BOX;
  if (!secondary?.success) return pre.data;
  const raw = {
    x: pre.data.x + secondary.data.x * pre.data.width,
    y: pre.data.y + secondary.data.y * pre.data.height,
    width: secondary.data.width * pre.data.width,
    height: secondary.data.height * pre.data.height,
  };
  const right = Math.min(pre.data.x + pre.data.width, Math.max(pre.data.x, raw.x + raw.width));
  const bottom = Math.min(pre.data.y + pre.data.height, Math.max(pre.data.y, raw.y + raw.height));
  const x = Math.min(right, Math.max(pre.data.x, raw.x));
  const y = Math.min(bottom, Math.max(pre.data.y, raw.y));
  return { x, y, width: right - x, height: bottom - y };
}

export function rotateNormalizedCropBox(box: NormalizedCropBox, clockwiseDegrees: 0 | 90 | 180 | 270): NormalizedCropBox {
  if (clockwiseDegrees === 90) return { x: 1 - box.y - box.height, y: box.x, width: box.height, height: box.width };
  if (clockwiseDegrees === 180) return { x: 1 - box.x - box.width, y: 1 - box.y - box.height, width: box.width, height: box.height };
  if (clockwiseDegrees === 270) return { x: box.y, y: 1 - box.x - box.width, width: box.height, height: box.width };
  return { ...box };
}
