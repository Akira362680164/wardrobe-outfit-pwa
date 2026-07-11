import assert from "node:assert/strict";
import fs from "node:fs";

const app = JSON.parse(fs.readFileSync("apps/wechat-miniprogram/app.json", "utf8"));
const iconWxml = fs.readFileSync("apps/wechat-miniprogram/components/ui/icon/index.wxml", "utf8");
const iconWxss = fs.readFileSync("apps/wechat-miniprogram/components/ui/icon/index.wxss", "utf8");
const customTab = fs.readFileSync("apps/wechat-miniprogram/custom-tab-bar/index.ts", "utf8");
const capsule = fs.readFileSync("apps/wechat-miniprogram/utils/capsule-layout.ts", "utf8");

assert.notEqual(app.tabBar.custom, true, "native tabBar must be the only owner");
assert.equal(app.tabBar.list.length, 4);
for (const item of app.tabBar.list) {
  assert.match(item.iconPath, /\.png$/);
  assert.match(item.selectedIconPath, /-selected\.png$/);
  assert.ok(fs.existsSync(`apps/wechat-miniprogram/${item.iconPath}`));
  assert.ok(fs.existsSync(`apps/wechat-miniprogram/${item.selectedIconPath}`));
}
assert.match(iconWxml, /<image[^>]+src="\{\{iconSrc\}\}"/);
assert.doesNotMatch(iconWxss, /mask-image/);
assert.match(customTab, /if \(selected === Number\(this\.data\.selected\)\) return/);
assert.match(capsule, /getMenuButtonBoundingClientRect/);
assert.match(capsule, /rightInsetRpx/);
console.log("miniprogram shell contract passed");
