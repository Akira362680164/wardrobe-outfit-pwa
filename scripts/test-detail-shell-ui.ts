import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDetailMetaText, getDetailPageLabel, getDetailSlideLabel, shouldRenderDetailFilmstrip } from "../src/components/detail-shell";
import { formatGarmentWearLine, getColorSwatchStyle, getGarmentCardColors } from "../src/lib/catalog-card-format";
import { buildColorInfo, getAccentColors, getPrimaryColor, getPrimaryColors, uniqueTrimmed } from "../src/lib/color-fields";
import { formatColorModeLabel, formatGarmentFitGender, formatSubcategoryLabel } from "../src/lib/display-labels";
import type { WardrobeItem } from "../src/lib/types";

const root = join(__dirname, "..");
const outfitListView = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");
const detailShell = readFileSync(join(root, "src/components/detail-shell.tsx"), "utf8");
const garmentDetail = readFileSync(join(root, "src/components/garment-detail-3.0.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const itemDetailSections = readFileSync(join(root, "src/components/item/detail-sections.tsx"), "utf8");
const itemSectionCard = readFileSync(join(root, "src/components/item/section-card.tsx"), "utf8");
const itemColorFields = readFileSync(join(root, "src/components/item/color-fields.tsx"), "utf8");
const appSubPageTopBar = readFileSync(join(root, "src/components/app-sub-page-top-bar.tsx"), "utf8");

assert.equal(buildDetailMetaText(["上装", "", undefined, null, false, "春夏", "通勤"]), "上装 · 春夏 · 通勤");
assert.equal(getDetailSlideLabel("garment_main"), "主图");
assert.equal(getDetailSlideLabel("garment_reference"), "灵感");
assert.equal(getDetailSlideLabel("outfit_cover"), "主图");
assert.equal(getDetailSlideLabel("outfit_real"), "套装示意");
assert.equal(getDetailSlideLabel("wishlist_product"), "商品图");
assert.equal(getDetailPageLabel(0, 1), "");
assert.equal(getDetailPageLabel(1, 3), "2 / 3");
assert.equal(shouldRenderDetailFilmstrip("garment"), true);
assert.equal(shouldRenderDetailFilmstrip("outfit"), true);
assert.equal(shouldRenderDetailFilmstrip("wishlist"), false);
assert.equal(formatGarmentFitGender("menswear"), "男装版型");
assert.equal(formatGarmentFitGender("womenswear"), "女装版型");
assert.equal(formatGarmentFitGender("unisex"), "中性版型");
assert.equal(formatGarmentFitGender("unknown"), "未识别");
assert.equal(formatGarmentFitGender(undefined), "未识别");
assert.equal(formatColorModeLabel("single"), "单色");
assert.equal(formatColorModeLabel("main_with_accent"), "主色+点缀色");
assert.equal(formatColorModeLabel("multicolor"), "多色/拼色");
assert.equal(formatSubcategoryLabel("tops", "vest"), "马甲");
assert.equal(formatSubcategoryLabel("tops", "denim_jacket"), "牛仔衣");
assert.equal(formatSubcategoryLabel("tops", "legacy-free-form"), "其他细分");
assert.equal(formatSubcategoryLabel("tops", undefined), "未填写");

assert.deepEqual(uniqueTrimmed(["米", "米", "  ", "白", "白", "黑"]), ["米", "白", "黑"]);
assert.deepEqual(uniqueTrimmed([]), []);
{ const o = buildColorInfo("single", ["米"], ["棕"]); assert.equal(getPrimaryColor(o),"米"); assert.deepEqual(getPrimaryColors(o),["米"]); assert.deepEqual(getAccentColors(o),[]); }
{ const o = buildColorInfo("main_with_accent", ["米"], ["米","棕","黑","棕"]); assert.equal(getPrimaryColor(o),"米"); assert.deepEqual(getPrimaryColors(o),["米"]); assert.deepEqual(getAccentColors(o),["棕","黑"]); }
{ const o = buildColorInfo("main_with_accent", ["米"], ["棕","黑","白","灰","蓝","红"]); assert.equal(getAccentColors(o).length,5); }
{ const o = buildColorInfo("multicolor", ["米","棕","黑","白","灰","蓝","红"]); assert.equal(getPrimaryColor(o),"米"); assert.deepEqual(getPrimaryColors(o),["米","棕","黑","白","灰"]); assert.deepEqual(getAccentColors(o),[]); }
{ const o = buildColorInfo("multicolor", ["米"], ["棕"]); assert.deepEqual(getPrimaryColors(o),["米"]); assert.deepEqual(getAccentColors(o),[]); }
{ const o = buildColorInfo("single", ["蓝"]); assert.equal(getPrimaryColor(o),"蓝"); assert.deepEqual(getPrimaryColors(o),["蓝"]); }

function item(partial: Partial<WardrobeItem>): WardrobeItem {
  return {
    name: "测试单品",
    imageDataUrl: "",
    category: "tops",
    colors: buildColorInfo("single", []),
    seasons: ["all"],
    styles: ["casual"],
    formality: 3,
    warmth: 3,
    locationId: "default",
    status: "active",
    wornDates: [],
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    ...partial,
  };
}

assert.deepEqual(getGarmentCardColors(item({ colors: buildColorInfo("single", ["棕色"]) })), ["棕色"]);
assert.deepEqual(getGarmentCardColors(item({ colors: buildColorInfo("main_with_accent", ["米色"], ["棕色", "黑色"]) })), ["米色", "棕色", "黑色"]);
assert.deepEqual(getGarmentCardColors(item({ colors: buildColorInfo("multicolor", ["蓝色", "白色", "蓝色"]) })), ["蓝色", "白色"]);
assert.deepEqual(getGarmentCardColors(item({ colors: buildColorInfo("multicolor", ["蓝色", " ", "蓝色", "棕色", "黑色"]) })), ["蓝色", "棕色", "黑色"]);
assert.equal(formatGarmentWearLine(item({ wornDates: [] })), "未穿过");
assert.equal(formatGarmentWearLine(item({ wornDates: ["2026-06-13"] })), "最近 6/13 · 穿过 1 次");
assert.deepEqual(getColorSwatchStyle("白色"), { backgroundColor: "#ffffff", needsBorder: true });
assert.deepEqual(getColorSwatchStyle("棕色"), { backgroundColor: "#8b5e34", needsBorder: false });

const parentDeleteStart = outfitListView.indexOf("async function handleDeleteOutfit() {");
const parentDeleteEnd = outfitListView.indexOf("const activeCalendarPlan", parentDeleteStart);
const parentDeleteBlock = outfitListView.slice(parentDeleteStart, parentDeleteEnd);
const detailDeleteStart = outfitListView.indexOf("async function handleDeleteOutfit() {", parentDeleteEnd);
const detailDeleteEnd = outfitListView.indexOf("async function saveAiSuggestion", detailDeleteStart);
const detailDeleteBlock = outfitListView.slice(detailDeleteStart, detailDeleteEnd);
const outfitCardStart = outfitListView.indexOf('<div className="grid grid-cols-2 gap-3">');
const outfitCardEnd = outfitListView.indexOf("{/* padding for global + */}", outfitCardStart);
const outfitCardBlock = outfitListView.slice(outfitCardStart, outfitCardEnd);
assert.match(parentDeleteBlock, /await deleteOutfitWithCascade/);
assert.match(parentDeleteBlock, /await onPlanDataChange\(\)/);
assert.match(parentDeleteBlock, /await onRefresh\(\)/);
assert.match(parentDeleteBlock, /setViewingOutfitId\(null\)/);
assert.match(parentDeleteBlock, /setSubPage\("library"\)/);
assert.match(parentDeleteBlock, /onCloseOutfitDetail\?\.\(\)/);
assert.match(parentDeleteBlock, /onMessage\("删除失败，请重试", "error"\)/);
assert.doesNotMatch(parentDeleteBlock.slice(parentDeleteBlock.indexOf("catch")), /setViewingOutfitId\(null\)|setSubPage\("library"\)/);
assert.match(detailDeleteBlock, /await onDeleteOutfit\(\)/);
assert.doesNotMatch(outfitCardBlock, /MoreHorizontal|删除套装|Trash2/);

// v1.1.16 commit3 §5.4.3: SettingsView「优化图片缓存」卡片在失败时显示失败明细 + 重试按钮
// (这是 detail-shell-ui 范围内对 UI 静态断言的扩展, 因为 SettingsView 也在 wardrobe-app 里)
const wardrobeAppForBackfill = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
assert.match(
  wardrobeAppForBackfill,
  /backfillState\.failed\s*>\s*0\s*\?\s*\([\s\S]{0,500}?failedItems\.slice\(0,\s*3\)/,
  "SettingsView 在 backfillState.failed > 0 时渲染 failedItems.slice(0, 3)",
);
assert.match(
  wardrobeAppForBackfill,
  /data-testid="backfill-failure-open-all"[\s\S]{0,200}?查看全部失败记录/,
  "SettingsView 显示「查看全部失败记录」按钮",
);
assert.match(
  wardrobeAppForBackfill,
  /重试失败项/,
  "SettingsView 含「重试失败项」按钮文案",
);
assert.match(
  wardrobeAppForBackfill,
  /backfill\.retryFailed\(items\)/,
  "SettingsView「重试失败项」按钮调 backfill.retryFailed(items)",
);
assert.match(
  wardrobeAppForBackfill,
  /重新检查/,
  "SettingsView 含「重新检查」按钮文案",
);

assert.doesNotMatch(detailShell, /className="(?:mx|px)-4 mt-/, "DetailShell 不再叠加详情页横向边距");
assert.doesNotMatch(garmentDetail, /className="px-4 mt-4 pb-8"/, "GarmentDetail30 tab 内容不再叠加详情页横向边距");
assert.doesNotMatch(appSubPageTopBar, /min-h-\[76px\] px-4 border-b/, "AppSubPageTopBar 不再叠加二级页横向边距");
assert.match(detailShell, /<ItemSectionCard title=\{title\}>/, "DetailSurfaceCard 必须委托 ItemSectionCard");
assert.match(itemSectionCard, /rounded-2xl[\s\S]{0,80}bg-white[\s\S]{0,80}p-4[\s\S]{0,80}shadow-soft/, "ItemSectionCard 应统一卡片圆角、背景、内距和阴影");
assert.match(garmentDetail, /<ItemDetailSections[\s\S]{0,800}basicExtraRows=\{\([\s\S]{0,260}<WardrobeExtras[\s\S]{0,80}mode="view"/, "衣橱详情必须通过 ItemDetailSections + WardrobeExtras 渲染字段");
assert.match(wishlistView, /<ItemDetailSections[\s\S]{0,800}basicExtraRows=\{<WishlistExtras mode="view"/, "种草详情必须通过 ItemDetailSections + WishlistExtras 渲染字段");
assert.match(garmentDetail, /<ItemDetailSections[\s\S]{0,500}colors=\{item\.colors\}/, "衣橱详情颜色必须由 ItemDetailSections 统一接收 colors");
assert.match(wishlistView, /<ItemDetailSections[\s\S]{0,500}colors=\{item\.colors\}/, "种草详情颜色必须由 ItemDetailSections 统一接收 colors");
assert.equal((garmentDetail.match(/<DetailSurfaceCard title="穿着属性"/g) ?? []).length, 0, "衣橱详情不应手写穿着属性卡片");
assert.equal((wishlistView.match(/<DetailSurfaceCard title="穿着属性"/g) ?? []).length, 0, "种草详情不应手写穿着属性卡片");
for (const title of ["基础信息", "颜色", "穿着属性", "备注"]) {
  assert.ok(itemDetailSections.includes(`title="${title}"`), `ItemDetailSections 必须统一渲染 ${title} 模块`);
}
assert.match(itemDetailSections, /<ItemColorFields mode="view" colors=\{colors\}/, "详情颜色展示必须委托 ItemColorFields view");
assert.match(itemColorFields, /colorMode === "main_with_accent"[\s\S]{0,220}<ItemRow label="辅助色"/, "辅助色行只能在主辅色模式渲染");
assert.doesNotMatch(itemColorFields, /colorMode === "single"[\s\S]{0,220}<ItemRow label="辅助色"/, "单主色详情不应渲染辅助色");
assert.doesNotMatch(itemColorFields, /colorMode === "multicolor"[\s\S]{0,220}<ItemRow label="辅助色"/, "拼色详情不应渲染辅助色");
for (const label of ["单主色", "拼色", "主辅色"]) {
  assert.ok(itemColorFields.includes(`label: "${label}"`), `颜色编辑模式必须包含 ${label}`);
}
assert.match(wishlistView, /<WishlistExtras\s+[\s\S]{0,160}mode="edit"/, "种草编辑页应使用 WishlistExtras edit 注入状态字段");
assert.match(wishlistView, /<SeasonStyleChips\s+mode="edit"\s+kind="season"/, "种草编辑页应使用 SeasonStyleChips 编辑季节");
assert.match(wishlistView, /<SeasonStyleChips\s+mode="edit"\s+kind="style"/, "种草编辑页应使用 SeasonStyleChips 编辑风格");
assert.match(wishlistView, /<FormalityWarmthStepper[\s\S]{0,120}label="正式度"/, "种草编辑页应使用 FormalityWarmthStepper 编辑正式度");
assert.match(wishlistView, /<FormalityWarmthStepper[\s\S]{0,120}label="保暖度"/, "种草编辑页应使用 FormalityWarmthStepper 编辑保暖度");
assert.match(wishlistView, /<NotesBlock\s+[\s\S]{0,120}mode="edit"/, "种草编辑页应使用 NotesBlock edit 编辑备注");
assert.ok((wishlistView.match(/className="item-edit-section"/g) ?? []).length >= 4, "种草编辑页必须至少 4 个统一 item-edit-section");
assert.ok((wardrobeAppForBackfill.match(/className="item-edit-section"/g) ?? []).length >= 4, "衣橱编辑页必须至少 4 个统一 item-edit-section");
assert.match(wardrobeAppForBackfill, /<ItemSectionCard title="颜色"/, "衣橱编辑页颜色模块标题必须统一为颜色");
assert.match(wardrobeAppForBackfill, /<ItemSectionCard title="穿着属性"/, "衣橱编辑页穿着模块标题必须统一为穿着属性");
assert.match(wishlistView, /<ItemColorFields[\s\S]{0,80}mode="edit"/, "种草编辑页颜色编辑必须使用 ItemColorFields edit");
assert.match(wardrobeAppForBackfill, /<ItemColorFields[\s\S]{0,80}mode="edit"[\s\S]{0,120}colors=\{draft\.colors\}/, "衣橱编辑页颜色编辑必须使用 ItemColorFields edit");
assert.doesNotMatch(wishlistView, /ColorSwatchButton/, "种草编辑页不应再使用独立 ColorSwatchButton 色卡逻辑");

console.log("detail shell ui tests passed");
