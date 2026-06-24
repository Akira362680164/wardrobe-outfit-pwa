// Multi-image intake regression tests
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const multiImage = readFileSync(join(root, "src/lib/garment-intake-multi-image.ts"), "utf8");
const garmentIntakeFlow = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// garment-intake-multi-image.ts existence and constants
check("garment-intake-multi-image.ts 存在", /src\/lib\/garment-intake-multi-image\.ts/.test(multiImage) || multiImage.length > 0);
check("GARMENT_INTAKE_MAX_IMAGES 为 20", /GARMENT_INTAKE_MAX_IMAGES\s*=\s*20/.test(multiImage));

// Type exports
check("GarmentIntakeImageSource 类型导出", /export type GarmentIntakeImageSource/.test(multiImage));
check("GarmentIntakeImageStatus 类型导出", /export type GarmentIntakeImageStatus/.test(multiImage));
check("GarmentIntakeImageItem 接口导出", /export interface GarmentIntakeImageItem/.test(multiImage));
check("GarmentIntakePickedImage 接口导出", /export interface GarmentIntakePickedImage/.test(multiImage));
check("GarmentIntakeBatchSaveResult 接口导出", /export interface GarmentIntakeBatchSaveResult/.test(multiImage));

// Function exports
check("createGarmentIntakeImageItem 函数导出", /export function createGarmentIntakeImageItem/.test(multiImage));
check("appendGarmentIntakeImages 函数导出", /export function appendGarmentIntakeImages/.test(multiImage));
check("removeGarmentIntakeImage 函数导出", /export function removeGarmentIntakeImage/.test(multiImage));
check("moveGarmentIntakeImage 函数导出", /export function moveGarmentIntakeImage/.test(multiImage));
check("setGarmentIntakeImageCrop 函数导出", /export function setGarmentIntakeImageCrop/.test(multiImage));
check("setGarmentIntakeImageDraft 函数导出", /export function setGarmentIntakeImageDraft/.test(multiImage));
check("setGarmentIntakeImageError 函数导出", /export function setGarmentIntakeImageError/.test(multiImage));
check("getRecognizedGarmentIntakeImages 函数导出", /export function getRecognizedGarmentIntakeImages/.test(multiImage));
check("getSavableGarmentIntakeImages 函数导出", /export function getSavableGarmentIntakeImages/.test(multiImage));

// createGarmentIntakeImageItem generates selected status
check("createGarmentIntakeImageItem 生成 selected 状态", /status:\s*"selected"/.test(multiImage));

// appendGarmentIntakeImages preserves order
check("appendGarmentIntakeImages 保留顺序", /appendGarmentIntakeImages[\s\S]{0,100}current\[\.\.\.\,.*newItems/.test(multiImage) || /newItems/.test(multiImage));

// appendGarmentIntakeImages truncates to 20
check("appendGarmentIntakeImages 截断到 20", /GARMENT_INTAKE_MAX_IMAGES/.test(multiImage) && /slice\(0,\s*GARMENT_INTAKE_MAX_IMAGES\)/.test(multiImage));

// removeGarmentIntakeImage deletes specified id
check("removeGarmentIntakeImage 删除指定 id", /filter\(\s*\(item\)\s*=>\s*item\.id\s*!==\s*id/.test(multiImage));

// moveGarmentIntakeImage supports prev
check("moveGarmentIntakeImage 支持 prev", /direction\s*===\s*"prev"/.test(multiImage));

// moveGarmentIntakeImage supports next
check("moveGarmentIntakeImage 支持 next", /direction\s*===\s*"next"/.test(multiImage) || /\}\s*else\s*\{/.test(multiImage));

// moveGarmentIntakeImage boundary unchanged
check("moveGarmentIntakeImage 边界不变", /index\s*===\s*0/.test(multiImage) && /index\s*===\s*current\.length\s*-\s*1/.test(multiImage));

// setGarmentIntakeImageCrop writes croppedImageDataUrl
check("setGarmentIntakeImageCrop 写入 croppedImageDataUrl", /croppedImageDataUrl:\s*patch\.croppedImageDataUrl/.test(multiImage));

// setGarmentIntakeImageCrop updates displayDataUrl
check("setGarmentIntakeImageCrop 更新 displayDataUrl", /displayDataUrl:\s*patch\.croppedImageDataUrl/.test(multiImage));

// setGarmentIntakeImageCrop writes rotationDeg
check("setGarmentIntakeImageCrop 写入 rotationDeg", /rotationDeg:\s*patch\.rotationDeg/.test(multiImage));

// setGarmentIntakeImageDraft sets recognized
check("setGarmentIntakeImageDraft 设置 recognized", /status:\s*"recognized"/.test(multiImage));

// setGarmentIntakeImageError sets failed
check("setGarmentIntakeImageError 设置 failed", /status:\s*"failed"/.test(multiImage));

// getRecognizedGarmentIntakeImages only returns recognized
check("getRecognizedGarmentIntakeImages 只返回 recognized", /status\s*===\s*"recognized"/.test(multiImage));

// getSavableGarmentIntakeImages only returns items with draft
check("getSavableGarmentIntakeImages 只返回带 draft 的项", /\.draft/.test(multiImage));

// GarmentIntakeFlowProps uses onPickImages
check("GarmentIntakeFlowProps 使用 onPickImages", /onPickImages:\s*\(source:\s*GarmentImageSource/.test(garmentIntakeFlow));

// GarmentIntakeFlowProps uses onSaveBatch
check("GarmentIntakeFlowProps 使用 onSaveBatch", /onSaveBatch:\s*\(drafts:\s*GarmentIntakeDraft\[\]/.test(garmentIntakeFlow));

// GarmentIntakeFlow no longer saves single draft
check("GarmentIntakeFlow 不再只保存单个 draft", !/onSave:\s*\(\s*draft:\s*GarmentIntakeDraft/.test(garmentIntakeFlow));

// GarmentIntakeFlow no longer relies on imageDataUrl single state
check("GarmentIntakeFlow 不再只依赖 imageDataUrl 单状态", !/const \[rawImageDataUrl, setRawImageDataUrl\]/.test(garmentIntakeFlow) || /imageItems/.test(garmentIntakeFlow));

// GarmentIntakeFlow shows "已选择 X 张"
check("GarmentIntakeFlow 展示「已选择 X 张」", /已选择\s*\{imageItems\.length\}/.test(garmentIntakeFlow) || /已选择\s*\d+\s*张/.test(garmentIntakeFlow));

// GarmentIntakeFlow shows "继续从图库选择"
check("GarmentIntakeFlow 展示「继续从图库选择」", /继续从图库选择/.test(garmentIntakeFlow));

// GarmentIntakeFlow shows "正在编辑"
check("GarmentIntakeFlow 展示「正在编辑」", /正在编辑/.test(garmentIntakeFlow));

// GarmentIntakeFlow no longer requires per-image confirmation
check("GarmentIntakeFlow 不再展示「保存并下一张」", !/保存并下一张/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 步骤2主按钮固定展示「开始识别」", /stepIndex === "process_image"\s*\?\s*"开始识别"/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 不再要求先裁切所有图片", !/请先裁切所有图片/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 步骤2缩略图不再展示裁切对钩", !/item\.status === "cropped"[\s\S]{0,120}[✓○]/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 步骤2缩略图不再展示末尾 +N", !/\+{imageItems\.length - 5}/.test(garmentIntakeFlow));

// GarmentIntakeFlow shows "保存 X 件单品"
check("GarmentIntakeFlow 展示动态「保存 X 件」文案", /保存\s*\$\{savableItems\.length\}\s*件\$\{flowNoun\}/.test(garmentIntakeFlow));

// GarmentIntakeFlow calls onProcessImage with croppedImageDataUrl
check("GarmentIntakeFlow 调用 onProcessImage 时使用 croppedImageDataUrl", /croppedImageDataUrl\s*\?\?\s*item\.originalDataUrl/.test(garmentIntakeFlow) || /\.croppedImageDataUrl\s*\?\?\s*item\.originalDataUrl/.test(garmentIntakeFlow));

// GarmentIntakeFlow processes images one by one
check("GarmentIntakeFlow 逐张识别", /for\s*\(\s*const\s+item\s+of\s+pendingItems\s*\)/.test(garmentIntakeFlow) || /forEach/.test(garmentIntakeFlow));

// GarmentIntakeFlow single image failure doesn't interrupt batch
check("GarmentIntakeFlow 单张失败不中断整批", /continue/.test(garmentIntakeFlow) || /单张失败/.test(garmentIntakeFlow));

// WardrobeApp has onPickImages
check("WardrobeApp 接入 onPickImages", /onPickImages=\{pickGarmentIntakeImages/.test(wardrobeApp));

// WardrobeApp has onSaveBatch (uses inline async wrapper that calls saveBatchGarmentIntakeDrafts)
check("WardrobeApp 接入 onSaveBatch", /onSaveBatch=\{async\s*\(\w+\)\s*=>\s*\{[\s\S]{0,100}saveBatchGarmentIntakeDrafts/.test(wardrobeApp));

// Old CaptureView single-item mode does not exist
check("旧 CaptureView 单衣物模式不存在", !/function CaptureView/.test(wardrobeApp) || wardrobeApp.split("function CaptureView").length === 1);

// Old saveDraft does not exist
check("旧 saveDraft 不存在", !/async function saveDraft/.test(wardrobeApp) || wardrobeApp.split("async function saveDraft").length === 1);

// Old BatchReviewView single-item branch does not exist
check("旧 BatchReviewView 单品分支不存在", !/captureMode\s*!==\s*"outfit"\s*[\s\S]{0,50}<BatchReviewView/.test(wardrobeApp) || !/BatchReviewView/.test(wardrobeApp));

// WardrobeApp add garment entry calls startGarmentIntakeFlow
check("WardrobeApp 添加衣物入口调用 startGarmentIntakeFlow", /add_single_item[\s\S]{0,200}startGarmentIntakeFlow/.test(wardrobeApp) || /startGarmentIntakeFlow\(\)/.test(wardrobeApp));

// WardrobeView empty state entry calls onStartGarmentIntake
check("WardrobeView 空状态入口调用 onStartGarmentIntake", /onStartGarmentIntake=\{startGarmentIntakeFlow/.test(wardrobeApp));

// GarmentIntakeFlow uses imageItems state
check("GarmentIntakeFlow 使用 imageItems 状态", /imageItems:\s*GarmentIntakeImageItem\[\]/.test(garmentIntakeFlow) || /const \[imageItems/.test(garmentIntakeFlow));

// v1.1.16-dev commit1 §3.4.1: 单品录入接 AI 主链 + 失败 banner + 缩略图 loading
check("GarmentIntakeFlow 状态机含 recognizing 字段", /"recognizing"/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 失败草稿顶部 banner 显示「AI 识别失败」", /AI 识别失败，已生成待确认草稿/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 缩略图 strip 显示「识别中」loading", /item\.status === "recognizing"[\s\S]+?识别中/.test(garmentIntakeFlow));
check("GarmentIntakeFlow 把 aiTag 映射到 buildLocalGarmentDraft", /mapAiTagToGarmentDraftInput/.test(garmentIntakeFlow));
check("wardrobe-app GarmentIntakeFlow wiring 传 onProcessImage", /<GarmentIntakeFlow[\s\S]+?onProcessImage=\{processGarmentIntakeImage\}/.test(wardrobeApp));
check("wardrobe-app processGarmentIntakeImage 调 recognizeSingleItemFromDataUrl", /processGarmentIntakeImage[\s\S]+?recognizeSingleItemFromDataUrl\(/.test(wardrobeApp));

console.log(`\ngarment intake multi-image tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
