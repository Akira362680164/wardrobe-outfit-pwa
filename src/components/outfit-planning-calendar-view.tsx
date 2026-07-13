"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { OutfitCalendarPlan, OutfitPlanEntry, SavedOutfit, WardrobeItem } from "@/lib/types";
import { getLocalMonthGrid, groupMonthCellsByWeek, getDateRowIndex, shiftMonth } from "@/lib/outfit-calendar";
import { getCalendarPlansForDate, PLAN_TONE_BG_MAP, resolvePrimaryDisplayEntryForDate, getEntriesForDate } from "@/lib/outfit-planning";
import { getOutfitCover } from "@/lib/outfit-cover";
import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { OutfitPlanDayCard } from "@/components/outfit-plan-day-card";
import { spring } from "@/lib/motion-tokens";
import { OnlineAssetImage } from "@/components/online/online-asset-image";
import {
  createCalendarTrackGestureSession,
  finishCalendarTrackGestureSession,
  getCalendarTrackTargetX,
  resolveCalendarTrackSnap,
  updateCalendarTrackGestureSession,
  type CalendarTrackGestureSession,
} from "@/lib/calendar-track-gesture";

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

function shiftMonthDateKey(monthDate: string, delta: -1 | 0 | 1): string {
  if (delta === 0) return monthDate;
  const [year, monthIndex] = monthDate.split("-").map(Number) as [number, number];
  const shifted = shiftMonth(year, monthIndex, delta);
  return `${shifted.year}-${String(shifted.monthIndex).padStart(2, "0")}`;
}

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
  const reduceMotion = Boolean(useReducedMotion());
  const trackViewportRef = useRef<HTMLDivElement>(null);
  const trackX = useMotionValue(0);
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [displayMonthDate, setDisplayMonthDate] = useState(monthDate);
  const displayMonthDateRef = useRef(monthDate);
  const expectedMonthDateRef = useRef<string | null>(null);
  const gestureSessionRef = useRef<CalendarTrackGestureSession | null>(null);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const animationEpochRef = useRef(0);
  const activePageOffsetRef = useRef<-1 | 0 | 1 | null>(null);
  const queuedMonthStepsRef = useRef(0);
  const recenterFrameRef = useRef<number | null>(null);
  const queuedFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickFrameRef = useRef<number | null>(null);

  const stopTrackAnimation = useCallback(() => {
    animationEpochRef.current += 1;
    animationRef.current?.stop();
    animationRef.current = null;
    activePageOffsetRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const viewport = trackViewportRef.current;
    if (!viewport) return;

    const updateWidth = () => {
      const nextWidth = viewport.getBoundingClientRect().width;
      if (nextWidth <= 0 || Math.abs(nextWidth - trackWidthRef.current) < 0.5) return;
      const previousWidth = trackWidthRef.current;
      const relativePosition = previousWidth > 0 ? trackX.get() / previousWidth : -1;
      stopTrackAnimation();
      trackWidthRef.current = nextWidth;
      setTrackWidth(nextWidth);
      trackX.set(relativePosition * nextWidth);
    };

    updateWidth();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateWidth);
    observer?.observe(viewport);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [stopTrackAnimation, trackX]);

  useEffect(() => {
    if (monthDate === displayMonthDateRef.current) {
      if (expectedMonthDateRef.current === monthDate) expectedMonthDateRef.current = null;
      return;
    }
    if (expectedMonthDateRef.current && monthDate !== expectedMonthDateRef.current) return;
    stopTrackAnimation();
    queuedMonthStepsRef.current = 0;
    expectedMonthDateRef.current = null;
    displayMonthDateRef.current = monthDate;
    setDisplayMonthDate(monthDate);
    if (trackWidthRef.current > 0) trackX.set(-trackWidthRef.current);
  }, [monthDate, stopTrackAnimation, trackX]);

  useEffect(() => () => {
    stopTrackAnimation();
    if (recenterFrameRef.current != null) cancelAnimationFrame(recenterFrameRef.current);
    if (queuedFrameRef.current != null) cancelAnimationFrame(queuedFrameRef.current);
    if (suppressClickFrameRef.current != null) cancelAnimationFrame(suppressClickFrameRef.current);
  }, [stopTrackAnimation]);

  const [my, mm] = displayMonthDate.split("-").map(Number) as [number, number];
  const monthCells = useMemo(() => getLocalMonthGrid(my, mm), [my, mm]);
  const monthPages = useMemo(
    () => ([-1, 0, 1] as const).map((pageOffset) => ({
      pageOffset,
      monthDate: shiftMonthDateKey(displayMonthDate, pageOffset),
    })),
    [displayMonthDate],
  );
  // v1.1.6 small rework: 月历卡片折叠状态
  const [expandedDate, setExpandedDate] = useState<string | null>(selectedDate);
  const previousSelectedDateRef = useRef(selectedDate);
  useEffect(() => {
    if (previousSelectedDateRef.current === selectedDate) return;
    previousSelectedDateRef.current = selectedDate;
    setExpandedDate(selectedDate);
  }, [selectedDate]);
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
  const isViewingToday = selectedDate === todayKey && displayMonthDate === todayKey.slice(0, 7);

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
    stopTrackAnimation();
    queuedMonthStepsRef.current = 0;
    const todayMonth = todayKey.slice(0, 7);
    expectedMonthDateRef.current = todayMonth;
    displayMonthDateRef.current = todayMonth;
    setDisplayMonthDate(todayMonth);
    if (trackWidthRef.current > 0) trackX.set(-trackWidthRef.current);
    onToday();
    setExpandedDate(todayKey);
  }

  const animateTrackToPageRef = useRef<(pageOffset: -1 | 0 | 1, velocity?: number) => void>(() => {});

  function runQueuedMonthStep() {
    const queuedSteps = queuedMonthStepsRef.current;
    if (queuedSteps === 0) return;
    const nextStep = queuedSteps > 0 ? 1 : -1;
    queuedMonthStepsRef.current -= nextStep;
    queuedFrameRef.current = requestAnimationFrame(() => {
      queuedFrameRef.current = null;
      animateTrackToPageRef.current(nextStep, 0);
    });
  }

  function finishTrackSnap(pageOffset: -1 | 0 | 1) {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    if (pageOffset === 0) {
      trackX.set(-width);
      runQueuedMonthStep();
      return;
    }

    const nextMonthDate = shiftMonthDateKey(displayMonthDateRef.current, pageOffset);
    expectedMonthDateRef.current = nextMonthDate;
    displayMonthDateRef.current = nextMonthDate;
    setDisplayMonthDate(nextMonthDate);
    onMonthChange(pageOffset);
    recenterFrameRef.current = requestAnimationFrame(() => {
      recenterFrameRef.current = null;
      trackX.set(-trackWidthRef.current);
      runQueuedMonthStep();
    });
  }

  function animateTrackToPage(pageOffset: -1 | 0 | 1, velocity = 0) {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    stopTrackAnimation();
    const epoch = animationEpochRef.current;
    activePageOffsetRef.current = pageOffset;
    const targetX = getCalendarTrackTargetX(pageOffset, width);

    if (reduceMotion) {
      trackX.set(targetX);
      activePageOffsetRef.current = null;
      finishTrackSnap(pageOffset);
      return;
    }

    animationRef.current = animate(trackX, targetX, {
      type: "spring",
      stiffness: 360,
      damping: 38,
      mass: 0.9,
      velocity,
      restDelta: 0.5,
      restSpeed: 5,
      onComplete: () => {
        if (animationEpochRef.current !== epoch) return;
        animationRef.current = null;
        activePageOffsetRef.current = null;
        finishTrackSnap(pageOffset);
      },
    });
  }
  animateTrackToPageRef.current = animateTrackToPage;

  function requestMonthShift(delta: -1 | 1) {
    setExpandedDate(null);
    const activePageOffset = activePageOffsetRef.current;
    if (activePageOffset === delta) {
      queuedMonthStepsRef.current = Math.max(-3, Math.min(3, queuedMonthStepsRef.current + delta));
      return;
    }
    if (activePageOffset === -delta) {
      queuedMonthStepsRef.current = 0;
      animateTrackToPage(0, 0);
      return;
    }
    if (activePageOffset === 0) {
      animateTrackToPage(delta, 0);
      return;
    }
    animateTrackToPage(delta, 0);
  }

  function suppressSyntheticClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    if (suppressClickFrameRef.current != null) cancelAnimationFrame(suppressClickFrameRef.current);
    suppressClickFrameRef.current = null;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0) || trackWidthRef.current <= 0) return;
    queuedMonthStepsRef.current = 0;
    stopTrackAnimation();
    gestureSessionRef.current = createCalendarTrackGestureSession(
      event.pointerId,
      { x: event.clientX, y: event.clientY, time: event.timeStamp },
      trackX.get(),
    );
  }

  function handleTrackPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const result = updateCalendarTrackGestureSession(
      session,
      { x: event.clientX, y: event.clientY, time: event.timeStamp },
      trackWidthRef.current,
    );
    gestureSessionRef.current = result.session;
    if (result.justClaimedHorizontal) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setExpandedDate(null);
    }
    if (result.trackX == null) return;
    event.preventDefault();
    trackX.set(result.trackX);
  }

  function releasePointerCapture(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleTrackPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const result = finishCalendarTrackGestureSession(
      session,
      { x: event.clientX, y: event.clientY, time: event.timeStamp },
      trackX.get(),
      trackWidthRef.current,
    );
    gestureSessionRef.current = null;
    releasePointerCapture(event);
    if (result.wasHorizontal) {
      suppressClickRef.current = true;
      suppressClickFrameRef.current = requestAnimationFrame(() => {
        suppressClickRef.current = false;
        suppressClickFrameRef.current = null;
      });
    }
    animateTrackToPage(result.pageOffset, result.velocity);
  }

  function handleTrackPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    gestureSessionRef.current = null;
    releasePointerCapture(event);
    animateTrackToPage(resolveCalendarTrackSnap(trackX.get(), 0, trackWidthRef.current), 0);
  }

  function planTypeLabel(type: OutfitCalendarPlan["type"]): string {
    if (type === "travel") return "旅行";
    if (type === "business") return "出差";
    return "计划";
  }

  const dayDetailCard = expandedDate ? (
    <OutfitPlanDayCard
      dateKey={expandedDate}
      todayKey={todayKey}
      entries={detailEntries}
      plans={detailPlans}
      outfit={detailOutfit}
      items={items}
      onSelectOutfit={() => onSelectOutfitForDate(expandedDate)}
      onChangeOutfit={() => onSelectOutfitForDate(expandedDate)}
      onViewOutfit={() => detailOutfit && onViewOutfit(detailOutfit.id)}
      onMarkWornToday={() => detailEntry && onMarkWornToday(detailEntry)}
      onCancelWear={onCancelWear ? (outfitId: string) => onCancelWear(expandedDate, outfitId) : undefined}
      onSetPrimary={onSetPrimary}
      onMarkSkipped={onMarkSkipped}
      onDeleteEntry={onDeleteEntry}
      onOpenCalendarPlan={onOpenCalendarPlan}
      onMessage={onMessage}
      onAiRecommend={onAiRecommend ? () => onAiRecommend(expandedDate) : undefined}
    />
  ) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <AppSubPageTopBar
        title="穿搭计划"
        onBack={onBack}
        rightAction={
          <button
            type="button"
            data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.e7e2007f8b"
            onClick={onAdd}
            aria-label="添加计划"
            className="inline-flex h-11 items-center justify-center ui-control-radius bg-denim px-4 text-sm font-semibold text-white shadow-sm active:scale-95 whitespace-nowrap min-w-[72px]"
          >
            +计划
          </button>
        }
      />

      {/* Month header */}
      <div className="relative h-11 px-5">
        <button type="button" data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.cf2a254c24" className="absolute left-5 top-1 grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" onClick={() => requestMonthShift(-1)} aria-label="上一月">
          <ChevronLeft size={18} />
        </button>
        <div className="absolute left-1/2 top-0 flex h-11 -translate-x-1/2 items-center justify-center">
          <span className="whitespace-nowrap text-base font-semibold text-ink">{my}年{mm}月</span>
        </div>
        <div className="absolute right-5 top-1 flex h-9 items-center gap-1">
          {!isViewingToday ? (
            <button
              type="button"
              data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.0b460a0af4" onClick={handleTodayClick}
              aria-label="回到今天"
              className="inline-flex h-9 items-center justify-center rounded-full border border-ink/10 bg-white px-2.5 text-[11px] font-semibold text-denim shadow-sm active:scale-95"
            >
              今天
            </button>
          ) : null}
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5" data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.60a1ddd8b9" onClick={() => requestMonthShift(1)} aria-label="下一月">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="px-2 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+4rem)]" data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.189b8fb927" onClick={() => setExpandedDate(null)}>
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_HEADERS.map((h) => (
            <div key={h} className="text-center text-[10px] text-ink/35 py-1">{h}</div>
          ))}
        </div>

        {/* Resident previous/current/next months share the same snap state machine as the arrows. */}
        <div
          ref={trackViewportRef}
          data-calendar-track="month"
          className="touch-pan-y select-none overflow-hidden"
          style={{ touchAction: "pan-y" }}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerCancel={handleTrackPointerCancel}
          onClickCapture={suppressSyntheticClick}
        >
          <motion.div
            className="flex items-start will-change-transform"
            style={{ x: trackX, visibility: trackWidth > 0 ? "visible" : "hidden" }}
          >
            {monthPages.map(({ pageOffset, monthDate: pageMonthDate }) => {
              const [pageYear, pageMonth] = pageMonthDate.split("-").map(Number) as [number, number];
              const pageCells = getLocalMonthGrid(pageYear, pageMonth);
              const pageWeekRows = groupMonthCellsByWeek(pageCells);
              const firstDay = `${pageMonthDate}-01`;
              const lastDay = `${pageMonthDate}-${String(new Date(pageYear, pageMonth, 0).getDate()).padStart(2, "0")}`;
              const hasPageData = entries.some((entry) => entry.date >= firstDay && entry.date <= lastDay)
                || calendarPlans.some((plan) => plan.startDate <= lastDay && plan.endDate >= firstDay);

              return (
                <LayoutGroup key={pageMonthDate} id={`calendar-month-${pageMonthDate}`}>
                  <div
                    data-calendar-page={pageOffset}
                    className="w-full shrink-0"
                    aria-hidden={pageOffset === 0 ? undefined : true}
                  >
                    {pageWeekRows.map((row, rowIdx) => {
                      const showDayDetail = pageOffset === 0 && Boolean(expandedDate) && expandedRowIndex === rowIdx;
                      return (
                        <div key={`${pageMonthDate}-${rowIdx}`} data-calendar-week-row={rowIdx}>
                          <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                            {row.map((cell) => {
                              const isSelected = cell.dateKey === selectedDate;
                              const isToday = cell.isToday;
                              const primaryEntry = resolvePrimaryDisplayEntryForDate(entries, cell.dateKey);
                              const dayAllEntries = getEntriesForDate(entries, cell.dateKey);
                              const extraCount = Math.max(0, dayAllEntries.length - 1);
                              const targetOutfitId = primaryEntry?.outfitId ?? primaryEntry?.actualOutfitId;
                              const outfit = targetOutfitId ? outfits.find((candidate) => candidate.id === targetOutfitId) : null;
                              const cover = outfit ? getOutfitCover(outfit, items) : null;
                              const cellPlans = getCalendarPlansForDate(calendarPlans, cell.dateKey);

                              return (
                                <div
                                  key={cell.dateKey}
                                  data-date-key={cell.dateKey}
                                  data-parity-id={`parity.app.app.src.components.outfit.planning.calendar.view.1803ec14dd.${cell.dateKey}`}
                                  role="button"
                                  tabIndex={pageOffset === 0 ? 0 : -1}
                                  className={`relative isolate flex min-h-[56px] flex-col items-center rounded-lg py-1 ${
                                    !cell.isCurrentMonth ? "opacity-40" : ""
                                  } ${isSelected ? "" : "hover:bg-ink/3"}`}
                                  onClick={(event) => { event.stopPropagation(); handleDateClick(cell.dateKey); }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleDateClick(cell.dateKey);
                                    }
                                  }}
                                >
                                  {isSelected ? (
                                    <motion.span
                                      layoutId={`month-date-selection-${pageMonthDate}`}
                                      aria-hidden="true"
                                      className="absolute inset-0 -z-10 rounded-lg bg-denim/8 ring-1 ring-inset ring-denim/30"
                                      transition={reduceMotion ? { duration: 0 } : spring.snappy}
                                    />
                                  ) : null}
                                  <span className={`relative z-10 text-xs font-semibold ${isToday ? "text-denim" : "text-ink/70"}`}>
                                    {cell.day}
                                  </span>
                                  <div className="relative z-10 mt-0.5 flex h-6 items-center justify-center">
                                    {(() => {
                                      const thumb = cover?.asset
                                        || (outfit ? items.find((item) => item.id != null && outfit.itemIds.includes(item.id!))?.mainImage?.asset : undefined);
                                      if (thumb) {
                                        if (extraCount > 0) {
                                          return (
                                            <div className="pointer-events-none relative rounded" aria-hidden="true">
                                              <OnlineAssetImage asset={thumb} variant="thumbnail" alt="" className="h-5 w-5 overflow-hidden rounded" imageClassName="object-cover" />
                                              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-denim text-[9px] font-semibold text-white">
                                                +{extraCount}
                                              </span>
                                            </div>
                                          );
                                        }
                                        return (
                                          <div className="pointer-events-none rounded" aria-hidden="true">
                                            <OnlineAssetImage asset={thumb} variant="thumbnail" alt="" className="h-5 w-5 overflow-hidden rounded" imageClassName="object-cover" />
                                          </div>
                                        );
                                      }
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
                                  {cellPlans.length > 0 ? (
                                    <div className="relative z-10 mt-0.5 flex gap-0.5">
                                      {cellPlans.slice(0, 2).map((plan) => (
                                        <button
                                          key={plan.id}
                                          data-parity-id={`parity.app.app.src.components.outfit.planning.calendar.view.36293ba0bc.${plan.id}`}
                                          type="button"
                                          tabIndex={pageOffset === 0 ? 0 : -1}
                                          className={`h-[5px] w-4 rounded-full ${PLAN_TONE_BG_MAP[plan.tone]}`}
                                          aria-label={`${plan.title} · ${planTypeLabel(plan.type)}`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onOpenCalendarPlan(plan.id);
                                          }}
                                        />
                                      ))}
                                      {cellPlans.length > 2 ? <span className="text-[9px] text-ink/35">+{cellPlans.length - 2}</span> : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>

                          {/* Reduced motion uses an immediate layout and opacity-only content, never height:auto. */}
                          {reduceMotion ? (
                            showDayDetail ? (
                              <div
                                data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.681fe1f11b"
                                onClick={(event) => event.stopPropagation()}
                                className="mb-2 overflow-hidden px-1"
                              >
                                {dayDetailCard}
                              </div>
                            ) : null
                          ) : (
                            <AnimatePresence initial={false} mode="popLayout">
                              {showDayDetail ? (
                                <motion.div
                                  data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.681fe1f11b"
                                  onClick={(event) => event.stopPropagation()}
                                  key={expandedDate ?? "collapsed"}
                                  layout="position"
                                  layoutId={`month-day-detail-${pageMonthDate}`}
                                  initial={{ opacity: 0, clipPath: "inset(0 0 10% 0 round 24px)" }}
                                  animate={{ opacity: 1, clipPath: "inset(0 0 0% 0 round 24px)" }}
                                  exit={{ opacity: 0, clipPath: "inset(0 0 10% 0 round 24px)" }}
                                  transition={{
                                    layout: spring.snappy,
                                    opacity: { duration: 0.16 },
                                    clipPath: { duration: 0.16 },
                                  }}
                                  className="mb-2 overflow-hidden px-1"
                                >
                                  {dayDetailCard}
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          )}
                        </div>
                      );
                    })}

                    {!hasPageData ? (
                      <div className="py-6 text-center">
                        <p className="text-xs text-ink/45">这个月还没有穿搭计划</p>
                        <p className="mt-1 text-[11px] text-ink/30">点击右上角 + 添加旅行、出差或单日穿搭。</p>
                      </div>
                    ) : null}
                  </div>
                </LayoutGroup>
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
