#!/usr/bin/env tsx
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OutfitPlanEntry } from "../src/lib/types";
import {
  getDefaultEntryModeForDate,
  resolvePrimaryDisplayEntryForDate,
  shouldSyncWardrobeWearStats,
} from "../src/lib/outfit-planning";

const root = join(__dirname, "..");
const outfitListView = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");
const outfitPlanDayCard = readFileSync(join(root, "src/components/outfit-plan-day-card.tsx"), "utf8");
const outfitWearSync = readFileSync(join(root, "src/lib/outfit-wear-sync.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function entry(id: string, status: OutfitPlanEntry["status"], patch: Partial<OutfitPlanEntry> = {}): OutfitPlanEntry {
  return {
    id,
    date: "2026-06-14",
    outfitId: `outfit-${id}`,
    status,
    createdAt: `2026-06-14T0${id.length}:00:00.000Z`,
    updatedAt: `2026-06-14T0${id.length}:00:00.000Z`,
    ...patch,
  };
}

check("getDefaultEntryModeForDate(today) 返回 planned", getDefaultEntryModeForDate("2026-06-14", "2026-06-14") === "planned");
check("getDefaultEntryModeForDate(future) 返回 planned", getDefaultEntryModeForDate("2026-06-15", "2026-06-14") === "planned");
check("getDefaultEntryModeForDate(past) 返回 worn", getDefaultEntryModeForDate("2026-06-13", "2026-06-14") === "worn");

check("planned entry 不同步穿着次数", shouldSyncWardrobeWearStats(entry("planned", "planned")) === false);
check("worn entry 同步穿着次数", shouldSyncWardrobeWearStats(entry("worn", "worn")) === true);

const priorityEntries = [
  entry("changed", "changed"),
  entry("planned-first", "planned", { isPrimary: false, sortOrder: 1 }),
  entry("planned-primary", "planned", { isPrimary: true, sortOrder: 9 }),
  entry("worn", "worn", { isPrimaryActual: true }),
];
check(
  "展示优先级为 worn > planned primary > planned first > changed first",
  resolvePrimaryDisplayEntryForDate(priorityEntries, "2026-06-14")?.id === "worn",
);
check(
  "无 worn 时优先 planned primary",
  resolvePrimaryDisplayEntryForDate(priorityEntries.filter((e) => e.status !== "worn"), "2026-06-14")?.id === "planned-primary",
);
check(
  "无 primary 时优先 planned first",
  resolvePrimaryDisplayEntryForDate(priorityEntries.filter((e) => e.status !== "worn" && e.id !== "planned-primary"), "2026-06-14")?.id === "planned-first",
);
check(
  "仅 changed 时返回 changed first",
  resolvePrimaryDisplayEntryForDate(priorityEntries.filter((e) => e.status === "changed"), "2026-06-14")?.id === "changed",
);

check("今天 planned 显示今天穿了", /今天穿了/.test(outfitPlanDayCard));
check("未来日期不显示今天穿了", /!\s*isFuture[\s\S]{0,260}\{isPast \? "补记已穿" : "今天穿了"\}/.test(outfitPlanDayCard));
check("过去空状态提供补记已穿", /isPast \? "补记已穿" : "安排穿搭"/.test(outfitPlanDayCard));
check("过去有计划无套装时提供补记已穿", /isPast \? "补记已穿" : "安排套装"/.test(outfitPlanDayCard));
check("已有条目追加入口文案为添加备选穿搭", /添加备选穿搭/.test(outfitPlanDayCard));

check("handleAddOutfitToDate 默认 auto 模式", /mode:\s*"auto"\s*\|\s*"planned"\s*\|\s*"worn"\s*=\s*"auto"/.test(outfitListView));
check("handleSelectOutfitForPlan 使用被点击日期 selectOutfitDate", /handleAddOutfitToDate\(selectOutfitDate,\s*outfit\.id\)/.test(outfitListView));
check("今天添加计划 toast 为已加入今日计划", /dateKey === todayKey \? "已加入今日计划"/.test(outfitListView));
check("过去补记 toast 为已补记穿搭", /dateKey < todayKey \? "已补记穿搭"/.test(outfitListView));
check("今天穿了 toast 为已记录今天穿了", /entry\.date === todayKey \? "已记录今天穿了"/.test(outfitListView));

check("addPlannedOutfitForDate 只去重同日同套 planned", /duplicate = existingEntries\.find\(\(e\) => e\.outfitId === outfitId && e\.status === "planned"\)/.test(outfitWearSync));
check("同日第二套可追加 sortOrder", /sortOrder: sortOrder \?\? existingEntries\.length/.test(outfitWearSync));
check("第一条 planned 默认 primary", /existingEntries\.filter\(\(e\) => e\.status === "planned"\)\.length === 0/.test(outfitWearSync));

check("OutfitIntakeFlow 保存成功后回到套装列表", /async function handleSaveOutfitIntake[\s\S]*?await onRefresh\(\);[\s\S]*?setSubPage\("library"\)/.test(outfitListView));
check("OutfitIntakeFlow 保存成功后关闭 create flow", /async function handleSaveOutfitIntake[\s\S]*?onCreateClosed\?\.\(\)/.test(outfitListView));

check("package.json 包含 test:logic:outfit-calendar-state-regression", "test:logic:outfit-calendar-state-regression" in (packageJson.scripts ?? {}));
check("test:logic:all 包含 outfit-calendar-state-regression", String(packageJson.scripts?.["test:logic:all"] ?? "").includes("test:logic:outfit-calendar-state-regression"));

console.log(`\noutfit calendar state regression tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
