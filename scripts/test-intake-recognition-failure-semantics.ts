// v1.1.31 commit2 — AI 失败语义测试
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const deviceMinimax = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");
const multi = readFileSync(join(root, "src/lib/garment-intake-multi-image.ts"), "utf8");
const intakeDraft = readFileSync(join(root, "src/lib/intake-draft.ts"), "utf8");
const retryLib = readFileSync(join(root, "src/lib/intake-recognition-retry.ts"), "utf8");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

check("intake-recognition-retry.ts 存在", existsSync(join(root, "src/lib/intake-recognition-retry.ts")));
check("buildFailedRecognitionDraft 导出", /export function buildFailedRecognitionDraft/.test(retryLib));
check("isFailedDraftManualRecoveryComplete 导出", /export function isFailedDraftManualRecoveryComplete/.test(retryLib));
check("device-minimax 导出 GarmentRecognitionError", /export class GarmentRecognitionError/.test(deviceMinimax));
check("device-minimax 导出 GarmentRecognitionFailureCode", /export type GarmentRecognitionFailureCode/.test(deviceMinimax));
check("device-minimax 已删除 buildSingleItemFallback 函数", !/function buildSingleItemFallback/.test(deviceMinimax));
check("device-minimax 已删除 candidateNames: [\"garment\"]", !/candidateNames:\s*\[\s*"garment"\s*\]/.test(deviceMinimax));
check("device-minimax 已删除 const fileName = \"garment.jpg\"", !/const fileName = "garment\.jpg"/.test(deviceMinimax));
check("device-minimax 已删除 '未配置 MiniMax Key,已生成可编辑的默认标签'", !/未配置 MiniMax Key，已生成可编辑的默认标签/.test(deviceMinimax));
check("intake-draft.ts 新增 ai_recognition_failed issue code", /"ai_recognition_failed"/.test(intakeDraft));
check("multi-image 导出 getReviewableGarmentIntakeImages", /export function getReviewableGarmentIntakeImages/.test(multi));
check("multi-image 导出 getSuccessfullyRecognizedGarmentIntakeImages", /export function getSuccessfullyRecognizedGarmentIntakeImages/.test(multi));
check("multi-image 导出 setGarmentIntakeImageRecognitionFailure", /export function setGarmentIntakeImageRecognitionFailure/.test(multi));
check("multi-image getSavableGarmentIntakeImages 使用 canSave", /getSavableGarmentIntakeImages[\s\S]*?canSave/.test(multi));
check("garment-intake-flow 不再使用 buildSingleItemFallback", !/buildSingleItemFallback/.test(garmentIntake));
check("retry 失败草稿含 blocking ai_recognition_failed", /"ai_recognition_failed"[\s\S]*?severity:\s*"blocking"/.test(retryLib));
check("recognizeSingleItemFromDataUrl 未配置 Key 抛 not_configured", /not_configured[\s\S]*?未配置 MiniMax Key/.test(deviceMinimax));
check("recognizeSingleItemFromDataUrl M3/VLM 失败抛 GarmentRecognitionError", /throw new GarmentRecognitionError/.test(deviceMinimax));
check("garment-intake-flow 全部失败仍进入步骤 3", /全部失败[\s\S]{0,200}setStepIndex\("confirm_params"\)/.test(garmentIntake) || /totalReviewable\s*>\s*0[\s\S]*?setStepIndex\("confirm_params"\)/.test(garmentIntake));
check("garment-intake-flow 部分保存确认弹窗", /还有.*件.*尚未完成确认/.test(garmentIntake));
check("garment-intake-flow patchReviewDraft 清失败 issue", /isFailedDraftManualRecoveryComplete/.test(garmentIntake));
check("device-minimax GarmentRecognitionFailureCode 包含 invalid_json", /"invalid_json"/.test(deviceMinimax));
check("device-minimax GarmentRecognitionFailureCode 包含 service", /"service"/.test(deviceMinimax));
check("device-minimax GarmentRecognitionFailureCode 包含 timeout", /"timeout"/.test(deviceMinimax));
check("device-minimax GarmentRecognitionFailureCode 包含 network", /"network"/.test(deviceMinimax));
check("retry 失败草稿带 needsReview", /needsReview:\s*true/.test(retryLib));
check("retry isFailedDraftManualRecoveryComplete 校验 name/category/colors", /draft\.name\.value\.trim\(\)[\s\S]*?draft\.category\.source[\s\S]*?draft\.colors\.value/.test(retryLib));

console.log(`\nintake recognition failure semantics tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
