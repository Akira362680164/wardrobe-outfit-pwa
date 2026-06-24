// v1.1.0-dev 穿搭计划: 日历计算纯函数

export interface CalendarDayCell {
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  weekIndex: number;
}

function parseYMD(dateKey: string): [number, number, number] {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  return [y, m, d];
}

function ymdKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function getLocalMonthGrid(year: number, monthIndex: number): CalendarDayCell[] {
  const todayKey = getLocalDateKey();
  const firstDay = new Date(year, monthIndex - 1, 1);
  const dow = firstDay.getDay();
  const startDow = dow === 0 ? 6 : dow - 1; // Monday = 0
  const days = daysInMonth(year, monthIndex);
  const cells: CalendarDayCell[] = [];

  // Prev month padding
  const prevDays = daysInMonth(year, monthIndex - 1);
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    const dateKey = ymdKey(year, monthIndex - 1, d);
    cells.push({ dateKey, day: d, isCurrentMonth: false, isToday: dateKey === todayKey, weekIndex: Math.floor(cells.length / 7) });
  }

  // Current month
  for (let d = 1; d <= days; d++) {
    const dateKey = ymdKey(year, monthIndex, d);
    cells.push({ dateKey, day: d, isCurrentMonth: true, isToday: dateKey === todayKey, weekIndex: Math.floor(cells.length / 7) });
  }

  // Next month padding
  let nd = 1;
  while (cells.length % 7 !== 0) {
    const dateKey = ymdKey(year, monthIndex + 1, nd);
    cells.push({ dateKey, day: nd, isCurrentMonth: false, isToday: dateKey === todayKey, weekIndex: Math.floor(cells.length / 7) });
    nd++;
  }

  return cells;
}

import { getLocalDateKey } from "@/lib/wear-records";

export function getWeekDates(anchorDate: string): string[] {
  const [y, m, d] = parseYMD(anchorDate);
  const jsDate = new Date(y, m - 1, d);
  const dow = jsDate.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(y, m - 1, d + mondayOffset);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    dates.push(ymdKey(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return dates;
}

export function shiftDateByDays(dateKey: string, days: number): string {
  const [y, m, d] = parseYMD(dateKey);
  const js = new Date(y, m - 1, d + days);
  return ymdKey(js.getFullYear(), js.getMonth() + 1, js.getDate());
}

export function shiftDateByWeeks(dateKey: string, weeks: number): string {
  const [y, m, d] = parseYMD(dateKey);
  const js = new Date(y, m - 1, d + weeks * 7);
  return ymdKey(js.getFullYear(), js.getMonth() + 1, js.getDate());
}

export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  let nm = monthIndex + delta;
  let ny = year;
  while (nm < 1) { nm += 12; ny--; }
  while (nm > 12) { nm -= 12; ny++; }
  return { year: ny, monthIndex: nm };
}

export function getDateRowIndex(monthCells: CalendarDayCell[], dateKey: string): number {
  const idx = monthCells.findIndex((c) => c.dateKey === dateKey);
  if (idx < 0) return -1;
  return Math.floor(idx / 7);
}

export function groupMonthCellsByWeek(monthCells: CalendarDayCell[]): CalendarDayCell[][] {
  const groups: CalendarDayCell[][] = [];
  for (let i = 0; i < monthCells.length; i += 7) {
    groups.push(monthCells.slice(i, i + 7));
  }
  return groups;
}

export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    result.push(current);
    current = shiftDateByDays(current, 1);
  }
  return result;
}

export function daysBetween(startDate: string, endDate: string): number {
  return enumerateDateRange(startDate, endDate).length;
}
