import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildOutfitPlanDayCard,
  toPlanToneViews,
} from "../../../apps/wechat-miniprogram/utils/outfit-plan-day";
import type {
  MiniCalendarPlan,
  MiniOutfit,
  MiniOutfitPlanEntry,
} from "../../../apps/wechat-miniprogram/services/workspace";

const weekWxml = read("apps/wechat-miniprogram/pages/outfits/index/index.wxml");
const monthWxml = read("apps/wechat-miniprogram/pages/outfits/calendar/index.wxml");
const weekTs = read("apps/wechat-miniprogram/pages/outfits/index/index.ts");
const monthTs = read("apps/wechat-miniprogram/pages/outfits/calendar/index.ts");
const weekWxss = read("apps/wechat-miniprogram/pages/outfits/index/index.wxss");
const monthWxss = read("apps/wechat-miniprogram/pages/outfits/calendar/index.wxss");
const stripWxss = read("apps/wechat-miniprogram/components/domain/plan-tone-strip/index.wxss");
const dayCardWxss = read("apps/wechat-miniprogram/components/domain/outfit-plan-day-card/index.wxss");
const detailWxml = read("apps/wechat-miniprogram/pages/outfits/detail/index.wxml");
const detailTs = read("apps/wechat-miniprogram/pages/outfits/detail/index.ts");
const composeTs = read("apps/wechat-miniprogram/pages/outfits/compose/index.ts");
const tripEditTs = read("apps/wechat-miniprogram/pages/trips/edit/index.ts");
const tripDetailTs = read("apps/wechat-miniprogram/pages/trips/detail/index.ts");

for (const source of [weekWxml, monthWxml]) {
  assert.match(source, /<plan-tone-strip/);
  assert.match(source, /<outfit-plan-day-card/);
  assert.doesNotMatch(source, /week-plan-card|selected-card|entry-card|slice\(0,\s*2\)/);
}
assert.match(stripWxss, /flex:\s*1\s+1\s+0/);
assert.match(stripWxss, /width:\s*100%/);
assert.match(dayCardWxss, /grid-template-columns:\s*repeat\(/);
assert.match(dayCardWxss, /white-space:\s*nowrap/);
assert.match(weekWxml, /hero-control--plan/);
assert.match(monthWxml, /centered-title/);
assert.match(monthWxml, /month-plan-link/);
assert.match(monthWxml, /calendar-day__plus/);
assert.match(weekWxss, /\.hero-control--plan[\s\S]*width:\s*164rpx[\s\S]*background:\s*#355C7D/);
assert.match(weekWxss, /\.week-day > plan-tone-strip[\s\S]*width:\s*64rpx/);
assert.match(monthWxss, /\.month-plan-link[\s\S]*left:\s*calc\(75% - 20rpx\)/);
assert.match(weekWxss, /height:\s*160rpx/);
assert.match(monthWxss, /\.calendar-day[\s\S]*height:\s*136rpx/);
assert.match(monthWxss, /\.calendar-day > plan-tone-strip[\s\S]*width:\s*64rpx/);
assert.doesNotMatch(monthWxss, /\.calendar-day--active[\s\S]*height:\s*160rpx/);
assert.match(weekTs, /deleteWorkspaceEntity\("outfit-plans"/);
assert.match(monthTs, /deleteWorkspaceEntity\("outfit-plans"/);
assert.doesNotMatch(weekTs.match(/onLoad\(\)[\s\S]*?onShow\(\)/)?.[0] || "", /loadOutfits\(/, "outfit tab must not load in both onLoad and onShow");
for (const source of [weekTs, monthTs]) {
  assert.match(source, /runRuntimeDomainRefresh\("planning"/);
  assert.match(source, /hasLoadedPlanning/, "an empty but successfully loaded planning snapshot must remain fresh");
  assert.match(source, /initialLoading:\s*!hasData/);
  assert.match(source, /refreshing:\s*hasData/);
  assert.match(source, /markRuntimeDomainDirty\("planning"\)/);
  assert.match(source, /getRuntimeRefreshSnapshot\("planning"\)\.dirty/, "a stale in-flight snapshot must be retried before rendering");
}
assert.match(weekTs, /getRuntimeSessionScope/, "switching accounts must clear the previous user's outfits");
assert.match(weekWxml, /wx:if="\{\{initialLoading\}\}"/);
assert.match(monthWxml, /wx:if="\{\{initialLoading\}\}"/);
assert.match(detailWxml, /<item-detail-shell/);
assert.doesNotMatch(detailWxml, /<detail-shell/);
assert.match(detailWxml, /wx:if="\{\{initialLoading\}\}"/);
assert.match(detailTs, /detailRequestId/);
assert.match(detailTs, /getRuntimeRefreshSnapshot\("outfits"\)\.version/);
assert.match(composeTs, /markRuntimeDomainDirty\("outfits"\)/);
assert.match(composeTs, /markRuntimeDomainDirty\("planning"\)/);
assert.match(tripEditTs, /markRuntimeDomainDirty\("planning"\)/);
assert.match(tripDetailTs, /detailRequestId/);
for (const label of ["信息", "组成", "AI建议", "记录"]) assert.match(detailWxml, new RegExp(label));

const plans = Array.from({ length: 5 }, (_, index) => plan(index + 1));
for (const count of [1, 2, 3, 5]) assert.equal(toPlanToneViews(plans.slice(0, count)).length, count);

const outfit = makeOutfit("outfit-1");
const scenarios: Array<{ date: string; entries: MiniOutfitPlanEntry[]; labels: string[]; primary: boolean; plans?: MiniCalendarPlan[]; hasPlan?: boolean }> = [
  { date: "2026-07-12", entries: [entry("worn", "outfit-1")], labels: ["删除已穿"], primary: true },
  { date: "2026-07-13", entries: [entry("planned", "outfit-1")], labels: ["标记已穿", "更改套装", "添加备选"], primary: true },
  { date: "2026-07-13", entries: [entry("worn", "outfit-1")], labels: ["删除已穿", "更改套装", "添加备选"], primary: true },
  { date: "2026-07-14", entries: [entry("planned", "outfit-1")], labels: ["更改套装", "添加备选"], primary: true },
  { date: "2026-07-12", entries: [entry("planned", "outfit-1")], labels: ["补记已穿", "查看计划"], primary: false, hasPlan: true },
  { date: "2026-07-13", entries: [], labels: ["安排穿搭"], primary: false, plans: [], hasPlan: false },
];
for (const scenario of scenarios) {
  const card = buildOutfitPlanDayCard({ dateKey: scenario.date, todayKey: "2026-07-13", plans: scenario.plans ?? plans.slice(0, 3), entries: scenario.entries, outfits: [outfit] });
  assert.deepEqual(card.primary ? card.actions.map((action) => action.label) : card.empty?.actions.map((action) => action.label), scenario.labels);
  assert.equal(Boolean(card.primary), scenario.primary);
  if (!card.primary) {
    assert.equal(card.empty?.copy, "");
    assert.equal(card.empty?.hasPlan, scenario.hasPlan);
  }
  assert.equal(card.hasPlans, scenario.plans ? scenario.plans.length > 0 : true);
}

const secondaryPages = [
  "wardrobe/detail", "wardrobe/edit", "wardrobe/search", "wardrobe/statistics",
  "outfits/detail", "outfits/compose", "outfits/calendar", "trips/detail", "trips/edit",
  "wishlist/detail", "wishlist/edit", "settings/ai-key", "settings/account", "settings/account/edit",
  "settings/account-deletion", "settings/change-password", "settings/privacy", "settings/diagnostics",
  "settings/about", "settings/profile", "settings/tryon-photos", "recommendations/index", "try-on/index", "intake/result", "webview/agreement", "webview/privacy",
];
for (const page of secondaryPages) {
  const wxml = read(`apps/wechat-miniprogram/pages/${page}/index.wxml`);
  const json = read(`apps/wechat-miniprogram/pages/${page}/index.json`);
  assert.match(wxml, /sub-page-top-bar|item-detail-shell|item-edit-shell/, `${page} must consume the shared safe-area shell`);
  if (!/item-detail-shell|item-edit-shell/.test(wxml)) assert.match(json, /sub-page-top-bar/);
}

console.log("mini outfit calendar UI contract passed");

function read(path: string): string { return fs.readFileSync(path, "utf8"); }

function plan(index: number): MiniCalendarPlan {
  const tones: MiniCalendarPlan["tone"][] = ["denim", "moss", "clay", "amber", "rose"];
  return {
    id: `plan-${index}`, revision: 1, type: "custom", typeLabel: "计划", title: `计划 ${index}`,
    startDate: "2026-07-10", endDate: "2026-07-20", tone: tones[index - 1]!, destination: "",
    activities: [], weatherNote: "", notes: "", packingEnabled: false, rawPayload: {},
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function entry(status: MiniOutfitPlanEntry["status"], outfitId: string): MiniOutfitPlanEntry {
  return {
    id: `${status}-entry`, revision: 1, date: status === "worn" ? "2026-07-12" : "2026-07-13", outfitId,
    actualOutfitId: outfitId, calendarPlanId: "plan-1", status, title: "测试套装", scene: "通勤", weatherNote: "", notes: "",
    isPrimary: true, isPrimaryActual: status === "worn", role: "primary", sortOrder: 0, rawPayload: {},
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function makeOutfit(id: string): MiniOutfit {
  return {
    id, revision: 1, name: "测试套装", itemCount: 2, itemIds: [], itemEntityIds: [], imageUrl: "", itemImages: [],
    seasonText: "四季", sceneText: "通勤", favorite: false, wornDates: [], wornToday: false, wearSummary: "未穿过",
    lastWornText: "暂无记录", updatedAt: "2026-07-01T00:00:00.000Z",
  };
}
