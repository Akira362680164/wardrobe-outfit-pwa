// v1.1.31 patch5 — 验收修复回归测试
// 1) isFailedDraftManualRecoveryComplete 不再被自身 blocking issue 短路
// 2) CategorySubcategoryPicker 点击当前分类也调用 onCategoryChange
// 3) 无 Key 路径不返回默认 recognized 草稿
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isFailedDraftManualRecoveryComplete,
  buildFailedRecognitionDraft,
  markFieldAsUser,
} from "../src/lib/intake-recognition-retry";
import { calculateDraftReviewSummary, createIntakeField } from "../src/lib/intake-draft";
import type { ColorInfo, GarmentCategory } from "../src/lib/types";

const root = join(__dirname, "..");
const retryLib = readFileSync(join(root, "src/lib/intake-recognition-retry.ts"), "utf8");
const categoryPicker = readFileSync(join(root, "src/components/category-subcategory-picker.tsx"), "utf8");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const deviceMinimax = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// ---------- P0-1 函数级测试 ----------
const baseFailed = buildFailedRecognitionDraft({
  imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  sourceImageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  cropBox: { x: 0, y: 0, width: 100, height: 100 },
  thumbnailDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  locationId: "loc-test-1",
});

const initialSummary = calculateDraftReviewSummary(baseFailed);
check("失败草稿初始 blockingIssues = 1", initialSummary.blockingIssues === 1, `actual=${initialSummary.blockingIssues}`);
check("失败草稿初始 canSave = false", initialSummary.canSave === false);

const patched = {
  ...baseFailed,
  name: markFieldAsUser(createIntakeField("工装短裤", "user", "high", { needsReview: false })),
  category: markFieldAsUser(createIntakeField<GarmentCategory>("pants", "user", "high", { needsReview: false })),
  colors: markFieldAsUser(createIntakeField<ColorInfo>({ mode: "single", primary: "棕" }, "user", "high", { needsReview: false })),
};

const recovered = isFailedDraftManualRecoveryComplete(patched);
check("补全后 isFailedDraftManualRecoveryComplete = true（patch5 修复）", recovered === true);

const finalDraft = {
  ...patched,
  processingIssues: patched.processingIssues.filter(
    (issue: { code: string }) => issue.code !== "ai_recognition_failed",
  ),
};
const finalSummary = calculateDraftReviewSummary(finalDraft);
check("删除 blocking issue 后 canSave = true（验收 P0-1）", finalSummary.canSave === true, `actual canSave=${finalSummary.canSave}`);
check("删除 blocking issue 后 blockingIssues = 0", finalSummary.blockingIssues === 0);

const noName = isFailedDraftManualRecoveryComplete({ ...patched, name: markFieldAsUser(createIntakeField("   ", "user", "high", { needsReview: false })) });
check("name 空白时恢复门禁 false", noName === false);
const noCategoryUser = isFailedDraftManualRecoveryComplete({ ...patched, category: { ...patched.category, source: "default" as const } });
check("category.source !== 'user' 时恢复门禁 false", noCategoryUser === false);
const noColor = isFailedDraftManualRecoveryComplete({ ...patched, colors: markFieldAsUser(createIntakeField<ColorInfo>({ mode: "single", primary: "" }, "user", "high", { needsReview: false })) });
check("colors.primary 为空时恢复门禁 false", noColor === false);

const fnMatch = retryLib.match(/export function isFailedDraftManualRecoveryComplete\([\s\S]*?\n\}/);
check("isFailedDraftManualRecoveryComplete 函数体存在", !!fnMatch);
const fnBody = fnMatch ? fnMatch[0] : "";
check("isFailedDraftManualRecoveryComplete 不再导入 calculateDraftReviewSummary（patch5）", !/import\s*\{[^}]*calculateDraftReviewSummary/.test(retryLib));
check("isFailedDraftManualRecoveryComplete 不再判 summary.blockingIssues（patch5）", !/summary\.blockingIssues/.test(fnBody));
check("isFailedDraftManualRecoveryComplete 仍校验 name.trim", /draft\.name\.value\.trim\(\)/.test(fnBody));
check("isFailedDraftManualRecoveryComplete 仍校验 category.source === 'user'", /draft\.category\.source\s*!==\s*"user"/.test(fnBody));
check("isFailedDraftManualRecoveryComplete 仍校验 colors.primary", /draft\.colors\.value/.test(fnBody));

// ---------- P0-2 源码级断言 ----------
check("CategorySubcategoryPicker 不再有 if (g.id === category) return", !/if\s*\(\s*g\.id\s*===\s*category\s*\)\s*return/.test(categoryPicker));
check("CategorySubcategoryPicker onCategoryChange 总被调用", /onClick=\{\(\) => \{[\s\S]*?onCategoryChange\(g\.id as GarmentCategory\)/.test(categoryPicker));
check("CategorySubcategoryPicker 旧 return 守卫消失", !/\{\s*if\s*\(\s*g\.id\s*===\s*category\s*\)\s*return;?\s*\}/.test(categoryPicker));

// ---------- P0-3 源码级断言 ----------
const procFnMatch = wardrobeApp.match(/async function processGarmentIntakeImage\([\s\S]*?\n  \}/);
check("processGarmentIntakeImage 函数体存在", !!procFnMatch);
const procFnStart = wardrobeApp.indexOf("async function processGarmentIntakeImage");
const procFnEnd = wardrobeApp.indexOf("async function saveBatchGarmentIntakeDrafts", procFnStart);
const procFnBody = procFnStart >= 0 && procFnEnd > procFnStart ? wardrobeApp.slice(procFnStart, procFnEnd) : (procFnMatch ? procFnMatch[0] : "");
check("processGarmentIntakeImage 不再有 hasDeviceMiniMaxKey 短路（patch5）", !/!hasDeviceMiniMaxKey\(miniMaxSettings\)/.test(procFnBody));
check("processGarmentIntakeImage 无条件走 recognizeSingleItemFromDataUrl", /recognizeSingleItemFromDataUrl\(/.test(procFnBody));

const recFnMatch = garmentIntake.match(/async function recognizeImageItem\([\s\S]*?\n  \}/);
check("recognizeImageItem 函数体存在", !!recFnMatch);
const recFnStart = garmentIntake.indexOf("async function recognizeImageItem");
const recFnEnd = garmentIntake.indexOf("async function handleRetryCurrentItem", recFnStart);
const recFnBody = recFnStart >= 0 && recFnEnd > recFnStart ? garmentIntake.slice(recFnStart, recFnEnd) : (recFnMatch ? recFnMatch[0] : "");
check("recognizeImageItem 无 aiTag 时抛 GarmentRecognitionError('not_configured')（patch5）", /!aiTag[\s\S]{0,500}throw new GarmentRecognitionError\([\s\S]{0,200}"not_configured"/.test(recFnBody));
check("recognizeImageItem 不再走 '...(aiTag ? ... : {})' 三元", !/\.\.\.\(aiTag\s*\?\s*mapAiTagToGarmentDraftInput/.test(recFnBody));
check("device-minimax recognizeSingleItemFromDataUrl 无 Key 抛 not_configured", /hasDeviceMiniMaxKey\(settings\)[\s\S]{0,200}throw new GarmentRecognitionError\([\s\S]{0,200}"not_configured"/.test(deviceMinimax));
check("garment-intake-flow 引入 GarmentRecognitionError", /import\s*\{[^}]*GarmentRecognitionError[^}]*\}\s*from\s*"@\/lib\/device-minimax"/.test(garmentIntake));

check("processAllImagesForRecognition catch 写失败草稿", /catch\s*\(err\)[\s\S]{0,500}buildFailedRecognitionDraft/.test(garmentIntake));
check("handleRetryCurrentItem catch 保留草稿（不退化为 garment）", /catch\s*\(err\)[\s\S]{0,500}保留现有草稿/.test(garmentIntake));
check("handleRetryCurrentItem catch 对已识别项保留 recognized 状态", /item\.status === "recognized" \? "recognized" as const : "failed" as const/.test(garmentIntake));

console.log(`\nintake upgrade patch5 tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
