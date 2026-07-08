"use client";

import type {
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
