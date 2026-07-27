import assert from "node:assert/strict";
import fs from "node:fs";

const garment = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml", "utf8");
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
assert.match(garment, /wornToday \? '✓ 今天已穿' : '标记今天穿了'/);
assert.match(garmentTs, /wearMutation\.key !== mutationKey/);
assert.match(garmentTs, /markGarmentWornOnDate/);
assert.match(garmentTs, /cancelGarmentWornOnDate/);
assert.match(workspace, /\/api\/workspace\/garments\/\$\{encodeURIComponent\(id\)\}\/mark-worn/);
assert.match(workspace, /\/api\/workspace\/garments\/\$\{encodeURIComponent\(id\)\}\/cancel-worn/);
assert.match(workspace, /const detail = await fetchGarmentDetail\(id\)/);
assert.match(workspace, /serverConfirmedGarmentMark\(detail\.rawPayload, dateKey\)/);
assert.match(workspace, /serverConfirmedGarmentCancel\(detail\.rawPayload\)/);
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
