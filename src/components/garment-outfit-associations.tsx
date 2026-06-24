"use client";

import { useMemo } from "react";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { getWearSummary } from "@/lib/wear-records";
import { OutfitCover } from "@/components/outfit-cover";

interface Props {
  itemId: number;
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  onViewOutfit: (outfitId: string) => void;
}

export function GarmentOutfitAssociations({ itemId, outfits, items, onViewOutfit }: Props) {
  const itemIdSet = useMemo(() => new Set(items.map((i) => i.id).filter((id): id is number => typeof id === "number")), [items]);
  // v0.9.49-dev auto-fix: 之前 validOutfits 的 itemIds 是过滤后副本, "搭过 N 套" 统计偏低。
  // 拆成两套: displayOutfits 用于渲染 (itemIds 已过滤), rawMatchingOutfits 用于计数 (itemIds 原样)。
  const displayOutfits = useMemo(
    () => outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((id) => itemIdSet.has(id)) })).filter((o) => o.itemIds.length > 0),
    [outfits, itemIdSet],
  );

  const historyOutfits = useMemo(
    () => displayOutfits.filter((o) => o.itemIds.includes(itemId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10),
    [displayOutfits, itemId],
  );

  const frequentItems = useMemo(() => {
    // 统计用 rawOutfits (未过滤), 用户看到 10 套装有 3 件 deleted 衣物也算进 "搭过"
    const outfitsWithItem = outfits.filter((o) => Array.isArray(o.itemIds) && o.itemIds.includes(itemId));
    const counts = new Map<number, number>();
    for (const o of outfitsWithItem) {
      for (const id of o.itemIds) {
        if (id === itemId) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const itemMap = new Map<number, WardrobeItem>();
    for (const item of items) {
      if (typeof item.id === "number") itemMap.set(item.id, item);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, count]) => ({ item: itemMap.get(id)!, count }))
      .filter((e) => e.item);
  }, [outfits, itemId, items]);

  if (historyOutfits.length === 0 && frequentItems.length === 0) return null;

  return (
    <div className="space-y-5 mt-2">
      {historyOutfits.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink/40 mb-2">历史套装</p>
          <div className="flex gap-2 overflow-x-auto">
            {historyOutfits.map((outfit) => {
              const wearSummary = getWearSummary(outfit.wornDates);
              const validCount = outfit.itemIds.length;
              return (
                <button
                  key={outfit.id}
                  type="button"
                  onClick={() => onViewOutfit(outfit.id)}
                  className="shrink-0 w-[140px] overflow-hidden rounded-xl border border-ink/8 bg-white text-left"
                >
                  <div className="aspect-square">
                    <OutfitCover outfit={outfit} items={items} size="card" />
                  </div>
                  <div className="p-2 space-y-0.5">
                    <p className="text-xs font-medium truncate">{outfit.name}</p>
                    <p className="text-[11px] text-ink/40">{validCount}件</p>
                    <p className={`text-[11px] ${wearSummary.hasToday ? "text-denim font-medium" : "text-ink/30"}`}>
                      {wearSummary.label}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {frequentItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink/40 mb-2">常搭单品</p>
          <div className="space-y-1">
            {frequentItems.map(({ item, count }) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-milk-darker/30 px-3 py-2">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-milk-darker/40">
                  {item.imageDataUrl ? (
                    <img src={item.thumbnailDataUrl || item.imageDataUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-ink/25">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </div>
                  )}
                </div>
                <span className="flex-1 text-sm truncate">{item.name}</span>
                <span className="shrink-0 text-xs text-ink/40">搭过 {count} 套</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
