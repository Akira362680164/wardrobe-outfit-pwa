"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
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
import { getWeekDates, shiftDateByWeeks } from "@/lib/outfit-calendar";
import { getCalendarPlansForDate, PLAN_TONE_BG_MAP, resolvePrimaryDisplayEntryForDate, getEntriesForDate } from "@/lib/outfit-planning";
import { getOutfitCover } from "@/lib/outfit-cover";
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
  const reduceMotion = Boolean(useReducedMotion());
  const trackViewportRef = useRef<HTMLDivElement>(null);
  const trackX = useMotionValue(0);
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [displayAnchorDate, setDisplayAnchorDate] = useState(anchorDate);
  const displayAnchorDateRef = useRef(anchorDate);
  const expectedAnchorDateRef = useRef<string | null>(null);
  const gestureSessionRef = useRef<CalendarTrackGestureSession | null>(null);
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const animationEpochRef = useRef(0);
  const activePageOffsetRef = useRef<-1 | 0 | 1 | null>(null);
  const queuedWeekStepsRef = useRef(0);
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
    if (anchorDate === displayAnchorDateRef.current) {
      if (expectedAnchorDateRef.current === anchorDate) expectedAnchorDateRef.current = null;
      return;
    }
    if (expectedAnchorDateRef.current && anchorDate !== expectedAnchorDateRef.current) return;
    stopTrackAnimation();
    queuedWeekStepsRef.current = 0;
    expectedAnchorDateRef.current = null;
    displayAnchorDateRef.current = anchorDate;
    setDisplayAnchorDate(anchorDate);
    if (trackWidthRef.current > 0) trackX.set(-trackWidthRef.current);
  }, [anchorDate, stopTrackAnimation, trackX]);

  useEffect(() => () => {
    stopTrackAnimation();
    if (recenterFrameRef.current != null) cancelAnimationFrame(recenterFrameRef.current);
    if (queuedFrameRef.current != null) cancelAnimationFrame(queuedFrameRef.current);
    if (suppressClickFrameRef.current != null) cancelAnimationFrame(suppressClickFrameRef.current);
  }, [stopTrackAnimation]);

  const pageAnchors = useMemo(
    () => ([-1, 0, 1] as const).map((pageOffset) => ({
      pageOffset,
      anchorDate: shiftDateByWeeks(displayAnchorDate, pageOffset),
    })),
    [displayAnchorDate],
  );
  const weekDates = useMemo(() => getWeekDates(displayAnchorDate), [displayAnchorDate]);
  const weekLabel = useMemo(() => {
    const first = weekDates[0] ?? displayAnchorDate;
    const last = weekDates[6] ?? displayAnchorDate;
    const fp = first.split("-");
    const lp = last.split("-");
    return `${parseInt(fp[0]!, 10)}年${parseInt(fp[1]!, 10)}月${parseInt(fp[2]!, 10)}日 - ${parseInt(lp[1]!, 10)}月${parseInt(lp[2]!, 10)}日`;
  }, [displayAnchorDate, weekDates]);
  const selectedWeekdayIndex = useMemo(() => {
    const parentWeekDates = getWeekDates(anchorDate);
    const index = parentWeekDates.indexOf(selectedDate);
    return index >= 0 ? index : 0;
  }, [anchorDate, selectedDate]);

  // v1.1.6 small rework: 周日历卡片折叠状态
  const [expandedDate, setExpandedDate] = useState<string | null>(selectedDate);
  const previousSelectedDateRef = useRef(selectedDate);
  useEffect(() => {
    if (previousSelectedDateRef.current === selectedDate) return;
    previousSelectedDateRef.current = selectedDate;
    setExpandedDate(selectedDate);
  }, [selectedDate]);

  function handleDateClick(dateKey: string) {
    if (dateKey === selectedDate) {
      setExpandedDate((current) => current === dateKey ? null : dateKey);
      return;
    }
    onSelectedDateChange(dateKey);
    setExpandedDate(dateKey);
  }

  const animateTrackToPageRef = useRef<(pageOffset: -1 | 0 | 1, velocity?: number) => void>(() => {});

  function runQueuedWeekStep() {
    const queuedSteps = queuedWeekStepsRef.current;
    if (queuedSteps === 0) return;
    const nextStep = queuedSteps > 0 ? 1 : -1;
    queuedWeekStepsRef.current -= nextStep;
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
      runQueuedWeekStep();
      return;
    }

    const nextAnchorDate = shiftDateByWeeks(displayAnchorDateRef.current, pageOffset);
    expectedAnchorDateRef.current = nextAnchorDate;
    displayAnchorDateRef.current = nextAnchorDate;
    setDisplayAnchorDate(nextAnchorDate);
    onShiftWeek(pageOffset);
    recenterFrameRef.current = requestAnimationFrame(() => {
      recenterFrameRef.current = null;
      trackX.set(-trackWidthRef.current);
      runQueuedWeekStep();
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

  function requestWeekShift(delta: -1 | 1) {
    setExpandedDate(null);
    const activePageOffset = activePageOffsetRef.current;
    if (activePageOffset === delta) {
      queuedWeekStepsRef.current = Math.max(-3, Math.min(3, queuedWeekStepsRef.current + delta));
      return;
    }
    if (activePageOffset === -delta) {
      queuedWeekStepsRef.current = 0;
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
    queuedWeekStepsRef.current = 0;
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
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-white p-3 shadow-soft border border-ink/5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink">本周穿搭</span>
          <span className="text-[11px] text-ink/50">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-ink/5" data-parity-id="parity.app.app.src.components.outfit.weekly.plan.strip.326d6090aa" onClick={() => requestWeekShift(-1)} aria-label="上一周"><ChevronLeft size={14} /></button>
          <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-ink/5" data-parity-id="parity.app.app.src.components.outfit.weekly.plan.strip.d8d6fa76f4" onClick={() => requestWeekShift(1)} aria-label="下一周"><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* Resident previous/current/next weeks: direct 1:1 manipulation after horizontal intent wins. */}
      <div
        ref={trackViewportRef}
        data-calendar-track="week"
        className="touch-pan-y select-none overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerCancel={handleTrackPointerCancel}
        onClickCapture={suppressSyntheticClick}
      >
        <motion.div
          className="flex"
          style={{ x: trackX, visibility: trackWidth > 0 ? "visible" : "hidden" }}
        >
          {pageAnchors.map(({ pageOffset, anchorDate: pageAnchorDate }) => {
            const pageDates = getWeekDates(pageAnchorDate);
            const pageSelectedDate = pageDates[selectedWeekdayIndex] ?? pageDates[0];
            return (
              <div
                key={pageAnchorDate}
                data-calendar-page={pageOffset}
                className="w-full shrink-0"
                aria-hidden={pageOffset === 0 ? undefined : true}
              >
                <div className="mb-2 grid grid-cols-7 gap-0.5">
                  {pageDates.map((dateKey) => {
                    const d = parseInt(dateKey.split("-")[2]!, 10);
                    const isToday = dateKey === todayKey;
                    const isSelected = dateKey === pageSelectedDate;
                    const allDayEntries = getEntriesForDate(entries, dateKey);
                    const primaryEntry = resolvePrimaryDisplayEntryForDate(entries, dateKey);
                    const extraCount = Math.max(0, allDayEntries.length - 1);
                    const entry = primaryEntry;
                    const outfit = entry ? (() => {
                      const oid = entry.outfitId ?? entry.actualOutfitId;
                      return oid ? outfits.find((candidate) => candidate.id === oid) : null;
                    })() : null;
                    const cover = outfit ? getOutfitCover(outfit, items) : null;
                    const datePlansForDay = getCalendarPlansForDate(calendarPlans, dateKey);

                    return (
                      <button
                        key={dateKey}
                        data-date-key={dateKey}
                        type="button"
                        tabIndex={pageOffset === 0 ? 0 : -1}
                        className={`relative isolate flex flex-col items-center rounded-lg py-1.5 ${isSelected ? "" : "hover:bg-ink/3"}`}
                        data-parity-id={pageOffset === 0
                          ? "parity.app.app.src.components.outfit.weekly.plan.strip.8383341358"
                          : `parity.app.app.src.components.outfit.weekly.plan.strip.8383341358.${pageOffset}.${dateKey}`}
                        onClick={() => handleDateClick(dateKey)}
                      >
                        {isSelected ? (
                          <motion.span
                            layoutId={`weekly-date-selection-${pageAnchorDate}`}
                            aria-hidden="true"
                            className="absolute inset-0 -z-10 rounded-lg bg-denim/8 ring-1 ring-inset ring-denim/30"
                            transition={reduceMotion ? { duration: 0 } : spring.control}
                          />
                        ) : null}
                        <span className="relative z-10 text-[10px] text-ink/40">{WEEKDAY_LABELS[new Date(
                          parseInt(dateKey.split("-")[0]!), parseInt(dateKey.split("-")[1]!) - 1, d
                        ).getDay()]}</span>
                        <span className={`relative z-10 text-sm font-semibold ${isToday ? "text-denim" : "text-ink"}`}>
                          {d}
                        </span>
                        <div className="relative z-10 mt-0.5 flex h-7 items-center justify-center">
                          {(() => {
                            const thumb = cover?.asset
                              || (outfit ? items.find((item) => item.id != null && outfit.itemIds.includes(item.id!))?.mainImage?.asset : undefined);
                            if (thumb) {
                              if (extraCount > 0) {
                                return <div className="relative"><OnlineAssetImage asset={thumb} variant="thumbnail" alt="" className="h-6 w-6 overflow-hidden rounded" imageClassName="object-cover" /><span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-denim text-[9px] text-white">+{extraCount}</span></div>;
                              }
                              return <OnlineAssetImage asset={thumb} variant="thumbnail" alt="" className="h-6 w-6 overflow-hidden rounded" imageClassName="object-cover" />;
                            }
                            if (entry) {
                              const label = entry.status === "worn" ? "已穿" : entry.status === "changed" ? "变更" : "计划";
                              return <span className={`text-[10px] ${entry.status === "worn" ? "text-moss" : "text-moss/70"}`}>{label}</span>;
                            }
                            return <span className="text-[11px] text-ink/20">+</span>;
                          })()}
                        </div>
                        {datePlansForDay.length > 0 ? (
                          <div className="relative z-10 mt-0.5 flex gap-0.5">
                            {datePlansForDay.slice(0, 2).map((plan) => (
                              <div key={plan.id} className={`h-[5px] w-4 rounded-full ${PLAN_TONE_BG_MAP[plan.tone]}`} />
                            ))}
                            {datePlansForDay.length > 2 ? <span className="text-[9px] text-ink/40">+{datePlansForDay.length - 2}</span> : null}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* Day detail card — only when expanded */}
      <AnimatePresence initial={false} mode="popLayout">
        {expandedDate === selectedDate ? (
          <motion.div
            key={selectedDate}
            layout={reduceMotion ? false : "position"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.16 }}
          >
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
