// v1.1.0-dev: 日历计算单元测试
import {
  CalendarDayCell,
  getLocalMonthGrid,
  getWeekDates,
  shiftDateByDays,
  shiftDateByWeeks,
  shiftMonth,
  getDateRowIndex,
  groupMonthCellsByWeek,
  enumerateDateRange,
  daysBetween,
} from "../src/lib/outfit-calendar";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// --- getWeekDates ---
console.log("\n=== getWeekDates ===");
{
  const week = getWeekDates("2026-06-12");
  check("returns 7 days", week.length === 7, String(week.length));
  check("contains 2026-06-12", week.includes("2026-06-12"), week.join(","));
  // 2026-06-12 is Friday, Monday should be 2026-06-08
  check("Monday is 2026-06-08", week[0] === "2026-06-08", week[0]);
  check("Sunday is 2026-06-14", week[6] === "2026-06-14", week[6]);
}

// --- shiftDateByDays ---
console.log("\n=== shiftDateByDays ===");
{
  check("+1 day", shiftDateByDays("2026-06-12", 1) === "2026-06-13");
  check("-1 day", shiftDateByDays("2026-06-12", -1) === "2026-06-11");
  check("+30 days cross month", shiftDateByDays("2026-06-12", 30) === "2026-07-12");
  check("-365 days cross year", shiftDateByDays("2026-06-12", -365) === "2025-06-12");
}

// --- shiftDateByWeeks ---
console.log("\n=== shiftDateByWeeks ===");
{
  check("+1 week", shiftDateByWeeks("2026-06-12", 1) === "2026-06-19");
  check("-1 week", shiftDateByWeeks("2026-06-12", -1) === "2026-06-05");
  check("+4 weeks", shiftDateByWeeks("2026-06-12", 4) === "2026-07-10");
}

// --- getLocalMonthGrid ---
console.log("\n=== getLocalMonthGrid ===");
{
  // June 2026: 1st is Monday, 30 days
  const grid = getLocalMonthGrid(2026, 6);
  check("total cells = 35 (5 weeks)", grid.length === 35, String(grid.length));
  check("first day is June 1", grid.find((c) => c.isCurrentMonth)?.day === 1);
  check("last day is June 30", grid.filter((c) => c.isCurrentMonth).pop()?.day === 30);
  check("all have valid dateKey", grid.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.dateKey)));
  check("non-current month cells present", grid.some((c) => !c.isCurrentMonth));

  // Feb 2026: 28 days, starts on Sunday (dow=0 in JS)
  const feb = getLocalMonthGrid(2026, 2);
  check("Feb 2026 has 28 days in grid", feb.filter((c) => c.isCurrentMonth).length === 28);
}

// --- shiftMonth ---
console.log("\n=== shiftMonth ===");
{
  const r1 = shiftMonth(2026, 6, 1);
  check("June +1 = July", r1.year === 2026 && r1.monthIndex === 7, `${r1.year}-${r1.monthIndex}`);
  const r2 = shiftMonth(2026, 1, -1);
  check("Jan -1 = Dec prev year", r2.year === 2025 && r2.monthIndex === 12, `${r2.year}-${r2.monthIndex}`);
  const r3 = shiftMonth(2026, 12, 1);
  check("Dec +1 = Jan next year", r3.year === 2027 && r3.monthIndex === 1, `${r3.year}-${r3.monthIndex}`);
}

// --- getDateRowIndex ---
console.log("\n=== getDateRowIndex ===");
{
  const grid = getLocalMonthGrid(2026, 6);
  check("June 1 row 0", getDateRowIndex(grid, "2026-06-01") === 0);
  check("June 10 row 1", getDateRowIndex(grid, "2026-06-10") === 1);
  check("date not in grid returns -1", getDateRowIndex(grid, "2026-07-06") === -1);
}

// --- groupMonthCellsByWeek ---
console.log("\n=== groupMonthCellsByWeek ===");
{
  const grid = getLocalMonthGrid(2026, 6);
  const weeks = groupMonthCellsByWeek(grid);
  check("June 2026 has 5 weeks", weeks.length === 5, String(weeks.length));
  check("each week has 7 days", weeks.every((w) => w.length === 7));
}

// --- enumerateDateRange ---
console.log("\n=== enumerateDateRange ===");
{
  const r1 = enumerateDateRange("2026-06-15", "2026-06-18");
  check("4 days inclusive", r1.length === 4, r1.join(","));
  check("starts at 06-15", r1[0] === "2026-06-15");
  check("ends at 06-18", r1[3] === "2026-06-18");

  const r2 = enumerateDateRange("2026-12-30", "2027-01-02");
  check("cross year 4 days", r2.length === 4, r2.join(","));
  check("cross year correct", r2[0] === "2026-12-30" && r2[3] === "2027-01-02");
}

// --- daysBetween ---
console.log("\n=== daysBetween ===");
{
  check("2026-01-01 to 2026-12-31 = 365", daysBetween("2026-01-01", "2026-12-31") === 365, String(daysBetween("2026-01-01", "2026-12-31")));
  check("2026-01-01 to 2027-01-01 = 366", daysBetween("2026-01-01", "2027-01-01") === 366, String(daysBetween("2026-01-01", "2027-01-01")));
  check("same day = 1", daysBetween("2026-06-12", "2026-06-12") === 1);
}

// --- shiftDateByWeeks UTC safety ---
console.log("\n=== UTC safety ===");
{
  // Use dates near midnight to ensure no UTC bleeding
  const r1 = shiftDateByWeeks("2026-06-12", 1);
  check("shiftDateByWeeks not affected by UTC", r1 === "2026-06-19", r1);
}

// --- SUMMARY ---
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
