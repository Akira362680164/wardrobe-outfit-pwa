// v1.1.0-dev 穿搭计划: 计划数据计算纯函数

import type { OutfitPlanEntry, OutfitCalendarPlan, OutfitCalendarPlanTone, OutfitCalendarPlanType, OutfitPlanEntryStatus } from "@/lib/types";
import { enumerateDateRange } from "@/lib/outfit-calendar";
import { sortWornEntriesForDay, sortPlanEntriesForDay, resolvePrimaryDisplayEntryForDate, getEntriesForDate, getActualWornEntriesForDate, getPlannedEntriesForDate, getChangedEntriesForDate, getPrimaryPlannedEntryForDate, getOutfitPlanDateRelation, getDefaultEntryModeForDate, canConfirmOutfitWornForDate, shouldSyncWardrobeWearStats } from "@/lib/outfit-wear-sync";

export { sortWornEntriesForDay, sortPlanEntriesForDay, resolvePrimaryDisplayEntryForDate, getEntriesForDate, getActualWornEntriesForDate, getPlannedEntriesForDate, getChangedEntriesForDate, getPrimaryPlannedEntryForDate, getOutfitPlanDateRelation, getDefaultEntryModeForDate, canConfirmOutfitWornForDate, shouldSyncWardrobeWearStats };

export function getPlanEntriesForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry[] {
  return entries.filter((e) => e.date === dateKey);
}

export function getPlanEntryForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry | undefined {
  return entries.find((e) => e.date === dateKey);
}

export function getCalendarPlansForDate(plans: OutfitCalendarPlan[], dateKey: string): OutfitCalendarPlan[] {
  return plans
    .filter((p) => dateKey >= p.startDate && dateKey <= p.endDate)
    .sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
      const typeOrder: Record<OutfitCalendarPlanType, number> = { travel: 0, business: 1, custom: 2 };
      if (a.type !== b.type) return (typeOrder[a.type] ?? 2) - (typeOrder[b.type] ?? 2);
      return a.updatedAt > b.updatedAt ? -1 : 1;
    });
}

export function getCalendarPlansForRange(plans: OutfitCalendarPlan[], startDate: string, endDate: string): OutfitCalendarPlan[] {
  return plans.filter((p) => p.startDate <= endDate && p.endDate >= startDate);
}

export function isDateInsidePlan(dateKey: string, plan: OutfitCalendarPlan): boolean {
  return dateKey >= plan.startDate && dateKey <= plan.endDate;
}

export function getPlanEdge(dateKey: string, plan: OutfitCalendarPlan): "start" | "middle" | "end" | "single" | null {
  if (!isDateInsidePlan(dateKey, plan)) return null;
  if (plan.startDate === plan.endDate) return "single";
  if (dateKey === plan.startDate) return "start";
  if (dateKey === plan.endDate) return "end";
  return "middle";
}

export function createOutfitPlanEntry(input: {
  date: string;
  outfitId?: string;
  itemIds?: number[];
  calendarPlanId?: string;
  title?: string;
  scene?: string;
  weatherNote?: string;
  notes?: string;
  now?: string;
}): OutfitPlanEntry {
  const now = input.now ?? new Date().toISOString();
  return {
    id: `plan-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    outfitId: input.outfitId,
    itemIds: input.itemIds,
    calendarPlanId: input.calendarPlanId,
    title: input.title,
    scene: input.scene,
    weatherNote: input.weatherNote,
    status: "planned",
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
}

export function createOutfitCalendarPlan(input: {
  type: OutfitCalendarPlanType;
  title?: string;
  startDate: string;
  endDate: string;
  tone?: OutfitCalendarPlanTone;
  destination?: string;
  activities?: string[];
  weatherNote?: string;
  notes?: string;
  packingEnabled?: boolean;
  now?: string;
}): OutfitCalendarPlan {
  const now = input.now ?? new Date().toISOString();
  const defaultTitles: Record<OutfitCalendarPlanType, string> = { travel: "未命名旅行", business: "未命名出差", custom: "未命名计划" };
  const defaultTones: Record<OutfitCalendarPlanType, OutfitCalendarPlanTone> = { travel: "clay", business: "moss", custom: "denim" };
  const defaultPacking: Record<OutfitCalendarPlanType, boolean> = { travel: true, business: true, custom: false };
  return {
    id: `calendar-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    title: input.title?.trim() || defaultTitles[input.type],
    startDate: input.startDate,
    endDate: input.endDate,
    tone: input.tone ?? defaultTones[input.type],
    destination: input.destination?.trim() || undefined,
    activities: input.activities?.filter(Boolean).slice(0, 8),
    weatherNote: input.weatherNote?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    packingEnabled: input.packingEnabled ?? defaultPacking[input.type],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateOutfitPlanEntryStatus(
  entry: OutfitPlanEntry,
  status: OutfitPlanEntryStatus,
  patch?: Partial<OutfitPlanEntry>,
): OutfitPlanEntry {
  const now = new Date().toISOString();
  return { ...entry, status, ...patch, updatedAt: now };
}

export function getPrimaryOutfitPlanEntryForDate(entries: OutfitPlanEntry[], date: string): OutfitPlanEntry | undefined {
  const matches = entries.filter((e) => e.date === date);
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return matches[0];
}

export function normalizeOutfitPlanEntriesForDisplay(entries: OutfitPlanEntry[]): OutfitPlanEntry[] {
  const seen = new Map<string, OutfitPlanEntry>();
  for (const e of entries) {
    const existing = seen.get(e.date);
    if (!existing || e.updatedAt > existing.updatedAt) {
      seen.set(e.date, e);
    }
  }
  return Array.from(seen.values());
}

export function upsertOutfitPlanEntryForDate(
  entries: OutfitPlanEntry[],
  input: { date: string; outfitId?: string; calendarPlanId?: string; title?: string; scene?: string; weatherNote?: string; notes?: string; now?: string },
): { entries: OutfitPlanEntry[]; updated: OutfitPlanEntry } {
  const now = input.now ?? new Date().toISOString();
  const existing = getPrimaryOutfitPlanEntryForDate(entries, input.date);
  const cleaned = entries.filter((e) => e !== existing);

  if (existing) {
    const updated: OutfitPlanEntry = {
      ...existing,
      outfitId: input.outfitId ?? existing.outfitId,
      calendarPlanId: input.calendarPlanId !== undefined ? input.calendarPlanId : existing.calendarPlanId,
      title: input.title ?? existing.title,
      scene: input.scene ?? existing.scene,
      weatherNote: input.weatherNote ?? existing.weatherNote,
      notes: input.notes ?? existing.notes,
      status: "planned",
      updatedAt: now,
    };
    cleaned.push(updated);
    return { entries: cleaned, updated };
  }

  const created = createOutfitPlanEntry({ ...input, now });
  cleaned.push(created);
  return { entries: cleaned, updated: created };
}

export const PLAN_TONE_CLASS_MAP: Record<OutfitCalendarPlanTone, string> = {
  denim: "bg-denim/12 text-denim border-denim/20",
  moss: "bg-moss/12 text-moss border-moss/20",
  clay: "bg-clay/12 text-clay border-clay/20",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  slate: "bg-slate-100 text-slate-700 border-slate-200",
};

export const PLAN_TONE_BG_MAP: Record<OutfitCalendarPlanTone, string> = {
  denim: "bg-denim/30",
  moss: "bg-moss/30",
  clay: "bg-clay/30",
  amber: "bg-amber-300",
  rose: "bg-rose-300",
  purple: "bg-purple-300",
  slate: "bg-slate-300",
};

export const PLAN_TONE_LABEL_MAP: Record<OutfitCalendarPlanTone, string> = {
  denim: "牛仔蓝",
  moss: "苔绿",
  clay: "陶土",
  amber: "琥珀",
  rose: "玫瑰",
  purple: "紫藤",
  slate: "岩灰",
};
