"use client";

import type { AiEnhancementKind, MiniMaxRuntimeSettings } from "@wardrobe/cloud-contracts";

import type { DeviceMiniMaxSettings } from "@/lib/device-minimax";
import { onlineRequest } from "@/lib/online/online-request";
import type {
  ClosetLocation,
  GarmentStyleAdvice,
  SavedOutfit,
  OutfitAiSuggestion,
  WardrobeDiagnosis,
  WardrobeItem,
  WishlistAssessment,
  WishlistItem,
  WishlistRuleAssessment,
} from "@/lib/types";

export function diagnoseWardrobeOnServer(
  items: WardrobeItem[],
  outfits: SavedOutfit[],
  locations: ClosetLocation[],
  settings: DeviceMiniMaxSettings,
): Promise<WardrobeDiagnosis> {
  return aiEnhance("wardrobe-diagnosis", { items, outfits, locations }, settings);
}

export function generateGarmentStyleAdviceOnServer(
  item: WardrobeItem,
  settings: DeviceMiniMaxSettings,
  context?: { relatedOutfits?: SavedOutfit[]; recommendedPairingItems?: unknown[] },
): Promise<GarmentStyleAdvice> {
  return aiEnhance("garment-style-advice", { item, context }, settings);
}

export function assessWishlistItemOnServer(
  wishlistItem: WishlistItem,
  context: { ruleAssessment: WishlistRuleAssessment; wardrobeItems: WardrobeItem[]; outfits: SavedOutfit[] },
  settings: DeviceMiniMaxSettings,
): Promise<WishlistAssessment> {
  return aiEnhance("wishlist-assessment", { wishlistItem, ...context }, settings);
}

export function generateOutfitAiSuggestionOnServer(
  outfit: SavedOutfit,
  context: { outfitItems: WardrobeItem[]; allItems: WardrobeItem[] },
  settings: DeviceMiniMaxSettings,
): Promise<OutfitAiSuggestion> {
  return aiEnhance("outfit-ai-suggestion", { outfit, ...context }, settings);
}

function aiEnhance<T>(kind: AiEnhancementKind, input: Record<string, unknown>, settings: DeviceMiniMaxSettings): Promise<T> {
  return onlineRequest<T>(`/api/workspace/ai/enhance/${kind}`, {
    method: "POST",
    timeoutMs: settings.timeoutMs,
    body: { miniMax: toRuntimeSettings(settings), input },
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
