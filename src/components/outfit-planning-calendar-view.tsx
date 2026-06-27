"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { OutfitCalendarPlan, OutfitPlanEntry, SavedOutfit, WardrobeItem } from "@/lib/types";
import { getLocalMonthGrid, groupMonthCellsByWeek, getDateRowIndex } from "@/lib/outfit-calendar";
import { getCalendarPlansForDate, PLAN_TONE_BG_MAP, resolvePrimaryDisplayEntryForDate, getEntriesForDate } from "@/lib/outfit-planning";
import { getOutfitCover } from "@/lib/outfit-cover";
import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { OutfitPlanDayCard } from "@/components/outfit-plan-day-card";
import { ease } from "@/lib/motion-tokens";

interface OutfitPlanningCalendarViewProps {
  monthDate: string;
  selectedDate: string;
  entries: OutfitPlanEntry[];
  calendarPlans: OutfitCalendarPlan[];
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  todayKey: string;
  onBack: () => void;
  onAdd: () => void;
  onMonthChange: (delta: -1 | 1) => void;
  onToday: () => void;
  onSelectedDateChange: (dateKey: string) => void;
  onSelectOutfitForDate: (dateKey: string) => void;
  onViewOutfit: (outfitId: string) => void;
  onMarkWornToday: (entry: OutfitPlanEntry) => void;
  onCancelWear?: (dateKey: string, outfitId: string) => void;
  onSetPrimary?: (entry: OutfitPlanEntry) => void;
  onMarkSkipped?: (entry: OutfitPlanEntry) => void;
  onDeleteEntry: (entry: OutfitPlanEntry) => void;
  onOpenCalendarPlan: (planId: string) => void;
  onMessage: (msg: string, type?: "success" | "error" | "info") => void;
  onAiRecommend?: (dateKey: string) => void;
}

const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

export function OutfitPlanningCalendarView({
  monthDate,
  selectedDate,
  entries,
  calendarPlans,
  outfits,
  items,
  todayKey,
  onBack,
  onAdd,
  onMonthChange,
  onToday,
  onSelectedDateChange,
  onSelectOutfitForDate,
  onViewOutfit,
  onMarkWornToday,
  onCancelWear,
  onSetPrimary,
  onMarkSkipped,
  onDeleteEntry,
  onOpenCalendarPlan,
  onMessage,
  onAiRecommend,
}: OutfitPlanningCalendarViewProps) {
  const [my, mm] = monthDate.split("-").map(Number) as [number, number];
  const monthCells = useMemo(() => getLocalMonthGrid(my!, mm!), [my, mm]);
  const weekRows = useMemo(() => groupMonthCellsByWeek(monthCells), [monthCells]);
  // v1.1.6 small rework: 月历卡片折叠状态
  const [expandedDate, setExpandedDate] = useState<string | null>(selectedDate);
  useEffect(() => { setExpandedDate(selectedDate); }, [selectedDate]);
  const expandedRowIndex = useMemo(
    () => expandedDate ? getDateRowIndex(monthCells, expandedDate) : -1,
    [monthCells, expandedDate],
  );

  // expanded date derived data for day card rendering
  const detailEntry = useMemo(() => expandedDate ? resolvePrimaryDisplayEntryForDate(entries, expandedDate) : null, [entries, expandedDate]);
  const detailEntries = useMemo(() => expandedDate ? getEntriesForDate(entries, expandedDate) : [], [entries, expandedDate]);
  const detailPlans = useMemo(() => expandedDate ? getCalendarPlansForDate(calendarPlans, expandedDate) : [], [calendarPlans, expandedDate]);
  const detailOutfit = useMemo(() => {
    if (!detailEntry) return null;
    const oid = detailEntry.outfitId ?? detailEntry.actualOutfitId;
    return oid ? outfits.find((o) => o.id === oid) ?? null : null;
  }, [detailEntry, outfits]);

  // v1.1.4-dev 月历页: 当前展示日期和月份都等于今天时, 不渲染「回到今天」按钮。
  const isViewingToday = selectedDate === todayKey && monthDate === todayKey.slice(0, 7);

	  const hasMonthData = useMemo(() => {
	    const [y, m] = monthDate.split("-").map(Number) as [number, number];
	    const firstDay = `${monthDate}-01`;
	    const lastDay = `${monthDate}-${String(new Date(y!, m!, 0).getDate()).padStart(2, "0")}`;
	    return entries.some((e) => e.date >= firstDay && e.date <= lastDay)
	      || calendarPlans.some((p) => p.startDate <= lastDay && p.endDate >= firstDay);
	  }, [entries, calendarPlans, monthDate]);

  const reduceMotion = useReducedMotion();
  const [monthSlideDir, setMonthSlideDir] = useState<1 | -1>(1);

  function handleDateClick(dateKey: string) {
    if (expandedDate === dateKey) {
      onSelectedDateChange(dateKey);
      setExpandedDate(null);
      return;
    }
    onSelectedDateChange(dateKey);
    setExpandedDate(dateKey);
  }

  function handleTodayClick() {
    onToday();
    setExpandedDate(todayKey);
  }

  function shiftMonthWithDirection(delta: -1 | 1) {
    setExpandedDate(null);
    setMonthSlideDir(delta);
    onMonthChange(delta);
  }

  function planTypeLabel(type: OutfitCalendarPlan["type"]): string {
    if (type === "travel") return "旅行";
    if (type === "business") return "出差";
    return "计划";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <AppSubPageTopBar
        title="穿搭计划"
        onBack={onBack}
        rightAction={
          <button
            type="button"
            onClick={onAdd}
            aria-label="添加计划"
            className="inline-flex h-11 items-center justify-center rounded-full bg-denim px-4 text-sm font-semibold text-white shadow-sm active:scale-95 whitespace-nowrap min-w-[72px]"
          >
            +计划
          </button>
        }
      />

      {/* Month header */}
      <div className="relative h-11 px-5">
        <button type="button" className="absolute left-5 top-1 grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" onClick={() => shiftMonthWithDirection(-1)} aria-label="上一月">
          <ChevronLeft size={18} />
        </button>
        <div className="absolute left-1/2 top-0 flex h-11 -translate-x-1/2 items-center justify-center">
          <span className="whitespace-nowrap text-base font-semibold text-ink">{my}年{mm}月</span>
        </div>
        <div className="absolute right-5 top-1 flex h-9 items-center gap-1">
          {!isViewingToday ? (
            <button
              type="button"
              onClick={handleTodayClick}
              aria-label="回到今天"
              className="inline-flex h-9 items-center justify-center rounded-full border border-ink/10 bg-white px-2.5 text-[11px] font-semibold text-denim shadow-sm active:scale-95"
            >
              今天
            </button>
          ) : null}
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" onClick={() => shiftMonthWithDirection(1)} aria-label="下一月">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="px-2 flex-1 overflow-y-auto" onClick={() => setExpandedDate(null)}>
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="text-center text-[10px] text-ink/35 py-1">{h}</div>
          ))}
        </div>

        {/* Week rows (with swipe gesture + slide-in/out animation) */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.10}
          onDragEnd={(_, info) => {
            const horizontal = Math.abs(info.offset.x);
            const vertical = Math.abs(info.offset.y);
            if (vertical > horizontal) return;
            if (info.offset.x <= -56 || info.velocity.x <= -520) shiftMonthWithDirection(1);
            if (info.offset.x >= 56 || info.velocity.x >= 520) shiftMonthWithDirection(-1);
          }}
          className="touch-pan-y select-none"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={monthDate}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: monthSlideDir * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: monthSlideDir * -32 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: ease.app }}
            >
              {weekRows.map((row, rowIdx) => (
                <div key={rowIdx}>
                  <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                    {row.map((cell) => {
                      const isSelected = cell.dateKey === selectedDate;
                      const isToday = cell.isToday;
                      // v1.1 review fix: 月历用主展示解析（实际已穿 > 主计划 > 第一计划），而非只读单条 entry
                      const primaryEntry = resolvePrimaryDisplayEntryForDate(entries, cell.dateKey);
                      const dayAllEntries = getEntriesForDate(entries, cell.dateKey);
                      const extraCount = Math.max(0, dayAllEntries.length - 1);
                      const targetOutfitId = primaryEntry?.outfitId ?? primaryEntry?.actualOutfitId;
                      const outfit = targetOutfitId ? outfits.find((o) => o.id === targetOutfitId) : null;
                      const cover = outfit ? getOutfitCover(outfit, items) : null;
                      const cellPlans = getCalendarPlansForDate(calendarPlans, cell.dateKey);

                      return (
                        <div
                          key={cell.dateKey}
                          role="button"
                          tabIndex={0}
                          className={`relative flex flex-col items-center rounded-lg py-1 min-h-[56px] transition-colors ${
                            !cell.isCurrentMonth ? "opacity-40" : ""
                          } ${isSelected ? "bg-denim/8 ring-1 ring-denim/30" : "hover:bg-ink/3"}`}
                          onClick={(event) => { event.stopPropagation(); handleDateClick(cell.dateKey); }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              handleDateClick(cell.dateKey);
                            }
                          }}
                        >
                          <span className={`text-xs font-semibold ${isToday ? "text-denim" : "text-ink/70"}`}>
                            {cell.day}
                          </span>
                            <div className="h-6 flex items-center justify-center mt-0.5 relative">
                              {(() => {
                                const thumb = cover?.imageDataUrl
                                  || (outfit ? items.find((i) => i.id != null && outfit.itemIds.includes(i.id!))?.thumbnailDataUrl
                                             || items.find((i) => i.id != null && outfit.itemIds.includes(i.id!))?.imageDataUrl
                                             : null);
                                if (thumb) {
                                  if (extraCount > 0) {
                                    return (
                                      <div className="relative rounded pointer-events-none" aria-hidden="true">
                                        <img src={thumb} alt="" className="h-5 w-5 rounded object-cover" />
                                        <span className="absolute -top-1 -right-1 bg-denim text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-semibold">
                                          +{extraCount}
                                        </span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="rounded pointer-events-none" aria-hidden="true">
                                      <img src={thumb} alt="" className="h-5 w-5 rounded object-cover" />
                                    </div>
                                  );
                                }
                                // v1.1 review fix: 状态标签按 entry.status 区分 worn/planned/changed
                                if (primaryEntry) {
                                  let label = "计划";
                                  if (primaryEntry.status === "worn") label = "已穿";
                                  else if (primaryEntry.status === "changed") label = "已变更";
                                  else if (primaryEntry.status === "planned" && cell.dateKey < todayKey) label = "未确认";
                                  return <span className="text-[10px] text-moss/60">{label}</span>;
                                }
                                return null;
                              })()}
                            </div>
                          {cellPlans.length > 0 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {cellPlans.slice(0, 2).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`h-[5px] w-4 rounded-full ${PLAN_TONE_BG_MAP[p.tone]}`}
                                  aria-label={`${p.title} · ${planTypeLabel(p.type)}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenCalendarPlan(p.id);
                                  }}
                                />
                              ))}
                              {cellPlans.length > 2 && <span className="text-[9px] text-ink/35">+{cellPlans.length - 2}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Day detail card after the selected row */}
                  {expandedDate && expandedRowIndex === rowIdx && (
                    <AnimatePresence mode="wait">
                      <motion.div onClick={(e) => e.stopPropagation()}
                        key={expandedDate ?? "collapsed"}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: ease.app }}
                        className="overflow-hidden mb-2 px-1"
                      >
                        <OutfitPlanDayCard
                          dateKey={expandedDate!}
                          todayKey={todayKey}
                          entries={detailEntries}
                          plans={detailPlans}
                          outfit={detailOutfit}
                          items={items}
                          onSelectOutfit={() => onSelectOutfitForDate(expandedDate!)}
                          onViewOutfit={() => detailOutfit && onViewOutfit(detailOutfit.id)}
                          onMarkWornToday={() => detailEntry && onMarkWornToday(detailEntry)}
                          onCancelWear={onCancelWear ? (outfitId: string) => onCancelWear(expandedDate!, outfitId) : undefined}
                          onSetPrimary={onSetPrimary}
                          onMarkSkipped={onMarkSkipped}
                          onDeleteEntry={onDeleteEntry}
                          onOpenCalendarPlan={onOpenCalendarPlan}
                          onMessage={onMessage}
                          onAiRecommend={onAiRecommend ? () => onAiRecommend(expandedDate!) : undefined}
                        />
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              ))}

              {/* Empty month hint */}
              {!hasMonthData && (
                <div className="py-6 text-center">
                  <p className="text-xs text-ink/45">这个月还没有穿搭计划</p>
                  <p className="text-[11px] text-ink/30 mt-1">点击右上角 + 添加旅行、出差或单日穿搭。</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
