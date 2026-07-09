export interface CalendarDayCell {
  dateKey: string;
  day: number;
  muted: boolean;
  isToday: boolean;
}

export function localDateKey(date = new Date()): string {
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

export function monthTitle(monthKey: string): string {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return `${year}年${month}月`;
}

export function getMonthRange(monthKey: string): { firstDay: string; lastDay: string } {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return {
    firstDay: ymd(year, month, 1),
    lastDay: ymd(year, month, new Date(year, month, 0).getDate()),
  };
}

export function getMonthGrid(monthKey: string, todayKey = localDateKey()): CalendarDayCell[] {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - offset);
  const cells: CalendarDayCell[] = [];
  while (cells.length < 42) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + cells.length);
    const dateKey = ymd(day.getFullYear(), day.getMonth() + 1, day.getDate());
    cells.push({
      dateKey,
      day: day.getDate(),
      muted: day.getMonth() !== month - 1,
      isToday: dateKey === todayKey,
    });
  }
  return cells;
}

export function shiftMonthKey(monthKey: string, delta: -1 | 1): string {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  const next = new Date(year, month - 1 + delta, 1);
  return ymd(next.getFullYear(), next.getMonth() + 1, 1).slice(0, 7);
}

export function formatDateLabel(dateKey: string): string {
  const { month, day } = parseDateKey(dateKey);
  return `${month}月${day}日`;
}

export function formatDateWithWeek(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${month}月${day}日 ${weekdays[new Date(year, month - 1, day).getDay()]}`;
}

export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const cursor = new Date(start.year, start.month - 1, start.day);
  const last = new Date(end.year, end.month - 1, end.day);
  while (cursor <= last) {
    result.push(ymd(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function rangeOverlaps(startDate: string, endDate: string, firstDay: string, lastDay: string): boolean {
  return startDate <= lastDay && endDate >= firstDay;
}
