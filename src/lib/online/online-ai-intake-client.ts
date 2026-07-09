"use client";

import type {
  AiGarmentRecognitionBatchResponse,
  AiGarmentRecognitionResponse,
  AiOutfitMetadataItem,
  AiOutfitMetadataResponse,
  MiniMaxRuntimeSettings,
} from "@wardrobe/cloud-contracts";

import type {
  DeviceMiniMaxSettings,
  GenerateOutfitMetadataInput,
  OutfitMetadataGenerationResult,
  SingleItemRecognition,
} from "@/lib/device-minimax";
import { onlineRequest } from "@/lib/online/online-request";
import type { WardrobeItem } from "@/lib/types";

const AI_RECOGNITION_MAX_BATCH_ITEMS = 10;
const AI_RECOGNITION_MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface RecognizeGarmentsBatchServerItem {
  imageItemId: string;
  aiRequestDataUrl: string;
  originalDataUrl: string;
  fileName: string;
}

export interface RecognizeGarmentsBatchServerResult {
  imageItemId: string;
  result?: SingleItemRecognition;
  error?: string;
}

export async function recognizeGarmentOnServer(input: {
  aiRequestDataUrl: string;
  originalDataUrl: string;
  fileName: string;
  settings: DeviceMiniMaxSettings;
}): Promise<SingleItemRecognition> {
  const response = await onlineRequest<AiGarmentRecognitionResponse>("/api/workspace/ai/intake/garment-recognition", {
    method: "POST",
    timeoutMs: input.settings.timeoutMs,
    body: {
      miniMax: toRuntimeSettings(input.settings),
      imageDataUrl: input.aiRequestDataUrl,
      fallbackName: input.fileName,
    },
  });
  return {
    tag: response.tag,
    imageDataUrl: input.originalDataUrl,
    sourceImageDataUrl: input.originalDataUrl,
  };
}

export async function recognizeGarmentsBatchOnServer(input: {
  items: RecognizeGarmentsBatchServerItem[];
  settings: DeviceMiniMaxSettings;
}): Promise<RecognizeGarmentsBatchServerResult[]> {
  const runtimeSettings = toRuntimeSettings(input.settings);
  const plan = planRecognitionBatches(input.items, runtimeSettings);
  const results: RecognizeGarmentsBatchServerResult[] = plan.tooLargeItems.map((item) => ({
    imageItemId: item.imageItemId,
    error: "图片超过 8MB AI 请求限制，请重新裁切或换一张图片",
  }));

  for (const chunk of plan.chunks) {
    try {
      const response = await onlineRequest<AiGarmentRecognitionBatchResponse>("/api/workspace/ai/intake/garment-recognition/batch", {
        method: "POST",
        timeoutMs: input.settings.timeoutMs,
        body: {
          miniMax: runtimeSettings,
          items: chunk.map((item) => ({
            clientItemId: item.imageItemId,
            imageDataUrl: item.aiRequestDataUrl,
            fallbackName: item.fileName,
          })),
        },
      });
      const responseById = new Map(response.items.map((item) => [item.clientItemId, item]));
      results.push(...chunk.map((item) => {
        const matched = responseById.get(item.imageItemId);
        if (!matched) return { imageItemId: item.imageItemId, error: "服务器未返回该图片识别结果" };
        if (matched.status === "failed") return { imageItemId: item.imageItemId, error: matched.error };
        return {
          imageItemId: item.imageItemId,
          result: {
            tag: matched.tag,
            imageDataUrl: item.originalDataUrl,
            sourceImageDataUrl: item.originalDataUrl,
          },
        };
      }));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "批量识别失败，请重试";
      results.push(...chunk.map((item) => ({ imageItemId: item.imageItemId, error: message })));
    }
  }

  const byId = new Map(results.map((item) => [item.imageItemId, item]));
  return input.items.map((item) => byId.get(item.imageItemId) ?? { imageItemId: item.imageItemId, error: "识别失败，请重试" });
}

export async function generateOutfitMetadataOnServer(
  input: GenerateOutfitMetadataInput,
  context: { outfitItems: WardrobeItem[]; allItems: WardrobeItem[] },
  settings: DeviceMiniMaxSettings,
): Promise<OutfitMetadataGenerationResult> {
  return onlineRequest<AiOutfitMetadataResponse>("/api/workspace/ai/intake/outfit-metadata", {
    method: "POST",
    timeoutMs: settings.timeoutMs,
    body: {
      miniMax: toRuntimeSettings(settings),
      itemIds: input.itemIds,
      name: input.name,
      outfitItems: context.outfitItems.map(toAiOutfitMetadataItem),
    },
  });
}

function planRecognitionBatches(items: RecognizeGarmentsBatchServerItem[], settings: MiniMaxRuntimeSettings) {
  const chunks: RecognizeGarmentsBatchServerItem[][] = [];
  const tooLargeItems: RecognizeGarmentsBatchServerItem[] = [];
  let current: RecognizeGarmentsBatchServerItem[] = [];

  for (const item of items) {
    if (recognitionBatchBodySize([item], settings) > AI_RECOGNITION_MAX_BODY_BYTES) {
      if (current.length > 0) {
        chunks.push(current);
        current = [];
      }
      tooLargeItems.push(item);
      continue;
    }
    const next = [...current, item];
    if (next.length > AI_RECOGNITION_MAX_BATCH_ITEMS || recognitionBatchBodySize(next, settings) > AI_RECOGNITION_MAX_BODY_BYTES) {
      if (current.length > 0) chunks.push(current);
      current = [item];
    } else {
      current = next;
    }
  }
  if (current.length > 0) chunks.push(current);
  return { chunks, tooLargeItems };
}

function recognitionBatchBodySize(items: RecognizeGarmentsBatchServerItem[], settings: MiniMaxRuntimeSettings): number {
  const body = {
    miniMax: settings,
    items: items.map((item) => ({
      clientItemId: item.imageItemId,
      imageDataUrl: item.aiRequestDataUrl,
      fallbackName: item.fileName,
    })),
  };
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

function toRuntimeSettings(settings: DeviceMiniMaxSettings): MiniMaxRuntimeSettings {
  return {
    apiKey: settings.apiKey,
    apiHost: settings.apiHost,
    model: settings.model,
    timeoutMs: settings.timeoutMs,
  };
}

function toAiOutfitMetadataItem(item: WardrobeItem): AiOutfitMetadataItem {
  return {
    id: item.id ?? 0,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    seasons: item.seasons,
    styles: item.styles,
    temperatureRange: item.temperatureRange,
  };
}
