import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const tabTs = read("apps/wechat-miniprogram/custom-tab-bar/index.ts");
const tabWxml = read("apps/wechat-miniprogram/custom-tab-bar/index.wxml");
const tabWxss = read("apps/wechat-miniprogram/custom-tab-bar/index.wxss");
const catalogCardWxss = read("apps/wechat-miniprogram/components/domain/catalog-card/index.wxss");
const sharedGlassWxss = read("apps/wechat-miniprogram/styles/glass.wxss");
const outfitIndexWxss = read("apps/wechat-miniprogram/pages/outfits/index/index.wxss");
const settingsIndexWxss = read("apps/wechat-miniprogram/pages/settings/index/index.wxss");
const wardrobeIndexWxss = read("apps/wechat-miniprogram/pages/wardrobe/index/index.wxss");
const wishlistIndexWxss = read("apps/wechat-miniprogram/pages/wishlist/index/index.wxss");
const tabUtils = read("apps/wechat-miniprogram/utils/custom-tab-bar.ts");
const motion = read("apps/wechat-miniprogram/styles/motion.wxss");
const button = read("apps/wechat-miniprogram/components/ui/button/index.wxss");
const iconButton = read("apps/wechat-miniprogram/components/ui/icon-button/index.wxss");
const tagWxml = read("apps/wechat-miniprogram/components/ui/tag/index.wxml");
const tagWxss = read("apps/wechat-miniprogram/components/ui/tag/index.wxss");

assert.match(tabTs, /selected:\s*-1/, "tab bar must not paint wardrobe as a default selection");
assert.doesNotMatch(tabTs, /setTimeout\s*\(/, "route selection must not rely on delayed correction timers");
assert.match(tabTs, /setData\(\{ selected, motionReady: false \}/, "selection and initial motion suppression must be atomic");
assert.match(tabTs, /selectionRenderPending = true/);
assert.match(tabTs, /selectionRenderPending = false;\s+this\.enableMotionAfterRender\(\)/, "motion may be enabled only after the selected render callback");
assert.match(tabTs, /if \(this\.switchingTab\) return/, "rapid taps must not dispatch duplicate tab switches");
assert.match(tabTs, /this\.switchingTab = false;\s+this\.syncSelected\(\)/, "a shown tab instance must release its switch guard");

const switchTab = tabTs.slice(tabTs.indexOf("switchTab(this"));
assert.doesNotMatch(
  switchTab.slice(0, switchTab.indexOf("wx.switchTab")),
  /setData\(\{\s*selected/,
  "the outgoing tab instance must not animate the destination selection",
);
assert.match(tabUtils, /tabBar\.selectTab\(selected\)/, "page lifecycle sync must use the transition-safe component method");
assert.match(tabWxml, /mini-tab--motion-ready/);
assert.match(tabWxml, /hover-stay-time="80"/);
assert.match(tabWxss, /mini-tab--motion-ready \.mini-tab__item/);
assert.match(tabWxss, /prefers-reduced-motion:\s*reduce/);
assert.match(tabWxss, /background:\s*rgba\(255,\s*255,\s*252,\s*0\.40\)/, "custom tab bar must expose more of the frosted backdrop");
assert.match(tabWxss, /backdrop-filter:\s*blur\(68rpx\) saturate\(1\.5\) brightness\(1\.05\)/, "custom tab bar must use stronger background diffusion");
assert.match(tabWxss, /\.mini-tab::before[\s\S]{0,500}linear-gradient\(135deg[\s\S]{0,300}inset 0 0 0 1rpx/, "custom tab bar must simulate angled edge refraction and depth");
for (const cardMaterial of [catalogCardWxss, sharedGlassWxss, outfitIndexWxss, settingsIndexWxss, wardrobeIndexWxss, wishlistIndexWxss]) {
  assert.match(cardMaterial, /background:\s*rgba\(255,\s*255,\s*252,\s*0\.52\)/, "primary mini-program cards must share the approved glass background");
  assert.match(cardMaterial, /backdrop-filter:\s*blur\(60rpx\) saturate\(1\.35\) brightness\(1\.04\)/, "primary mini-program cards must share the approved glass filter");
}

assert.doesNotMatch(motion, /transition:\s*all|transition-property:\s*all/, "shared motion must list only intended properties");
assert.doesNotMatch(motion, /\.pressable:active\s*\{[^}]*opacity/s, "pressing a card must not fade its image subtree");
assert.match(motion, /\.content-fab:active/);
assert.match(motion, /\.filter-chip:active/);
assert.match(motion, /\.catalog-card:active/);
assert.match(motion, /prefers-reduced-motion:\s*reduce/);
assert.doesNotMatch(button, /\.ui-button--hover\s*\{[^}]*opacity/s, "button hover must not flash by fading the whole control");
assert.doesNotMatch(iconButton, /\.ui-icon-button--hover\s*\{[^}]*opacity/s, "icon button hover must not flash by fading the whole control");
assert.match(tagWxml, /hover-class="ui-tag--hover"/);
assert.match(tagWxss, /\.ui-tag--hover\s*\{[^}]*transform/s);

let currentRoute = "pages/settings/index/index";
let componentDefinition: any;
const switchCalls: Array<{ url: string; fail?: () => void }> = [];
const runtime = {
  Component(definition: any) {
    componentDefinition = definition;
  },
  getCurrentPages() {
    return [{ route: currentRoute }];
  },
  wx: {
    switchTab(options: { url: string; fail?: () => void }) {
      switchCalls.push(options);
    },
  },
  exports: {},
  module: { exports: {} },
};
vm.runInNewContext(ts.transpileModule(tabTs, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, runtime);
const tabInstance: any = {
  data: structuredClone(componentDefinition.data),
  ...componentDefinition.methods,
  setData(patch: Record<string, unknown>, callback?: () => void) {
    Object.assign(this.data, patch);
    callback?.();
  },
};

componentDefinition.lifetimes.attached.call(tabInstance);
assert.equal(tabInstance.data.selected, 3, "first paint must select the current route, not wardrobe");
assert.equal(tabInstance.data.motionReady, true);
const homeTap = { currentTarget: { dataset: { index: 0, url: "/pages/home/index" } } };
tabInstance.switchTab(homeTap);
assert.equal(tabInstance.data.selected, 3, "the outgoing instance must retain its selected tab");
assert.equal(switchCalls.length, 1);
tabInstance.switchTab(homeTap);
assert.equal(switchCalls.length, 1, "rapid taps must be single-flight");

componentDefinition.pageLifetimes.show.call(tabInstance);
tabInstance.switchTab(homeTap);
assert.equal(switchCalls.length, 2, "showing the page again must release the single-flight guard");
currentRoute = "pages/home/index";
componentDefinition.pageLifetimes.show.call(tabInstance);
assert.equal(tabInstance.data.selected, 0);

runtime.wx.switchTab = (options: { url: string; fail?: () => void }) => {
  switchCalls.push(options);
  options.fail?.();
};
const settingsTap = { currentTarget: { dataset: { index: 3, url: "/pages/settings/index/index" } } };
tabInstance.switchTab(settingsTap);
tabInstance.switchTab(settingsTap);
assert.equal(switchCalls.length, 4, "a failed switch must release its guard for retry");

console.log("miniprogram navigation and motion contract passed");

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}
