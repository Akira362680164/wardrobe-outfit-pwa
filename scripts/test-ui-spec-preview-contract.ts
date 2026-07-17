import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const md = readFileSync(join(root, "docs/designs/wardrobe-ui-spec.md"), "utf8");
const html = readFileSync(join(root, "docs/designs/wardrobe-ui-spec.html"), "utf8");

const frontMatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

assert.match(frontMatter, /^version:\s+v0\.2-final$/m);
assert.match(html, /<title>[^<]*v0\.2-final[^<]*<\/title>/);
assert.ok(html.includes("DO NOT EDIT BY HAND"));
assert.ok(html.includes("Source SHA256"));
assert.ok(!html.includes("/Users/"));
assert.ok(!html.includes("#f0f2ee"));
assert.ok(!html.includes("⌕"));
assert.ok(!html.includes("✦"));

const markdownPartCount = (md.match(/^###\s+/gm) ?? []).length;
const htmlPartVisualCount = (html.match(/class="part-visual"/g) ?? []).length;
assert.equal(htmlPartVisualCount, markdownPartCount, "each ### spec part must have one visual module");
assert.ok(!html.includes('data-visual="generic-part"'), "spec parts must use concrete visual modules");

const markdownSections = md.split(/^##\s+/m).slice(1);
const sectionsWithoutParts = markdownSections.filter((section) => !/^###\s+/m.test(section)).length;
const sectionVisualCount = (html.match(/class="module-visual"/g) ?? []).length;
assert.equal(sectionVisualCount, sectionsWithoutParts, "sections without ### parts must have section visuals");

for (const visual of [
  'data-visual="detail-media"',
  'data-visual="color-fields"',
  'data-visual="temperature-range"',
  'data-visual="icon-library"',
  'data-visual="concentric-radius"',
  'data-visual="glass-layer"',
  "temperature-view-window",
  "production-shot-grid",
  "toast-stage",
  "toast-style-board",
]) {
  assert.ok(html.includes(visual), `missing required visual example: ${visual}`);
}

assert.ok(md.includes("不使用满高竖条"), "toast spec must reject full-height status bars");
assert.ok(md.includes("上下居中"), "toast spec must require vertically centered icons");
assert.ok(html.includes("尚未配置 MiniMax Key"), "toast visual must include MiniMax key missing state");
assert.ok(html.includes("前往设置"), "toast visual must include direct settings action");
assert.ok(html.includes("three-line"), "toast visual must include a real three-line state");
assert.ok(html.includes("当前页面草稿已完整保留"), "three-line toast must use long copy");
assert.ok(!html.includes(".spec-toast .toast-copy strong"), "toast visual must not use title/body strong styling");
assert.ok(!html.includes("mini-toast"), "legacy mini toast visual must not remain");
assert.ok(html.includes("background: transparent;"), "topbar demo must not draw a solid white strip");
for (const marker of [
  "新首页生产目标（P1 已有内部只读 route，生产默认仍未切换）",
  "<code>home_feed</code>",
  "生产默认仍为 <code>wardrobe_home</code>",
  "首页内部只保留“推荐 / 衣橱”",
  "今天使用 <code>now.weatherCode</code>",
  "明天始终静态",
  "计划保护是首页的最高展示优先级",
  "取消 primary 与可选提升 backup",
]) assert.ok(html.includes(marker), `missing new-home P0 UI contract: ${marker}`);

for (const marker of [
  "单一地点入口与天气卡跳转",
  "home-empty-locationless", "home-empty-forecast", "home-ready-locationless", "home-ready-forecast",
  "home-workspace-error", "home-weather-error", "home-recommendation-error",
  "未来七日按需加载与旧请求取消",
  "today/tomorrow 预读", "abort + generation token",
  "today 可动 / tomorrow 静态", "1 rAF", "~29 FPS", "DPR ≤ 2",
  "reduced-motion → 120–160ms cross-fade / static",
  "protected_plan / actual_wear 优先",
  "QWeather <code>999</code>", "Canvas 故障",
]) assert.ok(html.includes(marker), `missing concrete new-home P0.1 contract: ${marker}`);

for (const selector of [
  'data-visual="home-p01-contract"',
  'data-home-contract="single-location-entry"',
  'data-home-contract="weather-card-navigation"',
  'data-home-contract="seven-day-abort"',
  'data-home-contract="weather-runtime"',
  'data-home-contract="reduced-motion"',
  'data-home-contract="plan-protection"',
]) assert.ok(html.includes(selector), `missing rendered P0.1 preview fixture: ${selector}`);

const productionScreenshots = [
  "auth_login_390_top.png",
  "auth_register_390_top.png",
  "confirm_delete_sheet_390_top.png",
  "wardrobe_home_390_top.png",
  "garment_detail_390_top.png",
  "garment_detail_390_info.png",
  "garment_detail_390_bottom.png",
  "intake_single_step1_empty_390_top.png",
  "intake_single_step1_imported_390_top.png",
  "intake_single_confirm_390_top.png",
  "intake_single_confirm_390_bottom.png",
  "outfit_home_390_top.png",
  "outfit_detail_390_top.png",
  "outfit_detail_390_info.png",
  "outfit_detail_390_bottom.png",
  "outfit_calendar_390_top.png",
  "wishlist_home_390_top.png",
  "wishlist_detail_390_top.png",
  "wishlist_detail_390_info.png",
  "wishlist_detail_390_bottom.png",
  "settings_home_390_top.png",
];

assert.equal((html.match(/class="reference-shot"/g) ?? []).length, productionScreenshots.length, "product practice must include one reference card per production screenshot");
assert.equal((html.match(/class="reference-notes"/g) ?? []).length, productionScreenshots.length, "each production reference card must include optimization notes");

for (const filename of productionScreenshots) {
  assert.ok(html.includes(`v03-alpha-real-screenshots/${filename}`), `missing production screenshot in HTML: ${filename}`);
  assert.ok(existsSync(join(root, "docs/designs/v03-alpha-real-screenshots", filename)), `missing production screenshot asset: ${filename}`);
  assert.ok(html.includes(`data-page-state="${filename.replace(/\.png$/, "")}"`), `missing production page state marker: ${filename}`);
}

for (const title of [
  "Design Tokens",
  "Viewport 与 Safe Area",
  "App Shell",
  "Route 与页面状态矩阵",
  "Overlay / Sheet / Dialog",
  "核心组件 Contract",
  "领域 UI 映射",
  "录入流程状态机",
  "AI 与系统状态",
  "通知 Toast",
  "无障碍",
  "Known Deviations / UI Debt",
  "文档治理",
  "产品视觉方案实操",
  "验收与测试映射",
]) {
  assert.ok(html.includes(title), `missing UI spec section: ${title}`);
}

assert.ok(md.includes("background.appAmbient"), "missing global ambient background token in markdown");
assert.ok(html.includes("background.appAmbient"), "missing global ambient background token in HTML");
assert.ok(html.includes("--app-ambient"), "missing app ambient CSS variable in generated preview");
assert.ok(html.includes("所有页面统一使用登录页这套低饱和渐变底层"), "missing ambient background visual guidance");

for (const contractMarker of [
  "D1-Contracts 动效与浮层防回归扫描",
  "test:logic:ui-motion-contract",
  "fixed inset-0",
  "OverlayRoot",
  "active:scale-*",
  "test:logic:ui-contracts",
]) {
  assert.ok(md.includes(contractMarker), `missing D1 motion contract in markdown: ${contractMarker}`);
  assert.ok(html.includes(contractMarker), `missing D1 motion contract in generated HTML: ${contractMarker}`);
}

console.log("ui spec preview contract: passed");
