import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const recognitionPatch = readFileSync(join(root, "src/lib/item-recognition-patch.ts"), "utf8");
const wishlistConversion = readFileSync(join(root, "src/lib/wishlist-conversion.ts"), "utf8");
const migrate = readFileSync(join(root, "src/lib/migrate.ts"), "utf8");

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
ok(!/buildWardrobeEditRecognitionPatch\(tag,\s*\{[\s\S]{0,120}currentName:/.test(recogFnBody), "单品编辑重新识别会用 AI 新名称覆盖当前名称");

// ────── 16.4 种草识别路径 ──────
console.log("\n# 16.4 种草识别路径");
ok(wishlistView.includes("onProcessIntakeImage"), "种草编辑使用 onProcessIntakeImage 回调");
ok(!wishlistView.includes("analyzeWishlistIntakeImageOnDevice"), "种草编辑不再调用 analyzeWishlistIntakeImageOnDevice");
ok(wishlistView.includes("buildWishlistEditRecognitionPatch"), "使用统一识别补丁");
const wishlistRescanStart = wishlistView.indexOf("const handleRescanAI = useCallback");
const wishlistRescanEnd = wishlistView.indexOf("/* ---- C4", wishlistRescanStart);
const wishlistRescanBody = wishlistView.slice(wishlistRescanStart, wishlistRescanEnd);
ok(!/buildWishlistEditRecognitionPatch\(tag,\s*\{[\s\S]{0,120}currentName:/.test(wishlistRescanBody), "种草编辑重新识别会用 AI 新名称覆盖当前名称");

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

// v1.1.28 commit: 图片区改为 ItemSectionCard, 已是单层容器, 不再有第二层 mx-4 风险。
// 直接做存在性 / 单一性检查。
ok(wishlistView.includes("v1.1.28 commit: 种草图片区对齐衣橱编辑页"), "种草图片区使用 v1.1.28 对齐版布局");
ok(!/Image preview[\s\S]{0,5}mx-4/.test(wishlistView), "种草图片区无残留「Image preview」+ mx-4 旧版块");
ok(!/AI 操作区[\s\S]{0,5}mx-4/.test(wishlistView), "种草图片区无残留「AI 操作区」+ mx-4 旧版块");

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

// ────── 16.8 v1.1.28 commit: 种草图片区对齐衣橱编辑页 (裁切 + 识别 source 拆分) ──────
console.log("\n# 16.8 v1.1.28 commit: 种草图片区裁切 + 识别 source 拆分");

// 1. 种草编辑页不再用 280px 大图块
ok(!wishlistView.includes('h-[280px]'), "种草编辑页不再使用 h-[280px] 大图块");
ok(!wishlistView.includes("重新 AI 识别商品信息"), "种草编辑页移除「重新 AI 识别商品信息」按钮文案");

// 2. 新 UI 文案 + 控件
ok(wishlistView.includes("重新裁切"), "种草编辑页新增「重新裁切」按钮");
ok(wishlistView.includes("重新识别"), "种草编辑页新增「重新识别」按钮");
ok(wishlistView.includes("ImageCropEditor"), "种草编辑页引入 ImageCropEditor 复用衣橱裁切器");
ok(wishlistView.includes("GarmentImage"), "种草编辑页使用 GarmentImage 展示商品图");
ok(wishlistView.includes("generateThumbnailSafe"), "种草编辑页裁切确认时调用 generateThumbnailSafe");
ok(wishlistView.includes("formSourceImageDataUrl"), "种草编辑页维护 formSourceImageDataUrl 状态");
ok(wishlistView.includes("formCropBox"), "种草编辑页维护 formCropBox 状态");
ok(wishlistView.includes("relative aspect-[3/4] w-28 shrink-0"), "种草图片区使用 relative + 3:4 w-28 小图布局 (与衣橱编辑一致, 移除按钮定位正确)");
ok(wishlistView.includes("current || wishlistCropJob.dataUrl"), "裁切确认在缺少 sourceImageDataUrl 时回填本次裁切源, 保证 cropBox 坐标有对应原图");
ok(wishlistView.includes("setFormThumbnailDataUrl(undefined)"), "裁切缩略图生成失败时清空旧 thumbnailDataUrl, 避免保存陈旧缩略图");

// 3. handleRescanAI 不再 sourceImageDataUrl === imageDataUrl (固定等值)
const rescanBlock = wishlistView.match(/const handleRescanAI = useCallback[\s\S]+?aiProgress\.complete[\s\S]+?\n\s*\}, \[[\s\S]+?\]\);/);
ok(rescanBlock != null, "handleRescanAI 函数可定位");
ok(rescanBlock != null && !/sourceImageDataUrl:\s*formImageDataUrl\s*,?\s*\}/.test(rescanBlock[0]), "handleRescanAI 不再把 formImageDataUrl 同时塞给 sourceImageDataUrl");
ok(rescanBlock != null && /formSourceImageDataUrl\s*\|\|\s*formImageDataUrl/.test(rescanBlock[0]), "handleRescanAI 在 source 缺失时回退到 formImageDataUrl");

// 4. wishlist-conversion 保留 cropBox / sourceImageDataUrl
const virtualBody = wishlistConversion.match(/export function wishlistToVirtualWardrobeItem[\s\S]+?\n  \};/);
ok(virtualBody != null, "wishlistToVirtualWardrobeItem 函数可定位");
ok(virtualBody != null && /sourceImageDataUrl:\s*wishlist\.sourceImageDataUrl/.test(virtualBody[0]), "wishlistToVirtualWardrobeItem 保留 sourceImageDataUrl");
ok(virtualBody != null && /cropBox:\s*wishlist\.cropBox/.test(virtualBody[0]), "wishlistToVirtualWardrobeItem 保留 cropBox");

const wardrobeBody = wishlistConversion.match(/export function wishlistToWardrobeItem[\s\S]+?\n  \};/);
ok(wardrobeBody != null, "wishlistToWardrobeItem 函数可定位");
ok(wardrobeBody != null && /cropBox:\s*wishlistItem\.cropBox/.test(wardrobeBody[0]), "wishlistToWardrobeItem 写入 cropBox");
ok(wardrobeBody != null && /sourceImageDataUrl:\s*wishlistItem\.sourceImageDataUrl/.test(wardrobeBody[0]), "wishlistToWardrobeItem 写入 sourceImageDataUrl");

ok(/\|\s*"sourceImageDataUrl"[\s\S]{0,80}\|\s*"cropBox"/.test(wishlistConversion), "WardrobeItemLike Pick 包含 sourceImageDataUrl / cropBox");

// 5. migrate 保留 cropBox
const wishlistMigrateBlock = migrate.match(/export function migrateWishlistItemRecord\([\s\S]+?\n\}\n/);
ok(wishlistMigrateBlock != null, "migrateWishlistItemRecord 函数可定位");
ok(wishlistMigrateBlock != null && /cropBox:\s*isCropBox\(o\.cropBox\)/.test(wishlistMigrateBlock[0]), "migrateWishlistItemRecord 校验并保留 cropBox");

// 6. save adapters + intake flow 透传 cropBox (低成本首录沉淀)
const intakeSaveAdapters = readFileSync(join(root, "src/lib/intake-save-adapters.ts"), "utf8");
ok(/cropBox:\s*draft\.cropBox/.test(intakeSaveAdapters), "intake-save-adapters 把 draft.cropBox 写入 WardrobeItem/WishlistItem");
const intakeFlow = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
ok(/cropBox:\s*item\.cropBox/.test(intakeFlow), "garment-intake-flow 把 item.cropBox 传入 buildLocalGarmentDraft");
const intakeDraft = readFileSync(join(root, "src/lib/intake-draft.ts"), "utf8");
ok(/cropBox\?:\s*\{[\s\S]*?x:\s*number;[\s\S]*?\}/.test(intakeDraft), "intake-draft GarmentIntakeDraft/WishlistIntakeDraft 包含 cropBox 字段");

// ────── 结果汇总 ──────
console.log(`\n${failed > 0 ? `FAILED: ${failed} assertion(s)` : "ALL PASSED"}`);
process.exit(failed > 0 ? 1 : 0);
