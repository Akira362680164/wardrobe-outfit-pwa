import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HomeGenerationGate,
  buildHomeDateStrip,
  buildHomeGreeting,
  buildHomeLocationLabel,
  createStableMutationSession,
  homeBusinessWindow,
  shouldRequestMiniLocationPermission,
} from "../apps/wechat-miniprogram/pages/home/model";
import { MiniAbortController } from "../apps/wechat-miniprogram/utils/request-cancellation";
import {
  buildReplacementChoices,
  hasAcceptedPlanReadback,
  hasWornStateReadback,
  homeActionErrorMessage,
  isPlanCanceledReadback,
} from "../apps/wechat-miniprogram/pages/home/p2-model";
import type { MiniGarment, PlanningSnapshot } from "../apps/wechat-miniprogram/services/workspace";

const window = homeBusinessWindow(new Date("2026-07-18T15:59:59.000Z"));
assert.deepEqual(window, {
  today: "2026-07-18",
  tomorrow: "2026-07-19",
  dates: ["2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
});
assert.equal(buildHomeDateStrip(window).length, 7);
assert.equal(buildHomeDateStrip(window)[0]?.relativeLabel, "今天");
assert.equal(buildHomeDateStrip(window)[1]?.relativeLabel, "明天");
assert.match(buildHomeGreeting(new Date("2026-07-17T23:00:00.000Z")), /早上好/);

assert.equal(buildHomeLocationLabel(undefined), "未设置城市");
assert.equal(buildHomeLocationLabel({ displayName: "北京", source: "travel" }), "北京 · 行程");
assert.equal(buildHomeLocationLabel({ displayName: "杭州", source: "temporary_override" }), "杭州 · 临时");
assert.equal(buildHomeLocationLabel({ displayName: "上海", source: "home_city" }), "上海 · 常驻");

const gate = new HomeGenerationGate();
const first = gate.begin("account-a", "2026-07-18");
const second = gate.begin("account-a", "2026-07-19");
assert.equal(gate.isCurrent(first), false, "rapid date switching must reject stale results");
assert.equal(first.signal.aborted, true, "rapid date switching must abort the obsolete request task");
assert.equal(gate.isCurrent(second), true);
gate.reset("account-b");
assert.equal(gate.isCurrent(second), false, "account switch must invalidate previous account results");
assert.equal(second.signal.aborted, true, "account switch must abort the previous account request task");

const nativeAbortController = globalThis.AbortController;
try {
  (globalThis as { AbortController?: typeof AbortController }).AbortController = undefined;
  const miniRuntimeGate = new HomeGenerationGate();
  const miniRuntimeTicket = miniRuntimeGate.begin("account-mini", "2026-07-18");
  miniRuntimeGate.reset();
  assert.equal(miniRuntimeTicket.signal.aborted, true, "cancellation must work without a browser AbortController global");
} finally {
  (globalThis as { AbortController?: typeof AbortController }).AbortController = nativeAbortController;
}

let mutationCounter = 0;
const mutations = createStableMutationSession(() => `00000000-0000-4000-8000-${String(++mutationCounter).padStart(12, "0")}`);
const draft = { kind: "accept", recommendationId: "r1", candidateId: "c1" } as const;
assert.equal(mutations.idFor(draft), mutations.idFor({ ...draft }), "unchanged retry must reuse clientMutationId");
assert.notEqual(mutations.idFor({ ...draft, candidateId: "c2" }), mutations.idFor(draft), "changed draft must get a new clientMutationId");
assert.notEqual(mutations.idFor({ ...draft, selectedGarmentIds: ["g1", "g3"] }), mutations.idFor({ ...draft, selectedGarmentIds: ["g1", "g2"] }), "replace-one draft must get its own stable mutation id");
mutations.confirm(draft);
assert.notEqual(mutations.idFor(draft), "00000000-0000-4000-8000-000000000001", "committed draft must not reuse the completed mutation");

assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: true, purposeSeen: true, userTappedUseCurrent: true }), true);
assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: true, purposeSeen: false, userTappedUseCurrent: true }), false);
assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: false, purposeSeen: true, userTappedUseCurrent: true }), false);

const page = readFileSync("apps/wechat-miniprogram/pages/home/index.ts", "utf8");
const model = readFileSync("apps/wechat-miniprogram/pages/home/model.ts", "utf8");
const homeService = readFileSync("apps/wechat-miniprogram/services/home.ts", "utf8");
const canvasRuntime = readFileSync("apps/wechat-miniprogram/pages/home/weather-canvas-runtime.ts", "utf8");
const markup = readFileSync("apps/wechat-miniprogram/pages/home/index.wxml", "utf8");
const styles = readFileSync("apps/wechat-miniprogram/pages/home/index.wxss", "utf8");
const tokens = readFileSync("apps/wechat-miniprogram/styles/tokens.wxss", "utf8");
const tabStyles = readFileSync("apps/wechat-miniprogram/custom-tab-bar/index.wxss", "utf8");
const visualFixture = readFileSync("scripts/fixtures/miniprogram-home-p4-visual.ts", "utf8");
assert.doesNotMatch(page, /openWardrobe\(\);/, "home must no longer redirect to the wardrobe tab");
assert.doesNotMatch(page, /on(?:Load|Show)[\s\S]{0,900}getLocation\s*\(/, "home lifecycle must not automatically request location");
assert.match(page, /openSetting[\s\S]+再次主动点击“使用当前位置”/, "settings return must not trigger an automatic location read");
assert.match(markup, /推荐/);
assert.match(markup, /衣橱/);
assert.match(markup, /scroll-x/);
assert.match(markup, /canvas[^>]+type="2d"/);
assert.match(markup, /<view class="weather-copy-overlay weather-copy-overlay--today">/, "today weather copy must remain above decorative Canvas");
assert.match(markup, /<canvas[^>]+type="2d"[^>]*\/>\s*<view class="weather-copy-overlay weather-copy-overlay--today">/, "today weather copy must live directly after the same-layer Canvas inside the same card");
assert.doesNotMatch(markup, /<canvas[^>]+wx:if="\{\{canvasVisible\}\}"/, "the same Canvas node must stay mounted so viewport changes cannot orphan a native compositor layer");
assert.match(markup, /<canvas[^>]+class="[^"]+\{\{canvasVisible \? 'is-visible' : 'is-hidden'\}\}[^"]*"/, "Canvas visibility must be switched without detaching the node");
assert.match(markup, /<view class="weather-temperature weather-temperature--small">/, "today and tomorrow temperatures must use the same-layer view renderer");
assert.match(markup, /<view class="weather-summary">/, "today and tomorrow summaries must use the same-layer view renderer");
assert.match(markup, /<view class="weather-meta">/, "today and tomorrow metadata must use the same-layer view renderer");
assert.doesNotMatch(markup, /<cover-view[^>]+class="weather-(?:copy|row|temperature|summary|meta)/, "Canvas 2D weather copy must not create native cover-view layers that can survive viewport changes");
assert.doesNotMatch(markup, /weather-copy-overlay \{\{canvasVisible/, "Canvas visibility must never hide legal weather text");
assert.match(markup, /class="recommendation-toolbar"/, "no-plan recommendation heading and date strip must share the App toolbar");
assert.match(markup, /class="recommendation-actions"/, "recommendation cards must expose the App primary and detail action pair");
assert.match(markup, /bindtap="applyRecommendation"/, "the card primary action must submit directly instead of masquerading as a detail button");
assert.match(markup, /ui-icon name="chevron-right"[^>]+/, "the recommendation detail action must use the shared chevron icon");
assert.match(markup, /class="home-page" style="\{\{fontStyle\}\}"/, "home must bind the system accessibility font token");
assert.match(page, /fontStyle:\s*currentAccessibilityFontStyle\(\)/, "home must initialize the system accessibility font token");
assert.match(page, /plan\.status === "worn" \? "今天已穿" : "当日穿搭"/, "home plan states must retain the approved readable titles");
assert.match(tokens, /--hit-target-min:\s*44px/, "the shared mini-program touch target must not scale below 44px");
assert.match(styles, /\.settings-action,[^{]+\{[^}]*min-height:\s*var\(--hit-target-min\)/, "location settings actions must retain the shared 44px minimum hit target");
assert.match(styles, /\.city-search button\s*\{[^}]*min-height:\s*var\(--hit-target-min\)/, "location search must retain the shared 44px minimum hit target");
assert.match(styles, /\.plan-actions button\s*\{[^}]*min-height:\s*var\(--hit-target-min\)/, "plan actions including cancel-worn must retain the shared 44px minimum hit target");
assert.match(styles, /\.weather-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/, "today and tomorrow weather cards must use equal resilient columns");
assert.match(styles, /\.weather-card\s*\{[^}]*width:\s*100%/, "each weather card must fill its equal grid column");
assert.match(styles, /\.weather-card--today\s*\{[^}]*background:/, "today must retain a full-card background beneath Canvas");
assert.doesNotMatch(styles, /\.weather-card--today\.is-static\s*\{/, "today's full-card background must not disappear when Canvas is active");
assert.match(styles, /\.weather-copy-overlay__temperature\s*\{[^}]*color:\s*#1d2228[^}]*font-size:\s*46rpx[^}]*font-weight:\s*900/, "today temperature must optically compensate for Canvas compositing");
assert.match(styles, /\.weather-copy-overlay__summary\s*\{[^}]*color:\s*#1d2228[^}]*font-size:\s*26rpx[^}]*font-weight:\s*800[^}]*line-height:\s*34rpx/, "today summary must optically match tomorrow after Canvas compositing");
assert.match(canvasRuntime, /renderWeatherScene\([^;]+;\s*clearWeatherCopyLane\(context,\s*width,\s*height\)/, "every Canvas frame must clear the legal weather copy lane after drawing");
assert.match(canvasRuntime, /globalCompositeOperation\s*=\s*"destination-out"[\s\S]+addColorStop\(\.64,\s*"rgba\(0,0,0,1\)"\)[\s\S]+addColorStop\(\.88,\s*"rgba\(0,0,0,0\)"\)/, "the copy lane must stay transparent through the text area and feather into the live weather edge");
assert.match(canvasRuntime, /destroy\(\)\s*\{[^}]*pause\(\);[^}]*clearRect\(0,\s*0,\s*width,\s*height\)/, "destroy must clear the stable Canvas layer before hiding it");
assert.match(canvasRuntime, /canvas\.width\s*=\s*1;\s*canvas\.height\s*=\s*1/, "destroy must shrink and reset the Canvas backing store plus its clip/transform state");
assert.match(styles, /\.weather-canvas-host\.is-hidden\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/, "inactive Canvas must be visually hidden while its stable node stays mounted");
assert.match(styles, /\.weather-canvas-host\.is-visible\s*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible/, "reactivated Canvas must restore visibility on the same node");
assert.match(styles, /\.weather-copy-overlay__row\s*\{[^}]*color:\s*#1d2228/, "today weather labels must not use low-contrast gray");
assert.match(styles, /\.weather-copy-overlay__meta\s*\{[^}]*color:\s*rgba\(29,34,40,.82\)[^}]*font-size:\s*22rpx[^}]*font-weight:\s*700/, "today metadata must retain readable contrast after Canvas compositing");
assert.match(styles, /\.weather-copy-overlay--today\s*\{[^}]*width:\s*100%/, "today weather copy must fill its equal-width card");
assert.doesNotMatch(markup, /home-fab|content-fab/, "home must use the shared four-tab plus-center-create bar, not a second floating FAB");
assert.match(page, /selectCustomTab\(this,\s*0\)/, "home must select the shared bottom navigation's Home tab");
assert.match(page, /openRecommendationSheet[\s\S]+setCustomTabHidden\(this, true\)/, "details sheets must not be covered by the shared bottom navigation");
assert.match(page, /openLocationSheet[\s\S]+setCustomTabHidden\(this, true\)/, "location sheets must not be covered by the shared bottom navigation");
assert.match(page, /openCreateSheet[\s\S]{0,180}setCustomTabHidden\(this, true\)/, "the center create sheet must hide the shared bottom navigation");
assert.doesNotMatch(markup, /主计划|保护|覆盖|自动更换|服务端|事务|读回|正式合同/, "home copy must not expose defensive or implementation terms");
assert.doesNotMatch(page, /主计划已保护|服务器读回|自动更换|推荐不会覆盖/, "home state copy must describe only the user-visible state");
assert.match(page, /暂时无法获取位置，请稍后重试或搜索城市/);
assert.doesNotMatch(page, /locationMessage:\s*messageOf\(error,[^\n]+位置/, "raw location plugin errors must not reach the UI");
assert.doesNotMatch(styles, />\s*\*/, "WXSS does not accept a universal child selector");
assert.match(styles, /\.weather-canvas-host[^}]+z-index:\s*0/, "Canvas must remain behind the weather copy");
assert.match(styles, /\.location-entry[^}]+justify-content:\s*flex-start/, "the single city entry must align to the App's left edge");
assert.match(styles, /\.weather-canvas-host[^}]+inset:\s*0/, "today Canvas must fill the complete weather card");
assert.match(styles, /\.weather-copy-overlay\s*\{[^}]+opacity:\s*1/, "static and fallback weather states must retain native copy");
assert.doesNotMatch(styles, /weather-copy-overlay\.is-canvas-copy|weather-copy-overlay[^}]+opacity:\s*0/, "native weather text must never be hidden behind Canvas");
assert.match(styles, /\.weather-shell[^}]+background:\s*var\(--color-surface\)/, "the weather module must use the App surface without a gradient pedestal");
assert.match(styles, /\.section-switch[^}]+height:\s*auto[^}]+min-height:\s*104rpx[^}]+border-radius:\s*28rpx/, "the segmented control shell must grow when the fixed touch target exceeds its rpx baseline");
assert.match(styles, /\.section-switch__item[^}]+height:\s*88rpx[^}]+min-height:\s*var\(--hit-target-min\)[^}]+border-radius:\s*22rpx/, "the segmented buttons must never scale below the shared 44px hit target");
assert.match(tabStyles, /\.mini-tab__create[^}]+min-width:\s*var\(--hit-target-min\)[^}]+min-height:\s*var\(--hit-target-min\)/, "the center create action must never scale below the shared 44px hit target");
assert.match(styles, /\.recommendation-toolbar[^}]+grid-template-columns:\s*auto minmax\(0,1fr\)/, "date strip must sit beside the App heading when no plan exists");
assert.match(styles, /\.recommendation-detail-action[^}]+width:\s*96rpx/, "recommendation detail must use the App 48px square control");
assert.match(visualFixture, /recommendationCards:\s*\[recommendationStable, recommendationFresh, recommendationComfort\]/, "visual fixture must prove the three server recommendation cards");
assert.match(visualFixture, /temperature:\s*"31°",\s*high:\s*"最高 32°"/, "today fixture must use current temperature plus the App high-temperature row");
assert.match(visualFixture, /"canvas-failure"[\s\S]+canvasVisible:\s*false/, "visual evidence must cover Canvas failure with native copy");
assert.match(visualFixture, /create:\s*\{[\s\S]+createSheetOpen:\s*true/, "visual evidence must cover the center create sheet without the tab bar");
assert.match(visualFixture, /stale:[\s\S]+high:\s*"最高 32°"[\s\S]+weatherAttribution:\s*"[^"]*缓存 7\/18 22:10"/, "stale evidence must retain the high and cache update time");
assert.match(visualFixture, /locationless:[\s\S]+tomorrowWeather:[\s\S]+status:\s*"unavailable"[\s\S]+weatherAttribution:\s*""/, "locationless evidence must remove provider weather from both days");
assert.match(styles, /\.city-search input\s*\{[^}]+box-sizing:\s*border-box/, "city search must not overflow narrow sheets");
assert.equal(page.match(/\n\s*openIntake\(/g)?.length, 1, "home must expose one intake handler");
assert.doesNotMatch(model, /from "@wardrobe\//, "mini runtime must consume the generated shared bridge");
assert.doesNotMatch(homeService, /from "@wardrobe\//, "mini runtime must not require workspace packages in DevTools");
assert.doesNotThrow(() => readFileSync("apps/wechat-miniprogram/generated/wardora-home-contracts.js"), "generated contracts bridge must exist");
assert.doesNotThrow(() => readFileSync("apps/wechat-miniprogram/generated/wardora-weather-canvas.js"), "generated Canvas kernel must exist");
assert.match(homeService, /\/api\/recommendations\/daily\/.*\/accept/);
assert.match(homeService, /\/api\/recommendations\/plans\/cancel-primary/);
assert.match(homeService, /\/api\/recommendations\/actions\/reject/);
assert.match(homeService, /\/mark-worn/);
assert.match(homeService, /\/cancel-worn/);
assert.match(markup, /设为今日穿搭/);
assert.match(markup, /替换哪一件/);
assert.match(markup, /不喜欢/);
assert.match(markup, /保存为我的套装/);
assert.match(markup, /确认今天穿了这套/);
assert.match(markup, /撤销已穿/);
assert.match(markup, /恢复备选/);
assert.doesNotMatch(markup, /天气回退|服务端|事务|读回|主计划|保护|不会自动更换/);
assert.match(canvasRuntime, /WEATHER_CANVAS_TARGET_FPS/);
assert.match(canvasRuntime, /Math\.min\(WEATHER_CANVAS_MAX_DPR/);
assert.doesNotMatch(canvasRuntime, /drawWeatherCopy|input\.copy/, "the shared Canvas host must draw decoration only; native controls own legal weather copy");
assert.match(canvasRuntime, /renderWeatherScene\(context, scene, width, height, time, animate, !dynamic, true\)/, "mini host must preserve the shared effect order on a transparent ambient layer");
assert.doesNotMatch(canvasRuntime, /setData/);

const replacementFixture = buildReplacementChoices(
  { candidateId: "c1", garmentIds: ["g1", "g2"], garments: [{ id: "g1", category: "tops" }, { id: "g2", category: "pants" }] },
  0,
  [
    { id: "g3", category: "tops", status: "active", imageUrl: "https://image.test/3", name: "可替换上装" },
    { id: "g4", category: "tops", status: "repair", imageUrl: "https://image.test/4", name: "维修上装" },
    { id: "g5", category: "pants", status: "active", imageUrl: "https://image.test/5", name: "不同类别" },
  ] as unknown as MiniGarment[],
);
assert.deepEqual(replacementFixture.map((item) => item.id), ["", "g3"], "replace-one choices must stay active, imaged, same-category and server-known");

const acceptedPlan = planFixture({ id: "p-new", date: "2026-07-18", isPrimary: true, role: "primary", status: "planned", garmentIds: ["g2", "g1"], rawPayload: { recommendationCandidateId: "c1" } });
const backupPlan = planFixture({ id: "p-backup", date: "2026-07-18", isPrimary: false, role: "backup", status: "planned" });
const acceptedPlanning = planningFixture([acceptedPlan, backupPlan]);
assert.equal(hasAcceptedPlanReadback(acceptedPlanning, "2026-07-18", "c1", ["g1", "g2"], "p-new"), true, "accept success requires a matching server readback");
assert.equal(isPlanCanceledReadback(planningFixture([{ ...backupPlan, isPrimary: true, role: "primary" }]), "2026-07-18", "p-new", "p-backup"), true, "cancel+restore requires the selected backup to become primary");
assert.equal(hasWornStateReadback(planningFixture([{ ...acceptedPlan, status: "worn" }]), "p-new", true), true);
assert.match(homeActionErrorMessage(new Error("409 revision conflict")), /另一处更新/);
assert.match(homeActionErrorMessage(new Error("request:fail timeout")), /尚未确认成功/);
assert.doesNotMatch(homeActionErrorMessage(new Error("secret backend trace")), /secret|backend|trace/);

void testRequestCancellation()
  .then(() => console.log("miniprogram home P4 fixture tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

async function testRequestCancellation() {
  let requestTaskAborted = false;
  (globalThis as any).getApp = () => ({ globalData: { apiBaseUrl: "https://api.example.test" } });
  (globalThis as any).wx = {
    getStorageSync: () => "",
    setStorageSync: () => undefined,
    removeStorageSync: () => undefined,
    showToast: () => undefined,
    request: (options: any) => ({
      abort() {
        requestTaskAborted = true;
        options.fail({ errMsg: "request:fail abort" });
      },
    }),
  };
  const { request } = await import("../apps/wechat-miniprogram/services/http");
  const requestController = new MiniAbortController();
  const pendingRequest = request({ path: "/api/test", toast: false, signal: requestController.signal });
  requestController.abort();
  await assert.rejects(pendingRequest, /请求已取消/);
  assert.equal(requestTaskAborted, true, "generation cancellation must abort the underlying wx.request task");
}

function planningFixture(outfitPlanEntries: PlanningSnapshot["outfitPlanEntries"]): PlanningSnapshot {
  return { outfits: [], calendarPlans: [], outfitPlanEntries };
}

function planFixture(overrides: Partial<PlanningSnapshot["outfitPlanEntries"][number]>): PlanningSnapshot["outfitPlanEntries"][number] {
  return {
    id: "p1", revision: 1, date: "2026-07-18", outfitId: "", sourceType: "daily_recommendation",
    garmentIds: ["g1", "g2"], itemIds: [], garmentSnapshots: [], actualGarmentIds: [], actualGarmentSnapshots: [],
    unavailableGarmentIds: [], availability: "available", actualOutfitId: "", calendarPlanId: "", status: "planned",
    title: "", scene: "", weatherNote: "", notes: "", isPrimary: true, isPrimaryActual: true, role: "primary",
    sortOrder: 0, rawPayload: {}, createdAt: "2026-07-18T00:00:00Z", updatedAt: "2026-07-18T00:00:00Z",
    ...overrides,
  };
}
