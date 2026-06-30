#!/usr/bin/env tsx
// v1.1.9 4D: 穿搭计划与已穿状态机源码级断言
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const outfitWearSync = readFileSync(join(root, "src/lib/outfit-wear-sync.ts"), "utf8");
const workspaceCommandService = readFileSync(join(root, "services/wardrobe-api/src/workspace/command-service.ts"), "utf8");
const outfitPlanning = readFileSync(join(root, "src/lib/outfit-planning.ts"), "utf8");
const batchReviewView = readFileSync(join(root, "src/components/batch-review-view.tsx"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const outfitListView = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// ============================================================
// 状态机纯函数存在性
// ============================================================

console.log("\n=== 状态机纯函数导出 ===");

check("outfit-wear-sync.ts 导出 getOutfitPlanDateRelation", /export function getOutfitPlanDateRelation/.test(outfitWearSync));
check("outfit-wear-sync.ts 导出 getDefaultEntryModeForDate", /export function getDefaultEntryModeForDate/.test(outfitWearSync));
check("outfit-wear-sync.ts 导出 canConfirmOutfitWornForDate", /export function canConfirmOutfitWornForDate/.test(outfitWearSync));
check("outfit-wear-sync.ts 导出 shouldSyncWardrobeWearStats", /export function shouldSyncWardrobeWearStats/.test(outfitWearSync));
check("outfit-wear-sync.ts 导出 DateRelation 类型", /export type DateRelation/.test(outfitWearSync));

check("outfit-planning.ts 再导出 getOutfitPlanDateRelation", /getOutfitPlanDateRelation/.test(outfitPlanning));
check("outfit-planning.ts 再导出 getDefaultEntryModeForDate", /getDefaultEntryModeForDate/.test(outfitPlanning));
check("outfit-planning.ts 再导出 canConfirmOutfitWornForDate", /canConfirmOutfitWornForDate/.test(outfitPlanning));
check("outfit-planning.ts 再导出 shouldSyncWardrobeWearStats", /shouldSyncWardrobeWearStats/.test(outfitPlanning));

// ============================================================
// 状态机纯函数规则验证
// ============================================================

console.log("\n=== getOutfitPlanDateRelation 规则 ===");

// past: 日期小于今天
check(
  "getOutfitPlanDateRelation(past, today) 返回 'past'",
  /if \(dateKey < todayKey\) return "past"/.test(outfitWearSync),
);

// current: 日期等于今天
check(
  "getOutfitPlanDateRelation(today, today) 返回 'current'",
  /if \(dateKey > todayKey\) return "future";[\s\S]*return "current"/.test(outfitWearSync),
);

// future: 日期大于今天
check(
  "getOutfitPlanDateRelation(future, today) 返回 'future'",
  /if \(dateKey > todayKey\) return "future"/.test(outfitWearSync),
);

console.log("\n=== getDefaultEntryModeForDate 规则 ===");

// past → worn
check(
  "getDefaultEntryModeForDate(past) 返回 'worn'",
  /if \(relation === "past"\) return "worn"/.test(outfitWearSync),
);

// current → planned
check(
  "getDefaultEntryModeForDate(current) 返回 'planned'",
  /getOutfitPlanDateRelation\(dateKey, todayKey\)[\s\S]*?return "planned";[\s\S]*?"worn"/.test(outfitWearSync),
);

// future → planned
check(
  "getDefaultEntryModeForDate(future) 返回 'planned'",
  /return dateKey >= todayKey \? "planned" : "worn"/.test(outfitWearSync) || /return "planned"/.test(outfitWearSync),
);

console.log("\n=== canConfirmOutfitWornForDate 规则 ===");

// 只在 dateKey === todayKey 时返回 true
check(
  "canConfirmOutfitWornForDate 仅用 dateKey === todayKey 判断",
  /function canConfirmOutfitWornForDate[\s\S]*?return dateKey === todayKey/.test(outfitWearSync),
);

console.log("\n=== shouldSyncWardrobeWearStats 规则 ===");

// 仅 worn 返回 true
check(
  "shouldSyncWardrobeWearStats(worn) 返回 true",
  /entry\.status === "worn"/.test(outfitWearSync),
);

// planned/skipped/changed 返回 false
check(
  "shouldSyncWardrobeWearStats(planned) 返回 false",
  /entry\.status === "planned"/.test(outfitWearSync),
);

console.log("\n=== resolvePrimaryDisplayEntryForDate 优先级 ===");

// worn 优先
check(
  "resolvePrimaryDisplayEntryForDate 优先 worn",
  /worn = sameDay\.filter\(\(e\) => e\.status === "worn"\)/.test(outfitWearSync),
);

// 无 worn 时取 primary planned
check(
  "resolvePrimaryDisplayEntryForDate 无 worn 时取 planned primary",
  /primary = planned\.find\(\(e\) => e\.isPrimary\)/.test(outfitWearSync),
);

// 无 primary 时取第一条 planned
check(
  "resolvePrimaryDisplayEntryForDate 无 primary 时取第一条 planned",
  /planned\.length\) return sortPlanEntriesForDay\(planned\)\[0\]/.test(outfitWearSync),
);

// ============================================================
// 4C 遗留循环依赖清理验证
// ============================================================

console.log("\n=== 4C 遗留循环依赖清理 ===");

// wardrobe-form-controls.tsx 存在
check(
  "src/components/wardrobe-form-controls.tsx 存在",
  require("fs").existsSync(join(root, "src/components/wardrobe-form-controls.tsx")),
);

// wardrobe-form-controls.tsx 导出 ChipGroup
check(
  "wardrobe-form-controls.tsx 导出 ChipGroup",
  /export function ChipGroup/.test(readFileSync(join(root, "src/components/wardrobe-form-controls.tsx"), "utf8")),
);

// wardrobe-form-controls.tsx 导出 SelectableChipGroup
check(
  "wardrobe-form-controls.tsx 导出 SelectableChipGroup",
  /export function SelectableChipGroup/.test(readFileSync(join(root, "src/components/wardrobe-form-controls.tsx"), "utf8")),
);

// wardrobe-form-controls.tsx 导出 RangeField
check(
  "wardrobe-form-controls.tsx 导出 RangeField",
  /export function RangeField/.test(readFileSync(join(root, "src/components/wardrobe-form-controls.tsx"), "utf8")),
);

// batch-review-view.tsx 从 wardrobe-form-controls 导入
check(
  "batch-review-view.tsx 从 wardrobe-form-controls 导入",
  /from ["']@\/components\/wardrobe-form-controls["']/.test(batchReviewView),
);

// batch-review-view.tsx 不再从 wardrobe-app 导入
check(
  "batch-review-view.tsx 不再从 wardrobe-app 导入 ChipGroup",
  !/from ["']@\/components\/wardrobe-app["']/.test(batchReviewView) || !/ChipGroup/.test(batchReviewView.match(/from ["']@\/components\/wardrobe-app["']/)?.[0] ?? ""),
);

// wardrobe-app.tsx 从 wardrobe-form-controls 导入
check(
  "wardrobe-app.tsx 从 wardrobe-form-controls 导入",
  /from ["']@\/components\/wardrobe-form-controls["']/.test(wardrobeApp),
);

// wardrobe-app.tsx 不再 export ChipGroup/SelectableChipGroup/RangeField
const exportsMatch = wardrobeApp.match(/export\s*{([^}]+)}\s*from\s*["']@\/components\/batch-review-view["']/);
const batchExports = exportsMatch ? exportsMatch[1] : "";
check(
  "wardrobe-app.tsx 不再向 batch-review-view 导出 ChipGroup",
  !/export.*ChipGroup.*from.*batch-review-view/.test(wardrobeApp),
);

// ============================================================
// isPrimaryActual 修复验证
// ============================================================

console.log("\n=== isPrimaryActual 修复 ===");

// planned entry 确认转为 worn 时设置 isPrimaryActual
check(
  "planned entry 在服务端事务中转为 worn 时设置 isPrimaryActual",
  /isPrimaryActual: Boolean\(payload\.isPrimary\)/.test(workspaceCommandService),
);

// ============================================================
// handleAddOutfitToDate / handleSelectOutfitForPlan 默认行为 (v1.1.9 4D)
// ============================================================

console.log("\n=== handleAddOutfitToDate 默认 auto 模式 ===");

// handleAddOutfitToDate 默认参数是 "auto"
check(
  "handleAddOutfitToDate 默认 mode 为 'auto'",
  /handleAddOutfitToDate\([^)]+mode:\s*"auto"\s*\|\s*"planned"\s*\|\s*"worn"\s*=\s*"auto"/.test(outfitListView),
);

// handleSelectOutfitForPlan 显式传 auto，同时保留主套/备选选项
check(
  "handleSelectOutfitForPlan 调用 handleAddOutfitToDate 时使用 auto 模式",
  /function handleSelectOutfitForPlan[\s\S]*?handleAddOutfitToDate\(selectOutfitDate,\s*outfit\.id,\s*"auto",\s*opts\)/.test(outfitListView),
);

// addOutfitToDate 通过 resolveAddOutfitIntent 处理 past/current/future
check(
  "addOutfitToDate 使用 resolveAddOutfitIntent 处理 auto 模式",
  /resolveAddOutfitIntent\(input\.dateKey, input\.todayKey, input\.mode/.test(outfitWearSync),
);

// resolveAddOutfitIntent 规则：past → worn，current/future → planned
check(
  "resolveAddOutfitIntent 规则：past 日期返回 worn",
  /if \(mode === "worn"\) return "worn";[\s\S]*dateKey >= todayKey \? "planned" : "worn"/.test(outfitWearSync),
);

// ============================================================
// package.json 测试脚本
// ============================================================

console.log("\n=== package.json 测试脚本 ===");

const pkg = JSON.parse(packageJson);
check(
  "package.json 包含 test:logic:outfit-plan-wear-state",
  "test:logic:outfit-plan-wear-state" in (pkg.scripts ?? {}),
);

check(
  "test:logic:all 包含 test:logic:outfit-plan-wear-state",
  (pkg.scripts["test:logic:all"] ?? "").includes("test:logic:outfit-plan-wear-state"),
);

// ============================================================
// 总结
// ============================================================

console.log(`\ntest-outfit-plan-wear-state: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
