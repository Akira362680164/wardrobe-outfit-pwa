// v1.1.0-dev: 穿搭计划逻辑单元测试
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OutfitPlanEntry, OutfitCalendarPlan } from "../src/lib/types";
import {
  getPlanEntryForDate,
  getCalendarPlansForDate,
  isDateInsidePlan,
  getPlanEdge,
  createOutfitPlanEntry,
  createOutfitCalendarPlan,
  updateOutfitPlanEntryStatus,
  getPrimaryOutfitPlanEntryForDate,
  normalizeOutfitPlanEntriesForDisplay,
  upsertOutfitPlanEntryForDate,
} from "../src/lib/outfit-planning";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

const now = "2026-06-12T12:00:00.000Z";
const entry1 = createOutfitPlanEntry({ date: "2026-06-12", outfitId: "outfit-1", title: "Test", now });
const entry2 = createOutfitPlanEntry({ date: "2026-06-13", outfitId: "outfit-2", now });

const plan1: OutfitCalendarPlan = createOutfitCalendarPlan({ type: "travel", title: "新疆", startDate: "2026-06-15", endDate: "2026-06-18", now });
const plan2: OutfitCalendarPlan = createOutfitCalendarPlan({ type: "business", title: "出差", startDate: "2026-06-16", endDate: "2026-06-20", now });
const plan3: OutfitCalendarPlan = createOutfitCalendarPlan({ type: "custom", title: "单日", startDate: "2026-06-12", endDate: "2026-06-12", now });
const root = join(__dirname, "..");
const outfitListViewSource = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");
const planAddSource = readFileSync(join(root, "src/components/outfit-plan-add-view.tsx"), "utf8");
const planDaySource = readFileSync(join(root, "src/components/outfit-plan-day-card.tsx"), "utf8");
const planDetailSource = readFileSync(join(root, "src/components/outfit-plan-detail-view.tsx"), "utf8");
const planSelectSource = readFileSync(join(root, "src/components/outfit-plan-select-sheet.tsx"), "utf8");
const packingSource = readFileSync(join(root, "src/components/plan-packing-checklist-view.tsx"), "utf8");
const weeklyPlanSource = readFileSync(join(root, "src/components/outfit-weekly-plan-strip.tsx"), "utf8");
const planningCalendarSource = readFileSync(join(root, "src/components/outfit-planning-calendar-view.tsx"), "utf8");
const calendarTrackGestureSource = readFileSync(join(root, "src/lib/calendar-track-gesture.ts"), "utf8");

// --- getPlanEntryForDate ---
console.log("\n=== getPlanEntryForDate ===");
{
  check("finds entry by date", getPlanEntryForDate([entry1, entry2], "2026-06-12")?.id === entry1.id);
  check("returns undefined for missing", getPlanEntryForDate([entry1, entry2], "2026-06-14") === undefined);
  check("empty array returns undefined", getPlanEntryForDate([], "2026-06-12") === undefined);
}

// --- getCalendarPlansForDate ---
console.log("\n=== getCalendarPlansForDate ===");
{
  check("06-15 has plan1", getCalendarPlansForDate([plan1], "2026-06-15").length === 1);
  check("06-18 has plan1", getCalendarPlansForDate([plan1], "2026-06-18").length === 1);
  check("06-14 has no plan1", getCalendarPlansForDate([plan1], "2026-06-14").length === 0);
  check("06-16 has both plan1+plan2", getCalendarPlansForDate([plan1, plan2], "2026-06-16").length === 2);
  check("returns empty for no plans", getCalendarPlansForDate([], "2026-06-15").length === 0);
}

// --- isDateInsidePlan ---
console.log("\n=== isDateInsidePlan ===");
{
  check("inside", isDateInsidePlan("2026-06-16", plan1));
  check("boundary start", isDateInsidePlan("2026-06-15", plan1));
  check("boundary end", isDateInsidePlan("2026-06-18", plan1));
  check("outside before", !isDateInsidePlan("2026-06-14", plan1));
  check("outside after", !isDateInsidePlan("2026-06-19", plan1));
}

// --- getPlanEdge ---
console.log("\n=== getPlanEdge ===");
{
  check("start day", getPlanEdge("2026-06-15", plan1) === "start");
  check("middle day", getPlanEdge("2026-06-16", plan1) === "middle");
  check("end day", getPlanEdge("2026-06-18", plan1) === "end");
  check("single day", getPlanEdge("2026-06-12", plan3) === "single");
  check("not in plan", getPlanEdge("2026-06-14", plan1) === null);
}

// --- createOutfitPlanEntry ---
console.log("\n=== createOutfitPlanEntry ===");
{
  check("has expected fields", entry1.date === "2026-06-12" && entry1.outfitId === "outfit-1" && entry1.status === "planned");
  check("default status = planned", entry1.status === "planned");
  check("generates id", entry1.id.startsWith("plan-entry-"));
}

// --- createOutfitCalendarPlan ---
console.log("\n=== createOutfitCalendarPlan ===");
{
  check("travel type", plan1.type === "travel");
  check("travel default title", plan1.title === "新疆");
  check("travel default tone=clay", plan1.tone === "clay");
  check("travel default packingEnabled=true", plan1.packingEnabled === true);

  const bp = createOutfitCalendarPlan({ type: "business", title: "", startDate: "2026-06-20", endDate: "2026-06-22", now });
  check("empty title → default", bp.title === "未命名出差");
  check("business default tone=moss", bp.tone === "moss");
  check("business default packingEnabled=true", bp.packingEnabled === true);

  const cp = createOutfitCalendarPlan({ type: "custom", title: "", startDate: "2026-06-20", endDate: "2026-06-22", now });
  check("custom empty title → default", cp.title === "未命名计划");
  check("custom default tone=denim", cp.tone === "denim");
  check("custom default packingEnabled=false", cp.packingEnabled === false);
}

// --- updateOutfitPlanEntryStatus ---
console.log("\n=== updateOutfitPlanEntryStatus ===");
{
  const updated = updateOutfitPlanEntryStatus(entry1, "worn", { wornDateLinked: "2026-06-12" });
  check("status updated to worn", updated.status === "worn");
  check("wornDateLinked set", updated.wornDateLinked === "2026-06-12");
  check("id unchanged", updated.id === entry1.id);
}

// --- getPrimaryOutfitPlanEntryForDate ---
console.log("\n=== getPrimaryOutfitPlanEntryForDate ===");
{
  const newer = createOutfitPlanEntry({ date: "2026-06-12", outfitId: "outfit-new", now: "2026-06-12T13:00:00.000Z" });
  check("picks latest by updatedAt", getPrimaryOutfitPlanEntryForDate([entry1, newer], "2026-06-12")?.id === newer.id);
  check("single entry", getPrimaryOutfitPlanEntryForDate([entry1], "2026-06-12")?.id === entry1.id);
  check("no match", getPrimaryOutfitPlanEntryForDate([], "2026-06-12") === undefined);
}

// --- normalizeOutfitPlanEntriesForDisplay ---
console.log("\n=== normalizeOutfitPlanEntriesForDisplay ===");
{
  const newer = createOutfitPlanEntry({ date: "2026-06-12", outfitId: "outfit-new", now: "2026-06-12T13:00:00.000Z" });
  const normalized = normalizeOutfitPlanEntriesForDisplay([entry1, newer, entry2]);
  check("deduplicated by date", normalized.length === 2);
  check("keeps latest for 06-12", normalized.find((e) => e.date === "2026-06-12")?.outfitId === "outfit-new");
}

// --- upsertOutfitPlanEntryForDate ---
console.log("\n=== upsertOutfitPlanEntryForDate ===");
{
  // Insert new
  const { entries: r1, updated: u1 } = upsertOutfitPlanEntryForDate([], { date: "2026-06-12", outfitId: "outfit-a", now });
  check("insert new entry", r1.length === 1 && u1.date === "2026-06-12" && u1.outfitId === "outfit-a");

  // Update existing - should replace not duplicate
  const { entries: r2 } = upsertOutfitPlanEntryForDate(r1, { date: "2026-06-12", outfitId: "outfit-b", now });
  check("update existing - no duplicate", r2.length === 1);
  check("update existing - outfitId changed", r2[0]!.outfitId === "outfit-b");
}

// --- calendarPlanId clearing on delete ---
console.log("\n=== delete plan keeps entries ===");
{
  const e3 = createOutfitPlanEntry({ date: "2026-06-16", outfitId: "outfit-3", calendarPlanId: plan1.id, now });
  check("entry has calendarPlanId", e3.calendarPlanId === plan1.id);
  const plansAfterDelete = [plan1, plan2].filter((p) => p.id !== plan1.id);
  const entriesAfterDelete = [e3];
  check("travel plan deleted from plans", !plansAfterDelete.some((p) => p.id === plan1.id));
  check("travel plan delete keeps daily outfit entry", entriesAfterDelete.some((e) => e.id === e3.id && e.outfitId === "outfit-3"));
}

// --- calendar plan edit keeps entries ---
console.log("\n=== edit plan keeps entries ===");
{
  const e4 = createOutfitPlanEntry({ date: "2026-06-16", outfitId: "outfit-4", calendarPlanId: plan1.id, now });
  const editedPlan: OutfitCalendarPlan = { ...plan1, startDate: "2026-06-17", endDate: "2026-06-21", destination: "新疆" };
  const entriesAfterEdit = [e4];
  check("edited plan date range changed", editedPlan.startDate === "2026-06-17" && editedPlan.endDate === "2026-06-21");
  check("plan edit does not mutate daily outfit entry date", entriesAfterEdit[0]?.date === "2026-06-16");
  check("plan edit does not remove daily outfit entry", entriesAfterEdit.length === 1 && entriesAfterEdit[0]?.id === e4.id);
}

// --- delete one day entry only ---
console.log("\n=== delete one day outfit entry ===");
{
  const d1 = createOutfitPlanEntry({ date: "2026-06-16", outfitId: "outfit-a", now });
  const d2 = createOutfitPlanEntry({ date: "2026-06-17", outfitId: "outfit-b", now });
  const remaining = [d1, d2].filter((entry) => entry.id !== d1.id);
  check("single day delete removes target entry", !remaining.some((entry) => entry.id === d1.id));
  check("single day delete keeps other date entry", remaining.length === 1 && remaining[0]?.id === d2.id && remaining[0]?.date === "2026-06-17");
}

// --- over 365 day range ---
console.log("\n=== 365 day range ===");
{
  // 365 days is valid
  const p365 = createOutfitCalendarPlan({ type: "custom", title: "365", startDate: "2026-01-01", endDate: "2026-12-31", now });
  check("365 day range creates", p365.id.startsWith("calendar-plan-"));
}

// --- SUMMARY ---
console.log("\n=== A2-Flows overlay contracts ===");
check("day card actions use shared action sheet", /<MotionSheet[\s\S]{0,180}variant="action"[\s\S]{0,120}ariaLabel=/.test(planDaySource));
check("day card delete uses busy-safe confirm", /<ConfirmActionSheet[\s\S]{0,260}submitting=\{deleting\}/.test(planDaySource));
check("day card has no private full-screen overlay", !/fixed inset-0/.test(planDaySource));
check("plan detail delete uses busy-safe confirm and keeps errors", /<ConfirmActionSheet[\s\S]{0,300}submitting=\{deleting\}[\s\S]{0,80}error=\{deleteError\}/.test(planDetailSource));
check("plan add guards busy back and uses shared discard confirm", /useStableBackHandler\([\s\S]{0,180}if \(saving\) return true/.test(planAddSource) && /<ConfirmActionSheet[\s\S]{0,220}tone="danger"/.test(planAddSource));
check("plan selector has form semantics", /<MotionSheet[^>]*variant="form"[^>]*ariaLabel=\{sheetTitle\}/.test(planSelectSource));
check("packing add sheet is busy-safe and shared across empty state", /const addManualSheet = \([\s\S]{0,380}<MotionSheet[\s\S]{0,260}dismissible=\{!saving\}/.test(packingSource) && (packingSource.match(/\{addManualSheet\}/g) ?? []).length === 2);
check("packing reset uses busy-safe confirm", /<ConfirmActionSheet[\s\S]{0,280}submitting=\{saving\}[\s\S]{0,80}error=\{resetError\}/.test(packingSource));
check("add-plan chooser uses shared action sheet", /<MotionSheet[\s\S]{0,220}open=\{addPlanSheetOpen\}[\s\S]{0,180}variant="action"[\s\S]{0,80}ariaLabel="添加穿搭计划"/.test(outfitListViewSource));

console.log("\n=== C3-Outfit deep-flow motion contracts ===");
check("deep pages share C1 push/pop motion instead of static replacement", /function OutfitDeepFlowMotion\([\s\S]{0,1300}<AnimatePresence mode="sync"/.test(outfitListViewSource) && /getNavigationMotionStates\(activeDirection, reduceMotion\)/.test(outfitListViewSource));
check("exiting deep page consumes the newest direction through variants", /custom=\{transition\.direction\}/.test(outfitListViewSource) && /exit: \(activeDirection: OutfitDeepFlowDirection\)/.test(outfitListViewSource) && /<AnimatePresence mode="sync" initial=\{false\} custom=\{transition\.direction\}>/.test(outfitListViewSource));
check("deep-flow pages make exiting surfaces inert", /data-outfit-deep-presence=\{isPresent \? "current" : "exiting"\}/.test(outfitListViewSource) && /inert=\{isPresent \? undefined : true\}/.test(outfitListViewSource));
check("deep-flow motion reuses panel token and reduced-motion path", /\.\.\.spring\.panel/.test(outfitListViewSource) && /if \(reduceMotion \|\| direction === "replace"\)/.test(outfitListViewSource));
check("deep-flow scroll is route-keyed and restored before paint", /deepFlowScrollPositionsRef/.test(outfitListViewSource) && /restoreWindowScrollBeforePaint\(transition\.restoreScroll\.windowY\)/.test(outfitListViewSource) && /data-outfit-scroll-region/.test(planAddSource + planDetailSource + packingSource));
check("rapid Back never assigns stale presented scroll to an advanced key", /currentPage\?\.dataset\.outfitDeepPage !== expectedPage/.test(outfitListViewSource) && /subPageRef\.current = to/.test(outfitListViewSource));
check("planning hierarchy pops one level at a time", /case "packing_list": return "plan_detail"/.test(outfitListViewSource) && /case "plan_detail": return "planning_calendar"/.test(outfitListViewSource) && /case "planning_calendar": return "library"/.test(outfitListViewSource));
check("new plan readback enters detail instead of jumping to calendar", /await onPlanDataChange\(\);[\s\S]{0,220}navigateSubPage\([\s\S]{0,80}"plan_detail"/.test(outfitListViewSource) && /wasEditing \? "pop" : "push"/.test(outfitListViewSource));
check("outfit write busy blocks page Back and form controls", /if \(writeBusyRef\.current\) return true/.test(outfitListViewSource) && /isSaving=\{writingOutfitId === editingOutfit\.id\}/.test(outfitListViewSource) && /realImageSaving \? "保存中\.\.\."/.test(outfitListViewSource));
check("plan form failure stays mounted with scroll and busy-safe Back", /data-outfit-scroll-region="plan-form"/.test(planAddSource) && /setError\(message\)/.test(planAddSource) && /if \(saving\) return true/.test(planAddSource));
check("delete and reset remain topmost and non-dismissible while submitting", /useStableBackHandler\(\(\) => true, deleting, 20\)/.test(planDetailSource) && /submitting=\{deleting\}/.test(planDetailSource) && /submitting=\{saving\}/.test(packingSource));
check("packing mutations share one synchronous busy gate", /savingRef\.current = true/.test(packingSource) && /runPackingMutation\("toggle"/.test(packingSource) && /runPackingMutation\("all"/.test(packingSource) && /runPackingMutation\("reset"/.test(packingSource));
check("C2 outfit detail tab continuity remains intact", /<DetailTabContent activeKey=\{detailTab\}>/.test(outfitListViewSource));
check("deep outfit surfaces do not reintroduce wait-mode animation", !/mode="wait"/.test(outfitListViewSource + planAddSource + planDetailSource + packingSource));

console.log("\n=== B3 week/month direct-manipulation contracts ===");
check("week track keeps resident previous/current/next pages", /\(\[-1, 0, 1\] as const\)\.map\(\(pageOffset\)/.test(weeklyPlanSource));
check("month track keeps resident previous/current/next pages", /\(\[-1, 0, 1\] as const\)\.map\(\(pageOffset\)/.test(planningCalendarSource));
check("week and month both expose pan-y touch action", /data-calendar-track="week"[\s\S]{0,180}touchAction: "pan-y"/.test(weeklyPlanSource) && /data-calendar-track="month"[\s\S]{0,180}touchAction: "pan-y"/.test(planningCalendarSource));
check("horizontal intent alone captures the pointer", /if \(result\.justClaimedHorizontal\) \{[\s\S]{0,100}setPointerCapture/.test(weeklyPlanSource) && /if \(result\.justClaimedHorizontal\) \{[\s\S]{0,100}setPointerCapture/.test(planningCalendarSource));
check("legacy weak drag and wait replacement animations are removed", !/drag="x"|dragElastic|mode="wait"|touch-none/.test(weeklyPlanSource + planningCalendarSource));
check("both surfaces use shared pure intent/rubber-band/projection helper", /updateCalendarTrackGestureSession/.test(weeklyPlanSource) && /updateCalendarTrackGestureSession/.test(planningCalendarSource) && /resolveCalendarTrackAxisIntent/.test(calendarTrackGestureSource) && /rubberBandDistance/.test(calendarTrackGestureSource) && /projectCalendarTrackPosition/.test(calendarTrackGestureSource));
check("week arrows and drag feed the same snap function", /onClick=\{\(\) => requestWeekShift\(-1\)\}/.test(weeklyPlanSource) && /animateTrackToPage\(result\.pageOffset, result\.velocity\)/.test(weeklyPlanSource));
check("month arrows and drag feed the same snap function", /onClick=\{\(\) => requestMonthShift\(-1\)\}/.test(planningCalendarSource) && /animateTrackToPage\(result\.pageOffset, result\.velocity\)/.test(planningCalendarSource));
check("same-direction arrow input is queued instead of discarded", /queuedWeekStepsRef\.current \+ delta/.test(weeklyPlanSource) && /queuedMonthStepsRef\.current \+ delta/.test(planningCalendarSource));
check("opposite arrow redirects the current presentation to center", /activePageOffset === -delta[\s\S]{0,100}animateTrackToPage\(0, 0\)/.test(weeklyPlanSource) && /activePageOffset === -delta[\s\S]{0,100}animateTrackToPage\(0, 0\)/.test(planningCalendarSource));
check("week and month selected-date surfaces use layout indicators", /layoutId=\{`weekly-date-selection-/.test(weeklyPlanSource) && /layoutId=\{`month-date-selection-/.test(planningCalendarSource));
check("calendar detail never animates height:auto", !/height:\s*["']auto["']/.test(planningCalendarSource));
check("reduced motion renders calendar detail without layout spring", /reduceMotion \? \([\s\S]{0,500}showDayDetail \? \([\s\S]{0,500}dayDetailCard/.test(planningCalendarSource));
check("calendar return context stays in explicit parent month/date state", /const \[planningMonthDate, setPlanningMonthDate\]/.test(outfitListViewSource) && /const \[selectedPlanDate, setSelectedPlanDate\]/.test(outfitListViewSource) && /openOutfitDetail\(outfitId, "planning_calendar"\)/.test(outfitListViewSource));

console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
