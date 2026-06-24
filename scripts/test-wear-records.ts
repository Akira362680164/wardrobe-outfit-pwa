import { getLocalDateKey, sanitizeWornDates, getWearSummary, toggleTodayWornDate } from "../src/lib/wear-records";
import { msUntilNextLocalMidnight } from "../src/lib/use-local-date-key";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

const TODAY = getLocalDateKey();
const [ty, tm, td] = TODAY.split("-").map(Number) as [number, number, number];

// --- getLocalDateKey ---
console.log("\n=== getLocalDateKey ===");
{
  const key = getLocalDateKey();
  check("YYYY-MM-DD format matches regex", /^\d{4}-\d{2}-\d{2}$/.test(key), key);
  check("Month between 01-12", parseInt(key.split("-")[1]!, 10) >= 1 && parseInt(key.split("-")[1]!, 10) <= 12);
  check("Day between 01-31", parseInt(key.split("-")[2]!, 10) >= 1 && parseInt(key.split("-")[2]!, 10) <= 31);
}

// --- sanitizeWornDates ---
console.log("\n=== sanitizeWornDates ===");
{
  const r1 = sanitizeWornDates([]);
  check("empty array → []", r1.length === 0, JSON.stringify(r1));

  const r2 = sanitizeWornDates(["2025-10-12", "2026-01-15", TODAY], TODAY);
  check("normal dates sorted", r2.join(",") === ["2025-10-12", "2026-01-15", TODAY].sort().join(","), r2.join(","));

  const r3 = sanitizeWornDates(["2026-06-10", "2026-06-10", "abc"], TODAY);
  check("duplicates removed", r3.filter((d) => d === "2026-06-10").length === 1, r3.join(","));
  check("invalid string filtered", !r3.includes("abc"), r3.join(","));

  const r4 = sanitizeWornDates(["2035-01-01", TODAY], TODAY);
  check("future date (> today) filtered", !r4.includes("2035-01-01"), r4.join(","));

  const r5 = sanitizeWornDates(["abc", "xyz", "not-a-date"], TODAY);
  check("all invalid → []", r5.length === 0, JSON.stringify(r5));

  const r6 = sanitizeWornDates(null, TODAY);
  check("null → []", r6.length === 0);

  const r7 = sanitizeWornDates(undefined, TODAY);
  check("undefined → []", r7.length === 0);

  const r8 = sanitizeWornDates("string", TODAY);
  check("string → []", r8.length === 0);

  // Date validation
  check("month=13 filtered", !sanitizeWornDates(["2026-13-01"], TODAY).includes("2026-13-01"));
  check("day=32 filtered", !sanitizeWornDates(["2026-01-32"], TODAY).includes("2026-01-32"));
  check("year=0999 filtered", !sanitizeWornDates(["0999-01-01"], TODAY).includes("0999-01-01"));
}

// --- getWearSummary ---
console.log("\n=== getWearSummary ===");
{
  const s1 = getWearSummary([], TODAY);
  check("empty → 暂无穿着记录", s1.label === "暂无穿着记录", s1.label);
  check("empty → hasToday=false", !s1.hasToday);
  check("empty → totalCount=0", s1.totalCount === 0);

  const s2 = getWearSummary([TODAY], TODAY);
  check("today → 今天 · 穿过1次", s2.label === "今天 · 穿过1次", s2.label);
  check("today → hasToday=true", s2.hasToday);
  check("today → totalCount=1", s2.totalCount === 1);

  const s3 = getWearSummary([TODAY, TODAY, TODAY], TODAY);
  check("today dupes → sanitized to 1", s3.totalCount === 1, String(s3.totalCount));

  // This year but not today
  const thisYear = `${ty}-01-15`;
  const s4 = thisYear < TODAY ? getWearSummary([thisYear], TODAY) : null;
  if (s4) {
    check("this year → 最近 label", s4.label.startsWith("最近 "), s4.label);
  }

  // Last year
  const lastYear = `${ty - 1}-10-12`;
  const s5 = getWearSummary([lastYear], TODAY);
  check("last year → 去年 label", s5.label.startsWith("去年 "), s5.label);

  // Earlier
  const earlier = "2024-09-18";
  const s6 = getWearSummary([earlier], TODAY);
  if (ty > 2024) {
    check("earlier → YYYY/MM/DD label", s6.label.startsWith("2024/09/18"), s6.label);
  }

  // Multiple dates with today
  const s7 = getWearSummary(["2025-10-12", TODAY], TODAY);
  check("multiple + today → 今天 · 穿过2次", s7.label === "今天 · 穿过2次" || s7.label.startsWith("今天"), s7.label);
}

// --- toggleTodayWornDate ---
console.log("\n=== toggleTodayWornDate ===");
{
  const r1 = toggleTodayWornDate([], TODAY);
  check("add today to empty", r1.length === 1 && r1[0] === TODAY, r1.join(","));

  const r2 = toggleTodayWornDate([TODAY], TODAY);
  check("remove today from [today]", r2.length === 0, r2.join(","));

  const r3 = toggleTodayWornDate(["2025-10-12", TODAY], TODAY);
  check("remove today keeping history", r3.join(",") === "2025-10-12", r3.join(","));

  const r4 = toggleTodayWornDate(["2025-10-12"], TODAY);
  check("add today to history", r4.length === 2 && r4.includes(TODAY), r4.join(","));
  check("add today sorted", r4[0] === "2025-10-12" && r4[1] === TODAY, r4.join(","));

  // toggle on unclean input
  const dirty = ["2026-06-10", "2026-06-10", "abc", TODAY];
  const r5 = toggleTodayWornDate(dirty, TODAY);
  check("toggle dirty input handles dupes + invalid", r5.length <= 2, r5.join(","));
}

// --- cross-day tests (fixed todayKeys) ---
console.log("\n=== cross-day fixed todayKeys ===");
{
  // getWearSummary with explicit todayKey
  const s1 = getWearSummary(["2026-06-11"], "2026-06-11");
  check("getWearSummary([2026-06-11], 2026-06-11) → hasToday=true", s1.hasToday === true, String(s1.hasToday));
  check("getWearSummary([2026-06-11], 2026-06-11) → label 包含今天", s1.label.includes("今天"), s1.label);

  const s2 = getWearSummary(["2026-06-11"], "2026-06-12");
  check("getWearSummary([2026-06-11], 2026-06-12) → hasToday=false", s2.hasToday === false, String(s2.hasToday));
  check("getWearSummary([2026-06-11], 2026-06-12) → label 不含今天", !s2.label.includes("今天"), s2.label);

  // toggleTodayWornDate: add next day
  const r1 = toggleTodayWornDate(["2026-06-11"], "2026-06-12");
  check("toggleTodayWornDate([2026-06-11], 2026-06-12) → 包含两天", r1.length === 2 && r1.includes("2026-06-11") && r1.includes("2026-06-12"), r1.join(","));

  // toggleTodayWornDate: remove same day
  const r2 = toggleTodayWornDate(["2026-06-12"], "2026-06-12");
  check("toggleTodayWornDate([2026-06-12], 2026-06-12) → 删除当天", r2.length === 0, r2.join(","));

  // toggleTodayWornDate: add today to multi-date list
  const r3 = toggleTodayWornDate(["2026-06-10", "2026-06-11"], "2026-06-12");
  check("toggleTodayWornDate([2026-06-10, 2026-06-11], 2026-06-12) → 三天", r3.length === 3 && r3.includes("2026-06-12"), r3.join(","));
}

// --- msUntilNextLocalMidnight ---
console.log("\n=== msUntilNextLocalMidnight ===");
{
  // Midnight of today → should be positive and less than 24h
  const now = new Date();
  const ms = msUntilNextLocalMidnight(now);
  check("msUntilNextLocalMidnight(now) > 0", ms > 0, String(ms));
  check("msUntilNextLocalMidnight(now) < 86400000", ms < 86400000, String(ms));

  // At 23:59:59, should be ~1000ms (for a typical day)
  const late = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0);
  const msLate = msUntilNextLocalMidnight(late);
  check("msUntilNextLocalMidnight(23:59:59) ≈ 1000", msLate <= 2000 && msLate >= 0, String(msLate));

  // At 00:00:00, should be ~86400000
  const early = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const msEarly = msUntilNextLocalMidnight(early);
  check("msUntilNextLocalMidnight(00:00:00) ≈ 86400000", msEarly >= 86399000 && msEarly <= 86401000, String(msEarly));

  // Static test with fixed time
  const fixed = new Date("2026-06-12T12:00:00");
  const msFixed = msUntilNextLocalMidnight(fixed);
  const expectedMs = 12 * 60 * 60 * 1000; // 12h until midnight
  check("msUntilNextLocalMidnight(2026-06-12T12:00) → 12h", msFixed === expectedMs, `expected ${expectedMs}, got ${msFixed}`);
}

// --- SUMMARY ---
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
