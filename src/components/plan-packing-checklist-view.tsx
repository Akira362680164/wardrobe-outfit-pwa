"use client";

import { ChevronLeft, Plus, Circle, CheckCircle2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem } from "@/lib/types";
import { buildPackingItemsFromPlan, groupPackingItemsByCategory, formatPackingDateUsage } from "@/lib/plan-packing";
import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { MotionSheet } from "@/components/motion-common";

interface PlanPackingChecklistViewProps {
  calendarPlan: OutfitCalendarPlan;
  checklistItems: PlanPackingChecklistItem[];
  entries: OutfitPlanEntry[];
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  onBack: () => void;
  onToggleChecked: (itemId: string, checked: boolean) => Promise<void>;
  onAddManual: (item: { label: string; category?: string; quantity?: number }) => Promise<void>;
  onMarkAllPacked: () => Promise<void>;
  onResetAll: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
}

export function PlanPackingChecklistView({
  calendarPlan,
  checklistItems,
  entries,
  outfits,
  items,
  onBack,
  onToggleChecked,
  onAddManual,
  onMarkAllPacked,
  onResetAll,
  onRefresh,
  onMessage,
}: PlanPackingChecklistViewProps) {
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualLabel, setManualLabel] = useState("");
  const [manualCategory, setManualCategory] = useState("手动新增");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [showReset, setShowReset] = useState(false);
  const [saving, setSaving] = useState(false);

  const packingItems = useMemo(
    () => buildPackingItemsFromPlan({ calendarPlan, entries, outfits, items, existingChecklistItems: checklistItems }),
    [calendarPlan, entries, outfits, items, checklistItems],
  );

  const groups = useMemo(() => groupPackingItemsByCategory(packingItems, items), [packingItems, items]);

  const totalCount = packingItems.length;
  const packedCount = packingItems.filter((ci) => ci.checked).length;

  const daysLabel = calendarPlan.startDate === calendarPlan.endDate
    ? calendarPlan.startDate.replace(/-/g, "/")
    : `${calendarPlan.startDate.replace(/-/g, "/")} - ${calendarPlan.endDate.replace(/-/g, "/")}`;

  const handleAddManual = useCallback(async () => {
    const label = manualLabel.trim();
    if (!label) { onMessage("物品名称不能为空", "error"); return; }
    if (manualQuantity < 1 || manualQuantity > 99) { onMessage("数量需在 1-99 之间", "error"); return; }
    setSaving(true);
    try {
      await onAddManual({ label, category: manualCategory || undefined, quantity: manualQuantity });
      setManualLabel("");
      setManualQuantity(1);
      setShowAddManual(false);
      onMessage("已添加");
    } catch { onMessage("添加失败，请重试", "error"); }
    finally { setSaving(false); }
  }, [manualLabel, manualCategory, manualQuantity, onAddManual, onMessage]);

  // Empty state
  if (totalCount === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/5">
          <button type="button" className="flex items-center gap-1 text-sm font-medium text-ink/70" onClick={onBack}>
            <ChevronLeft size={18} /> 计划详情
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-sm text-ink/50">还没有可自动汇总的衣物</p>
          <p className="text-xs text-ink/35 mt-1">先为这个计划安排每日穿搭，或手动添加打包物品。</p>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" className="rounded-full border border-ink/10 py-1.5 px-4 text-xs font-medium text-ink/60" onClick={onBack}>去安排穿搭</button>
            <button type="button" className="rounded-full bg-denim py-1.5 px-4 text-xs font-semibold text-white" onClick={() => setShowAddManual(true)}>+ 添加自定义物品</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <AppSubPageTopBar
        title="打包清单"
        onBack={onBack}
      />

      {/* Summary card */}
      <div className="mx-4 mt-3 rounded-xl bg-white p-3 shadow-soft border border-ink/5">
        <p className="text-sm font-semibold text-ink truncate">{calendarPlan.title} 打包清单</p>
        <p className="text-[11px] text-ink/45 mt-0.5">{daysLabel}{calendarPlan.destination ? ` · ${calendarPlan.destination}` : ""}</p>
        <p className="text-[11px] text-ink/40 mt-0.5">根据已安排套装自动同步 · {packedCount}/{totalCount}</p>
      </div>

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {groups.map((group) => (
          <div key={group.category}>
            <h3 className="text-xs font-semibold text-ink/55 mb-1.5">{group.category}</h3>
            <div className="space-y-1">
              {group.items.map((ci) => (
                <div
                  key={ci.id}
                  className="flex items-center gap-2.5 rounded-xl bg-white border border-ink/5 px-3 py-2"
                >
                  <button
                    type="button"
                    className="shrink-0"
                    onClick={async () => {
                      try {
                        await onToggleChecked(ci.id, !ci.checked);
                      } catch { onMessage("操作失败，请重试", "error"); }
                    }}
                  >
                    {ci.checked ? <CheckCircle2 size={18} className="text-moss" /> : <Circle size={18} className="text-ink/20" />}
                  </button>

                  {/* Thumbnail if wardrobe item */}
                  {ci.source === "wardrobe" && ci.itemId != null && (() => {
                    const item = items.find((i) => i.id === ci.itemId);
                    if (item?.imageDataUrl) {
                      return <img src={item.imageDataUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />;
                    }
                    return <div className="h-7 w-7 rounded bg-mist shrink-0 grid place-items-center text-ink/20 text-[10px]">-</div>;
                  })()}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${ci.checked ? "text-ink/40 line-through" : "text-ink"}`}>
                      {ci.label}
                    </p>
                    {ci.dateKeys && ci.dateKeys.length > 0 && (
                      <p className="text-[10px] text-ink/35">{formatPackingDateUsage(ci.dateKeys)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="px-4 py-3 border-t border-ink/5 space-y-2">
        <button type="button" className="flex w-full items-center justify-center gap-1 rounded-full border border-ink/10 py-2 text-xs font-medium text-ink/60" onClick={() => setShowAddManual(true)}>
          <Plus size={14} /> 添加自定义物品
        </button>
        <div className="flex gap-2">
          <button type="button" className="flex-1 rounded-full bg-moss/10 py-2 text-xs font-semibold text-moss" onClick={async () => { try { await onMarkAllPacked(); onMessage("已全部标记"); } catch { onMessage("操作失败", "error"); } }}>
            全部标记已打包
          </button>
          <button type="button" className="rounded-full border border-ink/10 py-2 px-4 text-xs font-medium text-ink/50" onClick={() => setShowReset(true)}>
            重置勾选
          </button>
        </div>
      </div>

      {/* Add manual sheet */}
      <MotionSheet open={showAddManual} onClose={() => setShowAddManual(false)}>
        <div>
          <h3 className="text-base font-semibold text-ink mb-3">添加自定义物品</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink/60">名称</label>
              <input type="text" value={manualLabel} onChange={(e) => setManualLabel(e.target.value)} placeholder="如 充电器" className="mt-1 w-full rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-denim/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/60">分类</label>
              <input type="text" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} placeholder="手动新增" className="mt-1 w-full rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-denim/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink/60">数量</label>
              <input type="number" value={manualQuantity} min={1} max={99} onChange={(e) => setManualQuantity(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))} className="mt-1 w-24 rounded-xl border border-ink/10 bg-mist/30 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-denim/30" />
            </div>
            <button type="button" disabled={saving} className="w-full rounded-full bg-denim py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={handleAddManual}>
              {saving ? "添加中..." : "添加"}
            </button>
          </div>
        </div>
      </MotionSheet>

      {/* Reset confirmation */}
      <MotionSheet open={showReset} onClose={() => setShowReset(false)}>
        <div className="text-center">
          <h3 className="text-base font-semibold text-ink">重置勾选？</h3>
          <p className="text-sm text-ink/55 mt-1">所有物品将标记为未打包。</p>
          <div className="flex items-center gap-3 mt-4">
            <button type="button" className="flex-1 rounded-full border border-ink/10 py-2 text-sm font-medium text-ink/70" onClick={() => setShowReset(false)}>取消</button>
            <button type="button" className="flex-1 rounded-full bg-moss py-2 text-sm font-semibold text-white" onClick={async () => { try { setShowReset(false); await onResetAll(); onMessage("已重置"); } catch { onMessage("操作失败", "error"); } }}>重置</button>
          </div>
        </div>
      </MotionSheet>
    </div>
  );
}
