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
mutations.confirm(draft);
assert.notEqual(mutations.idFor(draft), "00000000-0000-4000-8000-000000000001", "committed draft must not reuse the completed mutation");

assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: true, purposeSeen: true, userTappedUseCurrent: true }), true);
assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: true, purposeSeen: false, userTappedUseCurrent: true }), false);
assert.equal(shouldRequestMiniLocationPermission({ sheetOpened: false, purposeSeen: true, userTappedUseCurrent: true }), false);

const page = readFileSync("apps/wechat-miniprogram/pages/home/index.ts", "utf8");
const markup = readFileSync("apps/wechat-miniprogram/pages/home/index.wxml", "utf8");
const styles = readFileSync("apps/wechat-miniprogram/pages/home/index.wxss", "utf8");
assert.doesNotMatch(page, /openWardrobe\(\);/, "home must no longer redirect to the wardrobe tab");
assert.doesNotMatch(page, /on(?:Load|Show)[\s\S]{0,900}getLocation\s*\(/, "home lifecycle must not automatically request location");
assert.match(page, /openSetting[\s\S]+再次主动点击“使用当前位置”/, "settings return must not trigger an automatic location read");
assert.match(markup, /推荐/);
assert.match(markup, /衣橱/);
assert.match(markup, /scroll-x/);
assert.match(markup, /canvas[^>]+type="2d"/);
assert.doesNotMatch(markup, /主计划|保护|覆盖|自动更换|服务端|事务|读回|正式合同/, "home copy must not expose defensive or implementation terms");
assert.doesNotMatch(page, /主计划已保护|服务器读回|自动更换|推荐不会覆盖/, "home state copy must describe only the user-visible state");
assert.match(page, /暂时无法获取位置，请稍后重试或搜索城市/);
assert.doesNotMatch(page, /locationMessage:\s*messageOf\(error,[^\n]+位置/, "raw location plugin errors must not reach the UI");
assert.doesNotMatch(styles, />\s*\*/, "WXSS does not accept a universal child selector");
assert.equal(page.match(/\n\s*openIntake\(/g)?.length, 1, "home must expose one intake handler");

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
