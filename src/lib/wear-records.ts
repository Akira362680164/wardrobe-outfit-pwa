// src/lib/wear-records.ts
// v0.9.45-dev: 穿着记录纯逻辑函数 — 本地日期、清洗、摘要、toggle。

export interface WearSummary {
  hasToday: boolean;
  totalCount: number;
  lastDate?: string;
  label: string;
}

/** 返回本地时区的 YYYY-MM-DD 字符串 (不用 UTC 避免跨日错误) */
export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (y! < 2000 || y! > 2100) return false;
  if (m! < 1 || m! > 12) return false;
  if (d! < 1 || d! > 31) return false;
  return true;
}

/**
 * 清洗 wornDates：
 * - 只保留严格 YYYY-MM-DD
 * - 去重
 * - 过滤未来日期 (> todayKey)
 * - 升序排序
 */
export function sanitizeWornDates(raw: unknown, todayKey?: string): string[] {
  const today = todayKey ?? getLocalDateKey();
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    if (!isValidDateKey(v)) continue;
    if (v > today) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  result.sort();
  return result;
}

/** 格式化 MM/DD 给 UI 展示 */
function fmtMD(key: string): string {
  const parts = key.split("-");
  return `${parseInt(parts[1]!, 10)}/${parseInt(parts[2]!, 10)}`;
}

/**
 * 返回穿着摘要 (用于详情页顶部)。
 * todayKey 默认取本地今天。
 */
export function getWearSummary(wornDates: unknown, todayKey?: string): WearSummary {
  const today = todayKey ?? getLocalDateKey();
  const dates = sanitizeWornDates(wornDates, today);
  const totalCount = dates.length;
  const lastDate = dates.length > 0 ? dates[dates.length - 1] : undefined;
  const hasToday = lastDate === today;

  if (totalCount === 0) {
    return { hasToday: false, totalCount: 0, label: "暂无穿着记录" };
  }

  const last = lastDate!;
 // v0.9.49-dev auto-fix:之前 `ty` 是数组 `[tyNumber]`, `ly === ty`永远 false,
 // 导致所有 non-today 今年日期都掉到 "去年" 分支。显式解构出 number。
 const [ly] = last.split("-").map(Number) as [number, number];
 const [ty] = today.split("-").map(Number) as [number, number];

  if (hasToday) {
    return { hasToday: true, totalCount, lastDate: last, label: `今天 · 穿过${totalCount}次` };
  }

  if (ly === ty) {
    return { hasToday: false, totalCount, lastDate: last, label: `最近 ${fmtMD(last)} · 穿过${totalCount}次` };
  }

  if (ly === ty - 1) {
    return { hasToday: false, totalCount, lastDate: last, label: `去年 ${fmtMD(last)} · 穿过${totalCount}次` };
  }

  return { hasToday: false, totalCount, lastDate: last, label: `${last.replace(/-/g, "/")} · 穿过${totalCount}次` };
}

/**
 * Toggle 今天穿着记录：
 * - 今天不在列表 → 加入并升序排序
 * - 今天已在列表 → 删除
 * 返回新的 string[] (不修改入参)。
 */
export function toggleTodayWornDate(wornDates: unknown, todayKey?: string): string[] {
  const today = todayKey ?? getLocalDateKey();
  const dates = sanitizeWornDates(wornDates, today);
  const idx = dates.indexOf(today);
  if (idx >= 0) {
    dates.splice(idx, 1);
    return dates;
  }
  dates.push(today);
  dates.sort();
  return dates;
}

// ============================================================
// v1.1.0 fix: 穿着统计统一辅助函数
// ============================================================

/**
 * 校验 dateKey 是否合法（YYYY-MM-DD + 真实日历）。
 * 未来日期如果调用方是 recordActualOutfitWear 应抛错；计划创建不走本函数。
 */
export function assertValidWearDateKey(dateKey: string, todayKey = getLocalDateKey()): void {
  if (!isValidDateKey(dateKey)) {
    throw new Error(`无效日期格式: ${dateKey}`);
  }
  const [, m, d] = dateKey.split("-").map(Number) as [number, number, number];
   if (d > new Date(Number(dateKey.slice(0, 4)), m - 1, 0).getDate()) {
    throw new Error(`无效日期: ${dateKey}`);
  }
}

/**
 * 添加穿着日期（去重 + 排序 + 过滤未来日期）。
 * dateKey > todayKey 时抛错：未来日期不能写入实际穿着统计。
 */
export function addWornDate(wornDates: unknown, dateKey: string, todayKey?: string): string[] {
  const today = todayKey ?? getLocalDateKey();
  assertValidWearDateKey(dateKey, today);
  if (dateKey > today) throw new Error("不能把未来日期写入实际穿着统计");
  return sanitizeWornDates([...(Array.isArray(wornDates) ? wornDates : []), dateKey], today);
}

/**
 * 移除穿着日期。
 */
export function removeWornDate(wornDates: unknown, dateKey: string, todayKey?: string): string[] {
  const today = todayKey ?? getLocalDateKey();
  assertValidWearDateKey(dateKey, today);
  return sanitizeWornDates(wornDates, today).filter((d) => d !== dateKey);
}

/**
 * 检查穿着日期是否存在。
 */
export function hasWornDate(wornDates: unknown, dateKey: string, todayKey?: string): boolean {
  const today = todayKey ?? getLocalDateKey();
  assertValidWearDateKey(dateKey, today);
  return sanitizeWornDates(wornDates, today).includes(dateKey);
}
