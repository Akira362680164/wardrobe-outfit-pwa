"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { OutfitCalendarPlan, OutfitPlanEntry, SavedOutfit, WardrobeItem } from "@/lib/types";
import { getWeekDates } from "@/lib/outfit-calendar";
import { getCalendarPlansForDate, PLAN_TONE_BG_MAP, resolvePrimaryDisplayEntryForDate, getEntriesForDate } from "@/lib/outfit-planning";
import { getOutfitCover } from "@/lib/outfit-cover";
import { OutfitPlanDayCard } from "@/components/outfit-plan-day-card";
import { ease } from "@/lib/motion-tokens";

interface OutfitWeeklyPlanStripProps {
  anchorDate: string;
  entries: OutfitPlanEntry[];
  calendarPlans: OutfitCalendarPlan[];
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  todayKey: string;
  selectedDate: string;
  onSelectedDateChange: (dateKey: string) => void;
  onShiftWeek: (delta: -1 | 1) => void;
  onSelectOutfitForDate: (dateKey: string) => void;
  onChangeOutfitForDate?: (dateKey: string) => void;
  onViewOutfit: (outfitId: string) => void;
  onMarkWornToday: (entry: OutfitPlanEntry) => void;
  onCancelWear?: (dateKey: string, outfitId: string) => void;
  onSetPrimary?: (entry: OutfitPlanEntry) => void;
  onMarkSkipped?: (entry: OutfitPlanEntry) => void;
  onDeleteEntry?: (entry: OutfitPlanEntry) => void;
  onOpenCalendarPlan: (planId: string) => void;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onAiRecommend?: (dateKey: string) => void;
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export function OutfitWeeklyPlanStrip({
  anchorDate,
  entries,
  calendarPlans,
  outfits,
  items,
  todayKey,
  selectedDate,
  onSelectedDateChange,
  onShiftWeek,
  onSelectOutfitForDate,
  onChangeOutfitForDate,
  onViewOutfit,
  onMarkWornToday,
  onCancelWear,
  onSetPrimary,
  onMarkSkipped,
  onDeleteEntry,
  onOpenCalendarPlan,
  onMessage,
  onAiRecommend,
}: OutfitWeeklyPlanStripProps) {
  const weekDates = useMemo(() => getWeekDates(anchorDate), [anchorDate]);
  const weekLabel = useMemo(() => {
    const first = weekDates[0] ?? anchorDate;
    const last = weekDates[6] ?? anchorDate;
    const fp = first.split("-");
    const lp = last.split("-");
    return `${parseInt(fp[0]!, 10)}年${parseInt(fp[1]!, 10)}月${parseInt(fp[2]!, 10)}日 - ${parseInt(lp[1]!, 10)}月${parseInt(lp[2]!, 10)}日`;
  }, [weekDates]);

  const reduceMotion = useReducedMotion();
  const [weekSlideDir, setWeekSlideDir] = useState<1 | -1>(1);

  // v1.1.6 small rework: 周日历卡片折叠状态
  const [expandedDate, setExpandedDate] = useState<string | null>(selectedDate);
  useEffect(() => { setExpandedDate(selectedDate); }, [selectedDate]);

  function handleDateClick(dateKey: string) {
    if (dateKey === selectedDate) {
      setExpandedDate((current) => current === dateKey ? null : dateKey);
      return;
    }
    onSelectedDateChange(dateKey);
    setExpandedDate(dateKey);
  }

  function shiftWeekWithDirection(delta: -1 | 1) {
    setExpandedDate(null);
    setWeekSlideDir(delta);
    onShiftWeek(delta);
  }

   const selectedEntry = useMemo(() => resolvePrimaryDisplayEntryForDate(entries, selectedDate), [entries, selectedDate]);
  const selectedEntries = useMemo(() => getEntriesForDate(entries, selectedDate), [entries, selectedDate]);
  const datePlans = useMemo(() => getCalendarPlansForDate(calendarPlans, selectedDate), [calendarPlans, selectedDate]);
  const selectedOutfit = useMemo(() => {
    const e = selectedEntry;
    if (!e) return null;
    const oid = e.outfitId ?? e.actualOutfitId;
    return oid ? outfits.find((o) => o.id === oid) ?? null : null;
  }, [selectedEntry, outfits]);

  return (
    <div className="rounded-2xl bg-white p-3 shadow-soft border border-ink/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink">本周穿搭</span>
          <span className="text-[11px] text-ink/50">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-ink/5" onClick={() => shiftWeekWithDirection(-1)} aria-label="上一周"><ChevronLeft size={14} /></button>
          <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-ink/5" onClick={() => shiftWeekWithDirection(1)} aria-label="下一周"><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Day cells (with swipe gesture + slide-in/out animation) */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onDragEnd={(_, info) => {
          const horizontal = Math.abs(info.offset.x);
          const vertical = Math.abs(info.offset.y);
          if (vertical > horizontal) return;
          if (info.offset.x <= -48 || info.velocity.x <= -500) shiftWeekWithDirection(1);
          if (info.offset.x >= 48 || info.velocity.x >= 500) shiftWeekWithDirection(-1);
        }}
        className="touch-none select-none"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={weekDates[0] ?? anchorDate}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: weekSlideDir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: weekSlideDir * -28 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: ease.app }}
          >
            <div className="grid grid-cols-7 gap-0.5 mb-2">
              {weekDates.map((dateKey) => {
                const d = parseInt(dateKey.split("-")[2]!, 10);
                const isToday = dateKey === todayKey;
                const isSelected = dateKey === selectedDate;
                const allDayEntries = getEntriesForDate(entries, dateKey);
                const primaryEntry = resolvePrimaryDisplayEntryForDate(entries, dateKey);
                const extraCount = Math.max(0, allDayEntries.length - 1);
                const entry = primaryEntry;
                const outfit = entry ? (() => { const oid = entry.outfitId ?? entry.actualOutfitId; return oid ? outfits.find((o) => o.id === oid) : null; })() : null;
                const cover = outfit ? getOutfitCover(outfit, items) : null;
                const datePlansForDay = getCalendarPlansForDate(calendarPlans, dateKey);

                return (
                  <button
                    key={dateKey}
                    type="button"
                    className={`relative flex flex-col items-center rounded-lg py-1.5 transition-colors ${
                      isSelected ? "bg-denim/8 ring-1 ring-denim/30" : "hover:bg-ink/3"
                    }`}
                    onClick={() => handleDateClick(dateKey)}
                  >
                    <span className="text-[10px] text-ink/40">{WEEKDAY_LABELS[new Date(
                      parseInt(dateKey.split("-")[0]!), parseInt(dateKey.split("-")[1]!) - 1, d
                    ).getDay()]}</span>
                    <span className={`text-sm font-semibold ${isToday ? "text-denim" : "text-ink"}`}>
                      {d}
                    </span>
                    <div className="h-7 flex items-center justify-center mt-0.5">
                      {(() => {
                        const thumb = cover?.imageDataUrl
                          || (outfit ? items.find((i) => i.id != null && outfit.itemIds.includes(i.id!))?.thumbnailDataUrl
                                     || items.find((i) => i.id != null && outfit.itemIds.includes(i.id!))?.imageDataUrl
                                     : null);
                        if (thumb) {
                          if (extraCount > 0) {
                            return <div className="relative"><img src={thumb} alt="" className="h-6 w-6 rounded object-cover" /><span className="absolute -top-1 -right-1 bg-denim text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">+{extraCount}</span></div>;
                          }
                          return <img src={thumb} alt="" className="h-6 w-6 rounded object-cover" />;
                        }
                        if (entry) {
                          const label = entry.status === "worn" ? "已穿" : entry.status === "changed" ? "变更" : "计划";
                          return <span className={`text-[10px] ${entry.status === "worn" ? "text-moss" : "text-moss/70"}`}>{label}</span>;
                        }
                        return <span className="text-[11px] text-ink/20">+</span>;
                      })()}
                    </div>
                    {datePlansForDay.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {datePlansForDay.slice(0, 2).map((p) => (
                          <div key={p.id} className={`h-[3px] w-4 rounded-full ${PLAN_TONE_BG_MAP[p.tone]}`} />
                        ))}
                        {datePlansForDay.length > 2 && <span className="text-[9px] text-ink/40">+{datePlansForDay.length - 2}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Day detail card — only when expanded */}
      {expandedDate === selectedDate ? (
        <OutfitPlanDayCard
          dateKey={selectedDate}
          todayKey={todayKey}
          entries={selectedEntries}
          plans={datePlans}
          outfit={selectedOutfit}
          items={items}
          allOutfits={outfits}
          onSelectOutfit={() => onSelectOutfitForDate(selectedDate)}
          onChangeOutfit={onChangeOutfitForDate ? () => onChangeOutfitForDate(selectedDate) : undefined}
          onViewOutfit={(oid) => { const id = oid ?? selectedOutfit?.id; if (id) onViewOutfit(id); }}
          onMarkWornToday={() => selectedEntry && onMarkWornToday(selectedEntry)}
          onCancelWear={onCancelWear ? (outfitId: string) => onCancelWear(selectedDate, outfitId) : undefined}
          onSetPrimary={onSetPrimary}
          onMarkSkipped={onMarkSkipped}
          onDeleteEntry={onDeleteEntry}
          onOpenCalendarPlan={onOpenCalendarPlan}
          onMessage={onMessage}
          onAiRecommend={onAiRecommend ? () => onAiRecommend(selectedDate) : undefined}
        />
      ) : null}
    </div>
  );
}
