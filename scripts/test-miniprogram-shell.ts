import assert from "node:assert/strict";
import fs from "node:fs";

const app = JSON.parse(fs.readFileSync("apps/wechat-miniprogram/app.json", "utf8"));
const iconWxml = fs.readFileSync("apps/wechat-miniprogram/components/ui/icon/index.wxml", "utf8");
const iconWxss = fs.readFileSync("apps/wechat-miniprogram/components/ui/icon/index.wxss", "utf8");
const customTab = fs.readFileSync("apps/wechat-miniprogram/custom-tab-bar/index.ts", "utf8");
const iconSource = fs.readFileSync("apps/wechat-miniprogram/components/ui/icon/index.ts", "utf8");
const iconRegistry = fs.readFileSync("apps/wechat-miniprogram/components/ui/icon/icons.ts", "utf8");
const capsule = fs.readFileSync("apps/wechat-miniprogram/utils/capsule-layout.ts", "utf8");
const runtimeSource = readRuntimeSource("apps/wechat-miniprogram");
const wxmlSource = readRuntimeSource("apps/wechat-miniprogram", /\.wxml$/);
const appSource = fs.readFileSync("apps/wechat-miniprogram/app.ts", "utf8");
const authSource = fs.readFileSync("apps/wechat-miniprogram/services/auth.ts", "utf8");
const statsSource = fs.readFileSync("apps/wechat-miniprogram/utils/wear-statistics.ts", "utf8");

assert.equal(app.tabBar.custom, true, "the glass custom tabBar must be the only visible owner");
assert.equal(app.tabBar.list.length, 4);
for (const item of app.tabBar.list) {
  assert.match(item.iconPath, /\.png$/);
  assert.match(item.selectedIconPath, /-selected\.png$/);
  assert.ok(fs.existsSync(`apps/wechat-miniprogram/${item.iconPath}`));
  assert.ok(fs.existsSync(`apps/wechat-miniprogram/${item.selectedIconPath}`));
}
assert.match(iconWxml, /<image[^>]+src="\{\{iconSrc\}\}"/);
assert.doesNotMatch(iconWxss, /mask-image/);
assert.doesNotMatch(iconSource, /currentColor|ICON_GLYPHS|filter:/);
assert.doesNotMatch(iconRegistry, /ICON_GLYPHS/);
assert.doesNotMatch(wxmlSource, /<ui-icon[^>]+color=/);
assert.doesNotMatch(wxmlSource, /[‹›⌕♧＋✓]/, "visible icons must use the shared SVG component");
assert.match(customTab, /if \(selected === Number\(this\.data\.selected\)\) return/);
assert.doesNotMatch(runtimeSource, /wx\.(?:hideTabBar|showTabBar)\s*\(/, "custom tabBar pages must not revive the native tabBar");
assert.match(capsule, /getMenuButtonBoundingClientRect/);
assert.match(capsule, /rightInsetRpx/);
assert.doesNotMatch(capsule, /getSystemInfoSync/);
assert.doesNotMatch(appSource, /getSystemInfoSync/);
assert.doesNotMatch(authSource, /getSystemInfoSync/);
assert.match(appSource, /getWindowInfo/);
assert.match(authSource, /getDeviceInfo/);
assert.match(statsSource, /recent/);
assert.match(statsSource, /idleCount: allIdleRows\.length/);
assert.doesNotMatch(statsSource, /month \* 100/);
console.log("miniprogram shell contract passed");

function readRuntimeSource(root: string, filePattern = /\.(?:ts|wxml|wxss|json)$/): string {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) return readRuntimeSource(path);
    return filePattern.test(entry.name) ? [fs.readFileSync(path, "utf8")] : [];
  }).join("\n");
}
