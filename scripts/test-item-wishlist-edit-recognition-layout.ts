import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const recognitionPatch = readFileSync(join(root, "src/lib/item-recognition-patch.ts"), "utf8");

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) { console.error(`  FAIL: ${msg}`); failed++; }
  else { console.log(`  OK: ${msg}`); }
}

// ────── 16.1 单品字段完整性 ──────
console.log("\n# 16.1 单品字段完整性");
ok(wardrobeApp.includes("CategorySubcategoryPicker"), "编辑页存在 CategorySubcategoryPicker（分类+细分联动）");
ok(wardrobeApp.includes("TemperatureRangeSlider"), "编辑页存在 TemperatureRangeSlider（适穿温度）");
ok(wardrobeApp.includes('label="价格"'), "编辑页存在价格字段");
ok(wardrobeApp.includes('label="商品链接"'), "编辑页存在商品链接字段");
ok(wardrobeApp.includes('label="材质"'), "编辑页存在材质字段");
ok(wardrobeApp.includes("版型说明"), "编辑页存在版型说明字段");

// ────── 16.2 单品修改快照 ──────
console.log("\n# 16.2 单品修改快照");
ok(wardrobeApp.includes("subcategory:"), "EditSnapshot 包含 subcategory");
ok(wardrobeApp.includes("price:"), "EditSnapshot 包含 price");
ok(wardrobeApp.includes("productUrl:"), "EditSnapshot 包含 productUrl");
ok(wardrobeApp.includes("purchaseDate:"), "EditSnapshot 包含 purchaseDate");
ok(wardrobeApp.includes("temperatureRange:"), "EditSnapshot 包含 temperatureRange");
ok(wardrobeApp.includes("material:"), "EditSnapshot 包含 material");
ok(wardrobeApp.includes("aiConfidence:"), "EditSnapshot 包含 aiConfidence");
ok(wardrobeApp.includes("needsReview:"), "EditSnapshot 包含 needsReview");

// ────── 16.3 单品识别路径 ──────
console.log("\n# 16.3 单品识别路径");
const recogStart = wardrobeApp.indexOf("async function recognizeEditDraftAgain");
const nextFnStart = wardrobeApp.indexOf("async function saveEditedItem", recogStart);
const recogFnBody = wardrobeApp.slice(recogStart, nextFnStart);
ok(recogStart > 0, "recognizeEditDraftAgain 函数存在");
ok(recogFnBody.includes("recognizeSingleItemFromDataUrl"), "编辑页重新识别调用 recognizeSingleItemFromDataUrl");
ok(!recogFnBody.includes("detectGarmentsOnDevice"), "编辑页重新识别不再调用 detectGarmentsOnDevice");
ok(wardrobeApp.includes("buildWardrobeEditRecognitionPatch"), "使用统一识别补丁");

// ────── 16.4 种草识别路径 ──────
console.log("\n# 16.4 种草识别路径");
ok(wishlistView.includes("onProcessIntakeImage"), "种草编辑使用 onProcessIntakeImage 回调");
ok(!wishlistView.includes("analyzeWishlistIntakeImageOnDevice"), "种草编辑不再调用 analyzeWishlistIntakeImageOnDevice");
ok(wishlistView.includes("buildWishlistEditRecognitionPatch"), "使用统一识别补丁");

// ────── 16.5 手工字段保护 ──────
console.log("\n# 16.5 手工字段保护");
// 验证识别补丁不包含受保护字段
ok(!recognitionPatch.includes("price"), "识别补丁不覆盖价格");
ok(!recognitionPatch.includes("productUrl"), "识别补丁不覆盖链接");
ok(!recognitionPatch.includes("purchaseDate"), "识别补丁不覆盖购买日期");
ok(!recognitionPatch.includes("imageDataUrl"), "识别补丁不覆盖图片");
ok(!recognitionPatch.includes("cropBox"), "识别补丁不覆盖裁切");
ok(!recognitionPatch.includes("locationId"), "识别补丁不覆盖衣橱位置");
ok(!recognitionPatch.includes("status"), "识别补丁不覆盖状态");
ok(!recognitionPatch.includes("wornDates"), "识别补丁不覆盖穿着记录");

// 验证「仅空值填充」规则
ok(recognitionPatch.includes("currentName"), "名称空值填充逻辑存在");
ok(recognitionPatch.includes("currentNotes"), "备注空值填充逻辑存在");

// ────── 16.6 页面边距 ──────
console.log("\n# 16.6 页面边距");
// 种草详情 tab 内容不应有第二层 px-4
const detailTabContent = wishlistView.match(/Tab content[\s\S]{0,300}<div className="([^"]*)/);
ok(detailTabContent != null && !detailTabContent[1].includes("px-4"), "种草详情 tab 内容无第二层 px-4");

// 种草编辑图片区域不应有第二层 mx-4
const editImageMatch = wishlistView.match(/Image preview[\s\S]{0,200}<div className="([^"]*)/);
ok(editImageMatch != null && !editImageMatch[1].includes("mx-4"), "种草编辑图片区域无第二层 mx-4");

// 种草编辑 AI 按钮区不应有第二层 mx-4
const editAiMatch = wishlistView.match(/AI 操作区[\s\S]{0,150}<div className="([^"]*)/);
ok(editAiMatch != null && !editAiMatch[1].includes("mx-4"), "种草编辑 AI 按钮区无第二层 mx-4");

// 种草编辑表单区不应有第二层 px-4
const editFormMatch = wishlistView.match(/Form fields[\s\S]{0,150}<div className="([^"]*)/);
ok(editFormMatch != null && !editFormMatch[1].includes("px-4"), "种草编辑表单区无第二层 px-4");

// 种草编辑顶部导航使用 px-1（与单品编辑一致）
ok(wishlistView.includes('flex items-center justify-between px-1 h-14 border-b'), "种草编辑顶部导航使用 px-1");

// 类别改为分类
ok(!wardrobeApp.match(/<ItemField label="类别"/), "单品编辑页「类别」已改为「分类」联动组件");
ok(wardrobeApp.includes('categoryLabel="分类"'), "单品编辑页使用「分类」标签");

// ────── 16.7 类型一致性 ──────
console.log("\n# 16.7 类型一致性");
const intakeLocal = readFileSync(join(root, "src/lib/intake-local-draft.ts"), "utf8");
ok(intakeLocal.includes("aiTag"), "LocalImageProcessingResult 包含 aiTag 字段");

// ────── 结果汇总 ──────
console.log(`\n${failed > 0 ? `FAILED: ${failed} assertion(s)` : "ALL PASSED"}`);
process.exit(failed > 0 ? 1 : 0);
