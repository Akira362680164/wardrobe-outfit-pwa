"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import type { OutfitCalendarPlan, OutfitPlanEntry, SavedOutfit, WardrobeItem } from "@/lib/types";
import { enumerateDateRange } from "@/lib/outfit-calendar";
import { getEntriesForDate, resolvePrimaryDisplayEntryForDate, PLAN_TONE_CLASS_MAP } from "@/lib/outfit-planning";
import { getOutfitCover } from "@/lib/outfit-cover";
import { OutfitCover } from "@/components/outfit-cover";
import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { MotionSheet } from "@/components/motion-common";

interface OutfitPlanDetailViewProps {
  calendarPlan: OutfitCalendarPlan;
  entries: OutfitPlanEntry[];
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  todayKey: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onOpenPackingList: () => void;
  onSelectOutfitForDate: (dateKey: string) => void;
  onViewOutfit: (outfitId: string) => void;
}

function fmtDateChinese(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const wd = weekdays[new Date(y!, m! - 1, d!).getDay()]!;
  return `${m!}月${d!}日 ${wd}`;
}

function planTypeLabel(type: OutfitCalendarPlan["type"]): string {
  if (type === "travel") return "旅行";
  if (type === "business") return "出差";
  return "计划";
}

export function OutfitPlanDetailView({
  calendarPlan,
  entries,
  outfits,
  items,
  todayKey,
  onBack,
  onEdit,
  onDelete,
  onOpenPackingList,
  onSelectOutfitForDate,
  onViewOutfit,
}: OutfitPlanDetailViewProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dateRange = enumerateDateRange(calendarPlan.startDate, calendarPlan.endDate);
  const days = dateRange.length;
  const typeLabel = planTypeLabel(calendarPlan.type);
  const toneClass = PLAN_TONE_CLASS_MAP[calendarPlan.tone];

  const daysLabel = calendarPlan.startDate === calendarPlan.endDate
    ? calendarPlan.startDate
    : `${calendarPlan.startDate} 至 ${calendarPlan.endDate}`;

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <AppSubPageTopBar
        title={calendarPlan.type === "custom" ? "计划" : `${typeLabel}计划`}
        onBack={onBack}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Plan summary card */}
        <section className="mx-4 mt-4 rounded-3xl bg-white p-5 shadow-soft border border-ink/5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 flex-1 text-lg font-semibold text-ink truncate">{calendarPlan.title}</h2>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${toneClass}`}>
              {typeLabel}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink/45">{daysLabel} · 共 {days} 天</p>
          <p className="mt-3 text-xs text-ink/70">
            {typeLabel}{calendarPlan.destination ? ` · ${calendarPlan.destination}` : ""}
          </p>

          {calendarPlan.activities && calendarPlan.activities.length > 0 ? (
            <p className="mt-2 text-xs text-ink/55">
              <span className="text-ink/35">活动</span>
              <span className="ml-2 text-ink/80">{calendarPlan.activities.join(" / ")}</span>
            </p>
          ) : null}

          {calendarPlan.weatherNote ? (
            <p className="mt-2 text-xs text-ink/55">
              <span className="text-ink/35">天气备注</span>
              <span className="ml-2 text-ink/80">{calendarPlan.weatherNote}</span>
            </p>
          ) : null}

          {calendarPlan.notes ? (
            <p className="mt-2 text-xs text-ink/55">
              <span className="text-ink/35">备注</span>
              <span className="ml-2 text-ink/80 whitespace-pre-wrap">{calendarPlan.notes}</span>
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={onEdit} className="h-11 rounded-full bg-denim text-sm font-semibold text-white active:scale-[0.98]">
              编辑计划
            </button>
            <button type="button" onClick={() => setShowDeleteConfirm(true)} className="h-11 rounded-full border border-red-200 bg-white text-sm font-semibold text-red-600 active:scale-[0.98]">
              删除计划
            </button>
          </div>
        </section>

        {/* Per-day arrangement */}
        <section className="mx-4 mt-3 rounded-3xl bg-white p-4 shadow-soft border border-ink/5">
          <h3 className="mb-3 text-sm font-semibold text-ink">每日穿搭安排</h3>
          <div className="space-y-2">
            {dateRange.map((dateKey) => {
              const dayEntries = getEntriesForDate(entries, dateKey);
              const primaryEntry = dayEntries.length > 0
                ? resolvePrimaryDisplayEntryForDate(dayEntries, dateKey) ?? dayEntries[0]
                : undefined;
              const targetOutfitId = primaryEntry?.outfitId ?? primaryEntry?.actualOutfitId;
              const outfit = targetOutfitId ? outfits.find((o) => o.id === targetOutfitId) ?? null : null;
              const cover = outfit ? getOutfitCover(outfit, items) : null;
              const hasOutfit = !!outfit && !!primaryEntry;
              const isPast = dateKey < todayKey;

              return (
                <div key={dateKey} className="rounded-xl border border-ink/8 bg-white p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-ink">{fmtDateChinese(dateKey)}</span>
                    {primaryEntry?.status === "worn" ? (
                      <span className="text-[10px] font-medium text-moss">实际已穿</span>
                    ) : primaryEntry?.status === "changed" ? (
                      <span className="text-[10px] font-medium text-amber-600">已变更</span>
                    ) : primaryEntry?.status === "planned" ? (
                      <span className={`text-[10px] font-medium ${isPast ? "text-ink/40" : "text-denim/70"}`}>
                        {isPast ? "计划未确认" : "计划"}
                      </span>
                    ) : null}
                  </div>

                  {hasOutfit && outfit ? (
                    <div className="flex items-start gap-3">
                      <button type="button" onClick={() => onViewOutfit(outfit.id)} className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-milk-darker/40 active:scale-95" aria-label="查看套装">
                        <OutfitCover outfit={outfit} items={items} size="card" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{primaryEntry?.title || outfit.name}</p>
                        {cover?.imageDataUrl && primaryEntry?.scene ? (
                          <p className="text-[11px] text-ink/45 mt-0.5">{primaryEntry.scene}</p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onViewOutfit(outfit.id)}
                            className="rounded-full border border-ink/15 bg-white px-2.5 py-0.5 text-[11px] font-medium text-ink/70"
                          >
                            查看套装
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectOutfitForDate(dateKey)}
                            className="rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-[11px] font-medium text-ink/50"
                          >
                            更换套装
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-ink/40">尚未安排当天穿搭</p>
                      <button
                        type="button"
                        onClick={() => onSelectOutfitForDate(dateKey)}
                        className="rounded-full bg-denim px-3 py-1 text-[11px] font-semibold text-white"
                      >
                        安排套装
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-4 mt-3 rounded-3xl bg-white p-4 shadow-soft border border-ink/5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-denim/10 text-denim">
              <Package size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-ink">打包清单</h3>
              <p className="text-[11px] text-ink/45">根据已安排穿搭自动更新</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPackingList}
            disabled={!calendarPlan.packingEnabled}
            title={!calendarPlan.packingEnabled ? "此计划未启用打包清单，可在编辑计划中开启" : undefined}
            className="mt-3 h-11 w-full rounded-full bg-denim text-sm font-semibold text-white disabled:bg-ink/10 disabled:text-ink/35 disabled:cursor-not-allowed"
          >
            {calendarPlan.packingEnabled ? "查看打包清单" : "未启用打包清单"}
          </button>
        </section>

        <div className="h-[calc(env(safe-area-inset-bottom)+4rem)]" />
      </div>

      <MotionSheet open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div className="text-center">
          <h3 className="text-base font-semibold text-ink">删除{calendarPlan.type === "custom" ? "" : typeLabel}计划？</h3>
          <p className="mt-1 text-sm text-ink/55">只会删除{calendarPlan.type === "custom" ? "" : typeLabel}计划和它的打包清单，每日穿搭安排会保留。</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" className="h-11 rounded-full border border-ink/10 text-sm font-medium text-ink/70" onClick={() => setShowDeleteConfirm(false)}>取消</button>
            <button type="button" className="h-11 rounded-full bg-red-600 text-sm font-semibold text-white disabled:opacity-50" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "删除中..." : "删除计划"}
            </button>
          </div>
        </div>
      </MotionSheet>
    </div>
  );
}
