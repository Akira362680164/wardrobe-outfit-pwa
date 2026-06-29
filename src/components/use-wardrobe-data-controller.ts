// src/components/use-wardrobe-data-controller.ts
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移数据读取状态与 refreshState。

import { useState, useEffect, useCallback } from "react";
import { getWardrobeSnapshot, invalidateWorkspaceSnapshotCache, WARDROBE_ASSET_RECOVERY_EVENT, type WardrobeDataSnapshot } from "@/lib/data-repo";
import type {
  WardrobeItem, ClosetLocation, SavedOutfit, WishlistItem,
  OutfitPlanEntry, OutfitCalendarPlan, PlanPackingChecklistItem,
} from "@/lib/types";

export function useWardrobeDataController() {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [locations, setLocations] = useState<ClosetLocation[]>([]);
  const [outfits, setOutfits] = useState<SavedOutfit[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [outfitPlanEntries, setOutfitPlanEntries] = useState<OutfitPlanEntry[]>([]);
  const [outfitCalendarPlans, setOutfitCalendarPlans] = useState<OutfitCalendarPlan[]>([]);
  const [planPackingChecklistItems, setPlanPackingChecklistItems] = useState<PlanPackingChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshState = useCallback(async () => {
    const state: WardrobeDataSnapshot = await getWardrobeSnapshot();
    setItems(state.items);
    setLocations(state.locations);
    setOutfits(state.outfits);
    setWishlistItems(state.wishlistItems);
    setOutfitPlanEntries(state.outfitPlanEntries);
    setOutfitCalendarPlans(state.outfitCalendarPlans);
    setPlanPackingChecklistItems(state.planPackingChecklistItems);
  }, []);

  useEffect(() => {
    refreshState()
      .catch(() => {
        setItems([]);
        setLocations([]);
      })
      .finally(() => setLoading(false));
  }, [refreshState]);

  useEffect(() => {
    const refreshRecoveredAssets = () => {
      invalidateWorkspaceSnapshotCache();
      void refreshState();
    };
    window.addEventListener(WARDROBE_ASSET_RECOVERY_EVENT, refreshRecoveredAssets);
    return () => window.removeEventListener(WARDROBE_ASSET_RECOVERY_EVENT, refreshRecoveredAssets);
  }, [refreshState]);

  return {
    items, setItems,
    locations, setLocations,
    outfits, setOutfits,
    wishlistItems, setWishlistItems,
    outfitPlanEntries, setOutfitPlanEntries,
    outfitCalendarPlans, setOutfitCalendarPlans,
    planPackingChecklistItems, setPlanPackingChecklistItems,
    loading,
    refreshState,
  };
}
