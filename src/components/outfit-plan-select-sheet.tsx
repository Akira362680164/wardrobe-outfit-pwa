"use client";

import { Search, Shirt, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { SavedOutfit, WardrobeItem } from "@/lib/types";
import { OutfitCover } from "@/components/outfit-cover";
import { MotionSheet } from "@/components/motion-common";


interface OutfitPlanSelectSheetProps {
  open: boolean;
  onClose: () => void;
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  todayKey: string;
  // v1.1 review fix: 标题按 dateKey 自动变化，今天/未来 vs 过去 文案不同
  dateKey?: string;
  onSelect: (outfit: SavedOutfit) => void;
}

function formatDateKeyLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-");
  return `${parseInt(m!, 10)}月${parseInt(d!, 10)}日`;
}

export function OutfitPlanSelectSheet({ open, onClose, outfits, items, todayKey, dateKey, onSelect }: OutfitPlanSelectSheetProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return outfits;
    const q = search.trim().toLowerCase();
    return outfits.filter((o) => o.name.toLowerCase().includes(q) || (o.sceneTags ?? []).some((t) => t.toLowerCase().includes(q)));
  }, [outfits, search]);

  const isPast = dateKey ? dateKey < todayKey : false;
  const sheetTitle = dateKey
    ? (isPast ? `补记 ${formatDateKeyLabel(dateKey)} 实际穿搭` : `为 ${formatDateKeyLabel(dateKey)} 安排穿搭`)
    : "选择套装";
  const hint = dateKey
    ? (isPast ? "选择的套装会作为这天实际穿着并计入穿着次数。" : "选择的套装置入日历计划，不计入穿着次数。")
    : "选择的套装置入日历计划。";

  return (
    <MotionSheet open={open} onClose={onClose}>
      <div className="flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">{sheetTitle}</h2>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Hint */}
        <p className="text-[11px] text-ink/50 mb-2">{hint}</p>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索套装名称 / 场景"
            className="w-full rounded-full border border-ink/10 bg-mist/40 py-2 pl-9 pr-4 text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-denim/30"
          />
        </div>

        {/* Outfit list */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              {outfits.length === 0 ? (
                <>
                  <Shirt size={32} className="mx-auto text-ink/20 mb-2" />
                  <p className="text-sm text-ink/50">还没有可选择的套装</p>
                  <p className="text-xs text-ink/35 mt-1">先从套装页创建一套，再回来安排到日历。</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink/50">没有匹配的套装</p>
                  <p className="text-xs text-ink/35 mt-1">换个关键词试试。</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((outfit) => { return (
                  <button
                    key={outfit.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-ink/5 bg-white p-2 text-left hover:bg-ink/2 transition-colors"
                    onClick={() => onSelect(outfit)}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-milk-darker/40">
                      <OutfitCover outfit={outfit} items={items} size="card" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{outfit.name}</p>
                      {(outfit.sceneTags ?? []).length > 0 && <p className="text-[11px] text-ink/40 mt-0.5">{outfit.sceneTags!.join(" / ")}</p>}
                    </div>
                  </button>
                ); })}
            </div>
          )}
        </div>
      </div>
    </MotionSheet>
  );
}
