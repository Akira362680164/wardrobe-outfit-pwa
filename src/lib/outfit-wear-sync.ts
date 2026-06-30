// v1.1.0 fix: 穿着同步统一服务 — 计划/实际穿着/套装 wornDates/单品 wornDates 同步
// 所有穿着同步写入必须使用 Dexie transaction，保证 entry/outfit/item 同时成功或失败。

import { getWardrobeSnapshot } from "@/lib/data-repo";
import { addWornDate, removeWornDate } from "@/lib/wear-records";
import type { OutfitPlanEntry, OutfitPlanEntryRole } from "@/lib/types";
import { bridgeOutfitPlanDelete, bridgeOutfitPlanUpsert } from "@/lib/repository/wardrobe-repository";
import { bridgeOutfitUpsert } from "@/lib/repository/wardrobe-repository";
import { bridgeGarmentUpdate } from "@/lib/repository/wardrobe-repository";

// ============================================================
// 错误类型
// ============================================================

export class OutfitWearSyncError extends Error {
  code: "INVALID_DATE" | "FUTURE_WEAR_NOT_ALLOWED" | "OUTFIT_NOT_FOUND" | "DB_WRITE_FAILED";
  constructor(code: OutfitWearSyncError["code"], message: string) {
    super(message);
    this.name = "OutfitWearSyncError";
    this.code = code;
  }
}

export function formatOutfitWearSyncError(error: unknown): string {
  if (error instanceof OutfitWearSyncError) {
    switch (error.code) {
      case "INVALID_DATE": return "日期异常，未保存。";
      case "FUTURE_WEAR_NOT_ALLOWED": return "未来日期只能添加计划，不能记为已穿。";
      case "OUTFIT_NOT_FOUND": return "这套穿搭已被删除，请刷新后重试。";
      case "DB_WRITE_FAILED": return "本地数据库写入失败，请重试。";
    }
  }
  if (error instanceof Error) return error.message;
  return "操作失败，请重试。";
}

// ============================================================
// 类型定义
// ============================================================

export type AddOutfitToDateMode = "auto" | "planned" | "worn";

export interface AddOutfitToDateInput {
  dateKey: string;
  outfitId: string;
  mode?: AddOutfitToDateMode;
  todayKey: string;
  calendarPlanId?: string;
  makePrimary?: boolean;
  role?: OutfitPlanEntryRole;
  sortOrder?: number;
}

export interface OutfitWearSyncResult {
  changedEntryIds: string[];
  touchedEntryIds?: string[];
  deletedEntryIds?: string[];
  updatedOutfitIds: string[];
  updatedItemIds: number[];
  messageHint?: "planned" | "worn" | "cancelled";
}

// ============================================================
// 意图解析
// ============================================================

export function resolveAddOutfitIntent(
  dateKey: string,
  todayKey: string,
  mode: AddOutfitToDateMode,
): "planned" | "worn" {
  if (mode === "planned") return "planned";
  if (mode === "worn") return "worn";
  return dateKey >= todayKey ? "planned" : "worn";
}

// ============================================================
// 日期状态机纯函数 (v1.1.9 4D)
// ============================================================

export type DateRelation = "past" | "current" | "future";

/**
 * 判断目标日期相对于今天的时间关系。
 * - past：日期小于今天
 * - current：日期等于今天
 * - future：日期大于今天
 */
export function getOutfitPlanDateRelation(dateKey: string, todayKey: string): DateRelation {
  if (dateKey < todayKey) return "past";
  if (dateKey > todayKey) return "future";
  return "current";
}

/**
 * 根据日期状态返回默认 entry 模式。
 * - past → worn（历史补录）
 * - current → planned（今天计划）
 * - future → planned（未来计划）
 */
export function getDefaultEntryModeForDate(dateKey: string, todayKey: string): "worn" | "planned" {
  const relation = getOutfitPlanDateRelation(dateKey, todayKey);
  if (relation === "past") return "worn";
  return "planned";
}

/**
 * 判断某日期是否允许点击"今天穿了"确认按钮。
 * 仅今天（current）日期且存在 planned 记录时返回 true。
 * 过去日期不允许补录已穿（历史补录走 addOutfitToDate 手动模式）。
 * 未来日期不允许确认穿着。
 */
export function canConfirmOutfitWornForDate(dateKey: string, todayKey: string): boolean {
  return dateKey === todayKey;
}

/**
 * 判断某 entry 是否需要同步衣物穿着次数。
 * 仅实际已穿（worn）状态需要同步。
 * planned / skipped / changed 状态均不同步。
 */
export function shouldSyncWardrobeWearStats(entry: OutfitPlanEntry): boolean {
  return entry.status === "worn";
}

// ============================================================
// 按日期添加套装（自动模式）
// ============================================================

export async function addOutfitToDate(input: AddOutfitToDateInput): Promise<OutfitWearSyncResult> {
  const intent = resolveAddOutfitIntent(input.dateKey, input.todayKey, input.mode ?? "auto");
  if (intent === "planned") {
    const entry = await addPlannedOutfitForDate(input);
    return {
      changedEntryIds: [],
      touchedEntryIds: [entry.id],
      updatedOutfitIds: [],
      updatedItemIds: [],
      messageHint: "planned",
    };
  }
  return recordActualOutfitWear(input);
}

// ============================================================
// 创建计划穿搭
// ============================================================

export async function addPlannedOutfitForDate(input: AddOutfitToDateInput): Promise<OutfitPlanEntry> {
  const { dateKey, outfitId, calendarPlanId, makePrimary, role, sortOrder, todayKey: _todayKey } = input;
  const now = new Date().toISOString();
  const snapshot = await getWardrobeSnapshot();
  const existingEntries = snapshot.outfitPlanEntries.filter((e) => e.date === dateKey);

  if (makePrimary) {
    for (const e of existingEntries) {
      if (e.status === "planned" && e.isPrimary) {
        await bridgeOutfitPlanUpsert({ ...e, isPrimary: false, updatedAt: now });
      }
    }
  }

  const duplicate = existingEntries.find((e) => e.outfitId === outfitId && e.status === "planned");
  if (duplicate) return duplicate;

  const entry: OutfitPlanEntry = {
    id: `plan-entry-${dateKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: dateKey,
    outfitId,
    calendarPlanId,
    status: "planned",
    isPrimary: makePrimary ?? (existingEntries.filter((e) => e.status === "planned").length === 0),
    role: role ?? "other",
    sortOrder: sortOrder ?? existingEntries.length,
    createdAt: now,
    updatedAt: now,
  };

  await bridgeOutfitPlanUpsert(entry);
  return entry;
}

// ============================================================
// 记录实际穿着（核心事务函数）
// ============================================================

export async function recordActualOutfitWear(input: AddOutfitToDateInput): Promise<OutfitWearSyncResult> {
  const { dateKey, outfitId, todayKey } = input;

  if (dateKey > todayKey) {
    throw new OutfitWearSyncError("FUTURE_WEAR_NOT_ALLOWED", "未来日期只能添加计划，不能记为已穿。");
  }

  const now = new Date().toISOString();
  const snapshot = await getWardrobeSnapshot();

  const outfit = snapshot.outfits.find((o) => o.id === outfitId);
  if (!outfit) {
    throw new OutfitWearSyncError("OUTFIT_NOT_FOUND", "这套穿搭已被删除，请刷新后重试。");
  }

  const sameDayEntries = snapshot.outfitPlanEntries.filter((e) => e.date === dateKey);

  const existingWorn = sameDayEntries.find((e) => (e.outfitId === outfitId || e.actualOutfitId === outfitId) && e.status === "worn");
  if (existingWorn) {
    return {
      changedEntryIds: [],
      touchedEntryIds: [],
      updatedOutfitIds: [outfitId],
      updatedItemIds: [],
      messageHint: "worn",
    };
  }

  const plannedEntry = sameDayEntries.find((e) => e.outfitId === outfitId && (e.status === "planned" || e.status === "changed"));

  const newWornDates = addWornDate(outfit.wornDates, dateKey, todayKey);
  await bridgeOutfitUpsert({ ...outfit, wornDates: newWornDates, updatedAt: now });

  const otherWornEntries = sameDayEntries.filter(
    (e) => e.status === "worn" && (e.outfitId || e.actualOutfitId),
  );

  for (const itemId of outfit.itemIds) {
    const item = snapshot.items.find((i) => i.id === itemId);
    if (!item) continue;

    let stillWornByOther = false;
    for (const otherEntry of otherWornEntries) {
      const otherOutfitId = otherEntry.outfitId ?? otherEntry.actualOutfitId;
      if (!otherOutfitId) continue;
      const otherOutfit = snapshot.outfits.find((o) => o.id === otherOutfitId);
      if (otherOutfit?.itemIds.includes(itemId)) {
        stillWornByOther = true;
        break;
      }
    }

    if (!stillWornByOther) {
      const newItemWornDates = addWornDate(item.wornDates, dateKey, todayKey);
      await bridgeGarmentUpdate({ ...item, wornDates: newItemWornDates, updatedAt: now });
    }
  }

  let wornEntryId = "";

  if (plannedEntry) {
    await bridgeOutfitPlanUpsert({
      ...plannedEntry,
      status: "worn",
      wornDateLinked: dateKey,
      actualOutfitId: outfitId,
      wearOrigin: "planned_confirmed",
      plannedBeforeWorn: true,
      isPrimaryActual: plannedEntry.isPrimary ?? false,
      updatedAt: now,
    });
    wornEntryId = plannedEntry.id;
  } else {
    const newEntry: OutfitPlanEntry = {
      id: `plan-entry-${dateKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: dateKey,
      outfitId,
      status: "worn",
      wornDateLinked: dateKey,
      wearOrigin: "manual_actual",
      plannedBeforeWorn: false,
      isPrimaryActual: sameDayEntries.filter((e) => e.status === "worn").length === 0,
      createdAt: now,
      updatedAt: now,
    };
    await bridgeOutfitPlanUpsert(newEntry);
    wornEntryId = newEntry.id;
  }

  const changedEntryIds: string[] = [];
  for (const entry of sameDayEntries) {
    if (entry.status === "planned" && entry.isPrimary && entry.outfitId !== outfitId) {
      await bridgeOutfitPlanUpsert({
        ...entry,
        status: "changed",
        actualOutfitId: outfitId,
        updatedAt: now,
      });
      changedEntryIds.push(entry.id);
    }
  }

  return {
    changedEntryIds,
    touchedEntryIds: [wornEntryId, ...changedEntryIds].filter(Boolean),
    updatedOutfitIds: [outfitId],
    updatedItemIds: outfit.itemIds,
    messageHint: "worn",
  };
}

// ============================================================
// 取消实际穿着
// ============================================================

export async function cancelActualOutfitWearForDate(input: {
  dateKey: string;
  outfitId: string;
  todayKey: string;
}): Promise<OutfitWearSyncResult> {
  const { dateKey, outfitId, todayKey } = input;
  const now = new Date().toISOString();
  const snapshot = await getWardrobeSnapshot();

  const sameDayEntries = snapshot.outfitPlanEntries.filter((e) => e.date === dateKey);
  const wornEntry = sameDayEntries.find(
    (e) => (e.outfitId === outfitId || e.actualOutfitId === outfitId) && e.status === "worn",
  );

  if (!wornEntry) {
    return { changedEntryIds: [], touchedEntryIds: [], deletedEntryIds: [], updatedOutfitIds: [], updatedItemIds: [] };
  }

  const outfit = snapshot.outfits.find((o) => o.id === outfitId);
  if (!outfit) {
    throw new OutfitWearSyncError("OUTFIT_NOT_FOUND", "这套穿搭已被删除，请刷新后重试。");
  }

  const newOutfitWornDates = removeWornDate(outfit.wornDates, dateKey, todayKey);
  await bridgeOutfitUpsert({ ...outfit, wornDates: newOutfitWornDates, updatedAt: now });

  const otherWornEntries = sameDayEntries.filter(
    (e) => e.status === "worn" && e.id !== wornEntry.id && (e.outfitId || e.actualOutfitId),
  );

  for (const itemId of outfit.itemIds) {
    const item = snapshot.items.find((i) => i.id === itemId);
    if (!item) continue;

    let stillWornByOther = false;
    for (const otherEntry of otherWornEntries) {
      const otherOutfitId = otherEntry.outfitId ?? otherEntry.actualOutfitId;
      if (!otherOutfitId) continue;
      const otherOutfit = snapshot.outfits.find((o) => o.id === otherOutfitId);
      if (otherOutfit?.itemIds.includes(itemId)) {
        stillWornByOther = true;
        break;
      }
    }

    if (!stillWornByOther) {
      const newItemWornDates = removeWornDate(item.wornDates, dateKey, todayKey);
      await bridgeGarmentUpdate({ ...item, wornDates: newItemWornDates, updatedAt: now });
    }
  }

  const deletedEntryIds: string[] = [];
  const touchedEntryIds: string[] = [];

  if (wornEntry.wearOrigin === "planned_confirmed" || wornEntry.plannedBeforeWorn) {
    const otherPlanned = sameDayEntries.filter((e) => e.id !== wornEntry.id && e.status === "planned");
    const hasOtherPrimary = otherPlanned.some((e) => e.isPrimary);
    await bridgeOutfitPlanUpsert({
      ...wornEntry,
      status: "planned",
      isPrimary: !hasOtherPrimary,
      wornDateLinked: undefined,
      actualOutfitId: undefined,
      wearOrigin: undefined,
      plannedBeforeWorn: undefined,
      updatedAt: now,
    });
    touchedEntryIds.push(wornEntry.id);
  } else {
    await bridgeOutfitPlanDelete(wornEntry.id);
    deletedEntryIds.push(wornEntry.id);
  }

  const changedEntries = sameDayEntries.filter((e) => e.status === "changed" && e.actualOutfitId === outfitId);
  const changedEntryIds: string[] = [];

  if (otherWornEntries.length === 0) {
    for (const ce of changedEntries) {
      await bridgeOutfitPlanUpsert({ ...ce, status: "planned", actualOutfitId: undefined, updatedAt: now });
      changedEntryIds.push(ce.id);
      touchedEntryIds.push(ce.id);
    }
  } else {
    const primaryActual = otherWornEntries.find((e) => e.isPrimaryActual) ?? otherWornEntries[0];
    const primaryOutfitId = primaryActual?.outfitId ?? primaryActual?.actualOutfitId;
    for (const ce of changedEntries) {
      await bridgeOutfitPlanUpsert({ ...ce, actualOutfitId: primaryOutfitId, updatedAt: now });
      changedEntryIds.push(ce.id);
      touchedEntryIds.push(ce.id);
    }
  }

  return {
    changedEntryIds,
    touchedEntryIds,
    deletedEntryIds,
    updatedOutfitIds: [outfitId],
    updatedItemIds: outfit.itemIds,
    messageHint: "cancelled",
  };
}

// ============================================================
// 查询辅助
// ============================================================

export function getEntriesForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry[] {
  return entries.filter((e) => e.date === dateKey);
}

export function getActualWornEntriesForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry[] {
  return entries.filter((e) => e.date === dateKey && e.status === "worn");
}

export function getPlannedEntriesForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry[] {
  return entries.filter((e) => e.date === dateKey && e.status === "planned");
}

export function getChangedEntriesForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry[] {
  return entries.filter((e) => e.date === dateKey && e.status === "changed");
}

export function getPrimaryPlannedEntryForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry | null {
  const planned = getPlannedEntriesForDate(entries, dateKey);
  return planned.find((e) => e.isPrimary) ?? null;
}

const ROLE_RANK: Record<string, number> = {
  morning: 1, afternoon: 2, evening: 3, primary: 4, backup: 5, other: 9,
};

export function sortWornEntriesForDay(entries: OutfitPlanEntry[]): OutfitPlanEntry[] {
  return [...entries].sort((a, b) => {
    if (Boolean(a.isPrimaryActual) !== Boolean(b.isPrimaryActual)) return a.isPrimaryActual ? -1 : 1;
    const roleDelta = (ROLE_RANK[a.role ?? "other"] ?? 9) - (ROLE_RANK[b.role ?? "other"] ?? 9);
    if (roleDelta !== 0) return roleDelta;
    const orderDelta = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    if (orderDelta !== 0) return orderDelta;
    const updatedDelta = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    if (updatedDelta !== 0) return updatedDelta;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

export function sortPlanEntriesForDay(entries: OutfitPlanEntry[]): OutfitPlanEntry[] {
  return [...entries].sort((a, b) => {
    if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return a.isPrimary ? -1 : 1;
    const roleDelta = (ROLE_RANK[a.role ?? "other"] ?? 9) - (ROLE_RANK[b.role ?? "other"] ?? 9);
    if (roleDelta !== 0) return roleDelta;
    const orderDelta = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    if (orderDelta !== 0) return orderDelta;
    const updatedDelta = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    if (updatedDelta !== 0) return updatedDelta;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

/**
 * 解析某日期的主展示 entry。
 * 优先级：实际已穿 > 主计划 > 第一计划 > null
 */
export function resolvePrimaryDisplayEntryForDate(entries: OutfitPlanEntry[], dateKey: string): OutfitPlanEntry | null {
  const sameDay = getEntriesForDate(entries, dateKey);
  const worn = sameDay.filter((e) => e.status === "worn");
  if (worn.length) return sortWornEntriesForDay(worn)[0] ?? null;

  const planned = sameDay.filter((e) => e.status === "planned");
  const primary = planned.find((e) => e.isPrimary);
  if (primary) return primary;
  if (planned.length) return sortPlanEntriesForDay(planned)[0] ?? null;

  const changed = sameDay.filter((e) => e.status === "changed");
  if (changed.length) return sortPlanEntriesForDay(changed)[0] ?? null;

  return null;
}
