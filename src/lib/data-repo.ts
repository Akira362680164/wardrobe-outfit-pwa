// data-repo.ts — stub during online-only migration
// Only getWardrobeSnapshot is still imported by outfit-wear-sync.ts and
// use-wardrobe-capture-queue-controller.ts. Those callers will be migrated
// to online repository later; this stub prevents typecheck breakage during
// the physical deletion of old cloud-sync code.

import type { WardrobeItem, SavedOutfit, OutfitPlanEntry } from "@/lib/types";

interface WardrobeSnapshot {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  outfitPlanEntries: OutfitPlanEntry[];
}

export async function getWardrobeSnapshot(): Promise<WardrobeSnapshot> {
  return { items: [], outfits: [], outfitPlanEntries: [] };
}
