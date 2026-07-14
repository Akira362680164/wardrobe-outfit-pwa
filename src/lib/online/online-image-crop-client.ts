"use client";

import type { ImageCropSuggestionResponse } from "@wardrobe/cloud-contracts";
import { onlineRequest } from "@/lib/online/online-request";

export async function requestImageCropSuggestion(input: { clientItemId: string; revision: number; imageDataUrl: string }): Promise<ImageCropSuggestionResponse> {
  const matched = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(input.imageDataUrl);
  if (!matched) throw new Error("图片格式不支持自动裁切");
  return onlineRequest<ImageCropSuggestionResponse>("/api/workspace/images/crop-suggestion", {
    method: "POST",
    timeoutMs: 15_000,
    body: { clientItemId: input.clientItemId, revision: input.revision, mimeType: matched[1].toLowerCase(), imageBase64: matched[2] },
  });
}
