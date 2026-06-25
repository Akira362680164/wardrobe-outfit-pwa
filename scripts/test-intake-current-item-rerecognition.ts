// v1.1.31 commit2 — 当前单件重新识别测试
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const retryLib = readFileSync(join(root, "src/lib/intake-recognition-retry.ts"), "utf8");
const garmentIntake = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wardrobe = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const multiImage = readFileSync(join(root, "src/lib/garment-intake-multi-image.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

check("intake-recognition-retry.ts 存在", existsSync(join(root, "src/lib/intake-recognition-retry.ts")));
check("mergeRetryRecognitionDraft 导出", /export function mergeRetryRecognitionDraft/.test(retryLib));
check("buildFailedRecognitionDraft 导出", /export function buildFailedRecognitionDraft/.test(retryLib));
check("isFailedDraftManualRecoveryComplete 导出", /export function isFailedDraftManualRecoveryComplete/.test(retryLib));
check("AI_RETRY_FIELD_KEYS 导出", /export const AI_RETRY_FIELD_KEYS/.test(retryLib));
check("GarmentIntakeFlow 步骤 3 标题右侧存在重新识别按钮", /RefreshCw[\s\S]{0,200}重新识别/.test(garmentIntake));
check("GarmentIntakeFlow 包含 retryingReviewId 状态", /retryingReviewId/.test(garmentIntake));
check("GarmentIntakeFlow locked 包含 retrying", /locked\s*=[\s\S]*?retryingReviewId\s*!==\s*null/.test(garmentIntake));
check("GarmentIntakeFlow 重试失败保留草稿 (不调用 buildSingleItemFallback)", !/buildSingleItemFallback/.test(garmentIntake));
check("wardrobe processGarmentIntakeImage 使用真实 fileName", /fileName\s*=\s*input\.fileName/.test(wardrobe));
check("GarmentIntakeFlow handleRetryCurrentItem 函数定义", /async function handleRetryCurrentItem/.test(garmentIntake));
check("GarmentIntakeFlow 重新识别只处理当前 reviewId", /onRetryCurrent\(activeReviewId\)/.test(garmentIntake));
check("GarmentIntakeFlow 重新识别复用 recognizeImageItem", /recognizeImageItem\(item\)/.test(garmentIntake));
check("GarmentIntakeFlow 重新识别保留 user 字段", /mergeRetryRecognitionDraft/.test(garmentIntake));
check("GarmentIntakeFlow 诊断事件 intake_single_retry_started", /intake_single_retry_started/.test(garmentIntake));
check("GarmentIntakeFlow 诊断事件 intake_single_retry_succeeded", /intake_single_retry_succeeded/.test(garmentIntake));
check("GarmentIntakeFlow 诊断事件 intake_single_retry_failed", /intake_single_retry_failed/.test(garmentIntake));
check("retry 库保留非 AI 业务字段 locationId", /ALWAYS_KEEP_KEYS/.test(retryLib));
check("retry 库保留图片与标识 IDENTITY_KEYS", /IDENTITY_KEYS/.test(retryLib));
check("retry 库清除 ai_recognition_failed issue", /code !== "ai_recognition_failed"/.test(retryLib));
check("multi-image 导出 getReviewableGarmentIntakeImages", /export function getReviewableGarmentIntakeImages/.test(multiImage));
check("multi-image getSavableGarmentIntakeImages 使用 canSave", /getSavableGarmentIntakeImages[\s\S]*?canSave/.test(multiImage));

console.log(`\nintake current item rerecognition tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
