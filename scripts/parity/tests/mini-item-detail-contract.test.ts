import assert from "node:assert/strict";
import fs from "node:fs";
import { ICON_PATHS, ICON_TONES } from "../../../apps/wechat-miniprogram/components/ui/icon/generated-icons";

const garment = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml", "utf8");
const garmentStyle = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/detail/index.wxss", "utf8");
const wishlist = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/detail/index.wxml", "utf8");
const fields = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-field-sections/index.wxml", "utf8");
const fieldsStyle = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-field-sections/index.wxss", "utf8");
const media = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-media-section/index.wxml", "utf8");
const garmentTs = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/detail/index.ts", "utf8");
const wishlistTs = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/detail/index.ts", "utf8");
const garmentEdit = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/edit/index.wxml", "utf8");
const wishlistEdit = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/edit/index.wxml", "utf8");
const workspace = fs.readFileSync("apps/wechat-miniprogram/services/workspace.ts", "utf8");
const detailShell = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-detail-shell/index.wxml", "utf8");
const detailShellStyle = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-detail-shell/index.wxss", "utf8");

for (const page of [garment, wishlist]) {
  assert.match(page, /<item-media-section/);
  assert.match(page, /<item-field-sections/);
  assert.match(page, /slot="topRight"/);
  assert.doesNotMatch(page, /<text>辅助色<\/text>/);
}
assert.match(fields, /colorMode === 'main_with_accent'/);
assert.match(fields, /temperature-track/);
assert.match(media, /添加灵感/);
assert.match(media, /bindtap="add"/);
assert.match(garmentTs, /uploadPreparedImageAssets/);
assert.match(wishlistTs, /uploadPreparedImageAssets/);
assert.match(garmentTs, /kind: "remove"/);
assert.match(garment, /slot="heroAction"/);
assert.match(garment, /bindtap="toggleWornToday"/, "the wear-state control must keep its click behavior");
assert.match(garment, /wx:elif="\{\{wornToday\}\}"/, "the worn state must remain explicit");
assert.match(garment, /<ui-icon name="check"[^>]+tone="success"[^>]+aria-hidden="true"/, "the worn state must use the shared SVG check icon");
assert.ok(ICON_TONES.includes("success"), "the worn-state tone must be part of the generated icon contract");
assert.equal(
  ICON_PATHS.check.success,
  "/assets/icons/check-success.svg",
  "the worn-state icon must resolve to the generated success asset instead of falling back to ink",
);
assert.ok(
  fs.existsSync(`apps/wechat-miniprogram${ICON_PATHS.check.success}`),
  "the resolved worn-state success icon asset must exist",
);
assert.match(garment, /<text>今天已穿<\/text>/, "the worn state must retain readable Chinese text");
assert.match(garment, /<text wx:else>标记今天穿了<\/text>/, "the normal state must retain its action text");
assert.match(garment, /今天已穿，点击撤销穿着记录/, "the worn action must expose its full accessibility meaning");
assert.doesNotMatch(garment, /✓/, "the worn state must not use a Unicode check icon");
assert.match(
  garmentStyle,
  /\.wear-button[\s\S]*min-height:\s*var\(--hit-target-min\)/,
  "the wear-state action must retain a 44px minimum hit target",
);
assert.match(garmentTs, /wearMutation\.key !== mutationKey/);
assert.match(garmentTs, /markGarmentWornOnDate/);
assert.match(garmentTs, /cancelGarmentWornOnDate/);
assert.match(garmentTs, /const action = this\.data\.wornToday \? "cancel" : "mark"/);
assert.match(workspace, /\/api\/workspace\/garments\/\$\{encodeURIComponent\(id\)\}\/mark-worn/);
assert.match(workspace, /\/api\/workspace\/garments\/\$\{encodeURIComponent\(id\)\}\/cancel-worn/);
assert.match(workspace, /const detail = await fetchGarmentDetail\(id\)/);
assert.match(workspace, /serverConfirmedGarmentMark\(detail\.rawPayload, dateKey\)/);
assert.match(workspace, /serverConfirmedGarmentCancel\(detail\.rawPayload,\s*dateKey\)/);
assert.match(workspace, /服务器未确认今天穿着记录/);
assert.match(workspace, /服务器未确认取消今天穿着记录/);
assert.match(fields, /版型倾向<\/text><text class="info-value">\{\{item\.fitGenderText\}\}/);
assert.match(fields, /版型说明<\/text><text class="info-value">\{\{item\.fitNotes \|\| '未记录'\}\}/);
assert.doesNotMatch(fields, /版型倾向<\/text><text class="info-value">\{\{item\.fitText\}\}/);
assert.doesNotMatch(fieldsStyle, />text|:first-child|:last-child/);
assert.match(detailShell, /mode="aspectFit"/);
assert.match(detailShellStyle, /height:\s*914\.67rpx/);
assert.match(detailShellStyle, /aspect-ratio:\s*3\s*\/\s*4/);
assert.doesNotMatch(detailShellStyle, /height:\s*52vh/);
assert.match(garment, /style="\{\{fontStyle\}\}"/);
assert.match(garmentTs, /currentAccessibilityFontStyle/);
assert.match(wishlistTs, /toggleArchived/);
assert.match(wishlistTs, /openConvertedGarment/);
for (const source of [garmentTs, wishlistTs]) {
  assert.match(source, /initialLoading/);
  assert.match(source, /refreshing/);
  assert.match(source, /detailRequestId/);
  assert.match(source, /getRuntimeRefreshSnapshot/);
  assert.match(source, /markRuntimeDomainDirty/);
}
assert.doesNotMatch(garmentTs, /onShow[\s\S]{0,180}if \(item\) void this\.loadDetail/, "garment detail must not reload on every onShow");
assert.doesNotMatch(wishlistTs, /onShow[\s\S]{0,180}if \(item\) void this\.loadDetail/, "wishlist detail must not reload on every onShow");
for (const edit of [garmentEdit, wishlistEdit]) {
  assert.match(edit, /bindtap="recropImage"/);
  assert.match(edit, /bindtap="reRecognize"/);
  assert.match(edit, /colorMode === 'main_with_accent'/);
}
console.log("mini item detail contract passed");
