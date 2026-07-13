import assert from "node:assert/strict";
import fs from "node:fs";

const garment = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/detail/index.wxml", "utf8");
const wishlist = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/detail/index.wxml", "utf8");
const fields = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-field-sections/index.wxml", "utf8");
const media = fs.readFileSync("apps/wechat-miniprogram/components/domain/item-media-section/index.wxml", "utf8");
const garmentTs = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/detail/index.ts", "utf8");
const wishlistTs = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/detail/index.ts", "utf8");
const garmentEdit = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/edit/index.wxml", "utf8");
const wishlistEdit = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/edit/index.wxml", "utf8");

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
