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
assert.equal(gate.isCurrent(second), true);
gate.reset("account-b");
assert.equal(gate.isCurrent(second), false, "account switch must invalidate previous account results");

let mutationCounter = 0;
const mutations = createStableMutationSession(() => `00000000-0000-4000-8000-${String(++mutationCounter).padStart(12, "0")}`);
const draft = { kind: "accept", recommendationId: "r1", candidateId: "c1" } as const;
assert.equal(mutations.idFor(draft), mutations.idFor({ ...draft }), "unchanged retry must reuse clientMutationId");
assert.notEqual(mutations.idFor({ ...draft, candidateId: "c2" }), mutations.idFor(draft), "changed draft must get a new clientMutationId");
mutations.confirm(draft);
assert.notEqual(mutations.idFor(draft), "00000000-0000-4000-8000-000000000001", "committed draft must not reuse the completed mutation");

assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: true, purposeSeen: true, userTappedUseCurrent: true }), true);
assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: true, purposeSeen: false, userTappedUseCurrent: true }), false);
assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: false, purposeSeen: true, userTappedUseCurrent: true }), false);

const page = readFileSync("apps/wechat-miniprogram/pages/home/index.ts", "utf8");
const markup = readFileSync("apps/wechat-miniprogram/pages/home/index.wxml", "utf8");
assert.doesNotMatch(page, /openWardrobe\(\);/, "home must no longer redirect to the wardrobe tab");
assert.doesNotMatch(page, /on(?:Load|Show)[\s\S]{0,900}getLocation\s*\(/, "home lifecycle must not automatically request location");
assert.match(markup, /推荐/);
assert.match(markup, /衣橱/);
assert.match(markup, /scroll-x/);
assert.match(markup, /canvas[^>]+type="2d"/);

console.log("miniprogram home P4 fixture tests passed");
