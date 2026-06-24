"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { OutfitCalendarPlan, OutfitPlanEntry, SavedOutfit, WardrobeItem } from "@/lib/types";
import { OutfitCover } from "@/components/outfit-cover";
import { PLAN_TONE_CLASS_MAP, resolvePrimaryDisplayEntryForDate, sortWornEntriesForDay, sortPlanEntriesForDay } from "@/lib/outfit-planning";

interface OutfitPlanDayCardProps {
  dateKey: string;
  todayKey: string;
  entries?: OutfitPlanEntry[];
  plans: OutfitCalendarPlan[];
  outfit?: SavedOutfit | null;
  items: WardrobeItem[];
  onSelectOutfit: () => void;
  onViewOutfit: () => void;
  onMarkWornToday: () => void;
  onCancelWear?: (outfitId: string) => void;
  onSetPrimary?: (entry: OutfitPlanEntry) => void;
  onMarkSkipped?: (entry: OutfitPlanEntry) => void;
  onDeleteEntry?: (entry: OutfitPlanEntry) => void;
  onOpenCalendarPlan: (planId: string) => void;
  onAiRecommend?: () => void;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
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

export function OutfitPlanDayCard({
  dateKey,
  todayKey,
  entries,
  plans,
  outfit,
  items,
  onSelectOutfit,
  onViewOutfit,
  onMarkWornToday,
  onCancelWear,
  onSetPrimary,
  onMarkSkipped,
  onDeleteEntry,
  onOpenCalendarPlan,
  onAiRecommend,
}: OutfitPlanDayCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isToday = dateKey === todayKey;
  const isPast = dateKey < todayKey;
  const isFuture = dateKey > todayKey;
  // v1.1 review fix: 主展示 entry 用统一解析器（实际已穿 > 主计划 > 第一计划），
  // 而不是 entries?.[0]，避免多套时主展示跳到非目标 entry。
  const primaryEntry = entries && entries.length > 0
    ? resolvePrimaryDisplayEntryForDate(entries, dateKey) ?? entries[0]
    : undefined;
  const hasOutfit = !!outfit && !!primaryEntry;
  const hasPlans = plans.length > 0;
  const mainPlan = plans[0];
  const dateLabel = fmtDateChinese(dateKey);
  const isEmpty = !hasOutfit && !hasPlans;
  const isWorn = primaryEntry?.status === "worn";
  const isChanged = primaryEntry?.status === "changed";
  const isPlanned = primaryEntry?.status === "planned";
  const dayAllEntries = entries ?? [];
  const extraCount = Math.max(0, dayAllEntries.length - 1);

  // v1.1.0 fix: 空状态 — 今天/未来 vs 过去文案不同
  if (isEmpty) {
    return (
      <div className="rounded-xl bg-mist/40 p-3 text-center">
        <p className="text-xs text-ink/60">
          {isToday ? "今天还没有安排穿搭" : isPast ? `${dateLabel}还没有穿着记录` : `${dateLabel}还没有安排穿搭`}
        </p>
        <p className="text-[11px] text-ink/40 mt-1">
          {isPast ? "可以补记当天实际穿过的套装。" : "可以先把想穿的套装放进计划。"}
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <button type="button" className="rounded-full bg-denim px-3 py-1 text-[11px] font-semibold text-white" onClick={onSelectOutfit}>
            {isPast ? "补记已穿" : "安排穿搭"}
          </button>
          {onAiRecommend && (
            <button type="button" className="rounded-full border border-denim/20 bg-denim/5 px-3 py-1 text-[11px] font-semibold text-denim" onClick={onAiRecommend}><Sparkles size={12} className="inline mr-1" />AI 推荐</button>
          )}
        </div>
      </div>
    );
  }

  // Has plan but no outfit
  if (!hasOutfit && hasPlans && mainPlan) {
    const toneClass = PLAN_TONE_CLASS_MAP[mainPlan.tone];
    return (
      <div className="rounded-3xl bg-white p-4 border border-ink/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-ink">{dateLabel}</span>
          <button
            type="button"
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium border truncate max-w-[160px] cursor-pointer ${toneClass}`}
            onClick={() => onOpenCalendarPlan(mainPlan.id)}
          >
            {mainPlan.title} · {planTypeLabel(mainPlan.type)}
          </button>
        </div>
        {mainPlan.activities && mainPlan.activities.length > 0 && (
          <p className="text-[11px] text-ink/50 mb-2">{mainPlan.activities.join(" / ")}</p>
        )}
        <p className="text-[11px] text-ink/40 mb-2">尚未安排当天穿搭</p>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-full bg-denim px-3 py-1 text-[11px] font-semibold text-white" onClick={onSelectOutfit}>
            {isPast ? "补记已穿" : "安排套装"}
          </button>
          <button type="button" className="rounded-full border border-ink/15 bg-white px-3 py-1 text-[11px] font-medium text-ink/70" onClick={() => onOpenCalendarPlan(mainPlan.id)}>查看计划</button>
        </div>
      </div>
    );
  }

  // v1.1.0 fix: 有穿搭 — 区分实际已穿/计划/变更状态
  if (hasOutfit && outfit) {
    const outfitId = outfit.id;
    const actualWornEntry = entries?.find((e) => e.status === "worn");
    const changedEntry = entries?.find((e) => e.status === "changed");
    const plannedEntry = entries?.find((e) => e.status === "planned");
    const primaryDisplayEntry = actualWornEntry ?? plannedEntry ?? changedEntry;

    return (
      <div className="rounded-3xl bg-white p-4 border border-ink/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-ink">{dateLabel}</span>
          {isWorn && <span className="text-[10px] text-moss font-medium">实际已穿</span>}
          {isChanged && <span className="text-[10px] text-amber-600 font-medium">已变更</span>}
          {isPlanned && isPast && <span className="text-[10px] text-ink/40 font-medium">计划未确认</span>}
          {isPlanned && !isPast && <span className="text-[10px] text-denim/70 font-medium">计划</span>}
              {hasPlans && mainPlan && (
            <button
              type="button"
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium border cursor-pointer ${PLAN_TONE_CLASS_MAP[mainPlan.tone]}`}
              onClick={() => onOpenCalendarPlan(mainPlan.id)}
            >
              {mainPlan.title} · {planTypeLabel(mainPlan.type)}
            </button>
          )}
        </div>
        <div className="flex items-start gap-3">
          <button type="button" onClick={onViewOutfit} className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-milk-darker/40 active:scale-95" aria-label="查看套装">
            <OutfitCover outfit={outfit} items={items} size="card" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-bold text-ink truncate">{primaryDisplayEntry?.title || outfit.name}</p>
            {primaryDisplayEntry?.scene && <p className="text-[11px] text-ink/50 mt-0.5">{primaryDisplayEntry.scene}{primaryDisplayEntry.weatherNote ? ` · ${primaryDisplayEntry.weatherNote}` : ""}</p>}
            {isChanged && changedEntry && (
              <p className="text-[10px] text-amber-600 mt-0.5">原计划：{changedEntry.title || "已变更"}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {isWorn && onCancelWear ? (
                <button type="button" className="rounded-full border border-ink/10 bg-white px-3 py-1 text-[11px] font-medium text-ink/50" onClick={() => onCancelWear(outfitId)}>取消已穿</button>
              ) : isPlanned ? (
                <>
                  {!isFuture && (
                    <button type="button" className="rounded-full bg-moss px-3 py-1 text-[11px] font-semibold text-white" onClick={onMarkWornToday}>
                      {isPast ? "补记已穿" : "今天穿了"}
                    </button>
                  )}
                  {!isFuture && isPast && onMarkSkipped && (
                    <button type="button" className="rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-[11px] font-medium text-ink/50" onClick={() => onMarkSkipped(primaryDisplayEntry!)}>标记未穿</button>
                  )}
                </>
              ) : null}
              <button type="button" className="rounded-full border border-ink/10 bg-white px-3 py-1 text-[11px] font-medium text-ink/50" onClick={onSelectOutfit}>添加备选穿搭</button>
              {onDeleteEntry ? (
                <button type="button" className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-medium text-red-600" onClick={() => setShowDeleteConfirm(true)}>删除</button>
              ) : null}
            </div>
          </div>
        </div>
        {showDeleteConfirm && primaryEntry ? (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/35 px-4" onClick={() => setShowDeleteConfirm(false)}>
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-ink">删除当天穿搭？</h3>
              <p className="mt-1 text-sm text-ink/55">只会删除 {dateLabel} 的这条穿搭记录。</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" className="h-11 rounded-full border border-ink/10 text-sm font-medium text-ink/70" onClick={() => setShowDeleteConfirm(false)}>取消</button>
                <button type="button" className="h-11 rounded-full bg-red-600 text-sm font-semibold text-white" onClick={() => { setShowDeleteConfirm(false); onDeleteEntry?.(primaryEntry); }}>删除穿搭</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
