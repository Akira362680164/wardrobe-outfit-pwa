import { strict as assert } from "node:assert";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { homeLocationClearFlowReducer } from "../src/components/home/home-location-settings-page";
import { useHomeFeedController, type HomeFeedController } from "../src/components/home/use-home-feed-controller";
import { homeCitySheetLocationActions } from "../src/components/home/wardora-home-view";
import { HomeFeedSessionCache, homeLocationRevisionKey } from "../src/lib/home/home-feed-cache";
import { HomeLocationMutationSession } from "../src/lib/home/home-feed-operations";
import { BackHandlerStore, coordinateBackRequest } from "../src/lib/back-coordinator";
import { OverlayStackStore } from "../src/lib/overlay-stack";
import { OnlineRequestError } from "../src/lib/online/online-error";
import type { HomeLocationSnapshot } from "../src/lib/online/online-home-client";

const sleep = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function city(locationId: string, displayName: string, revision: number): HomeLocationSnapshot {
  return {
    profile: { homeCity: { locationId, displayName, timezone: "Asia/Shanghai" }, revision, updatedAt: "2026-07-17T00:00:00.000Z" },
    override: { override: null, revision: 0, updatedAt: null },
  };
}

function uuidFallbackFixture() {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const originalNow = Date.now;
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
    Date.now = () => 1_721_234_567_890;
    const first = new HomeLocationMutationSession().begin({ accountId: "account-a", sessionId: "device-a", action: "home", locationId: "shanghai", expectedRevision: 3 }).clientMutationId;
    const second = new HomeLocationMutationSession().begin({ accountId: "account-a", sessionId: "device-a", action: "temporary", locationId: "beijing", expectedRevision: 8 }).clientMutationId;
    assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "fallback 必须符合服务端 UUID schema");
    assert.notEqual(first, second, "冻结 Date.now 且缺少 randomUUID/getRandomValues 时，不同命令仍必须生成不同 UUID");
  } finally {
    Date.now = originalNow;
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
  }
}

function cacheFixture() {
  const shanghai = city("101020100", "上海", 3);
  const beijing = city("101010100", "北京", 4);
  const cache = new HomeFeedSessionCache<string, string>();
  cache.setWeather("account-a", shanghai, "2026-07-17", "上海天气");
  assert.equal(cache.getWeather("account-a", beijing, "2026-07-17"), undefined, "409 上海→北京后不得命中上海天气");
  cache.setRecommendation("account-a", beijing, 8, "2026-07-17", "旧衣橱推荐");
  assert.equal(cache.getRecommendation("account-a", beijing, 9, "2026-07-17"), undefined, "workspaceRevision 变化不得命中旧推荐");
  assert.notEqual(homeLocationRevisionKey(shanghai), homeLocationRevisionKey(beijing), "地点 revision/key 变化必须可观测");
}

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost", pretendToBeVisual: true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, {
    React,
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return dom;
}

async function controllerLifecycleFixture(dom: JSDOM) {
  let serverSnapshot = city("101020100", "上海", 3);
  let controller!: HomeFeedController;
  let failRelease!: () => void;
  let lateRelease!: () => void;
  const firstAttemptGate = new Promise<void>((resolve) => { failRelease = resolve; });
  let lateGate = new Promise<void>((resolve) => { lateRelease = resolve; });
  const mutationIds: string[] = [];
  let homeAttempts = 0;
  let recommendationResolves = 0;

  const clients = {
    readHomeLocation: async () => serverSnapshot,
    readHomeWeather: async (targetDate: string) => ({
      targetDate, contextMode: "forecast", resolvedLocation: serverSnapshot.profile.homeCity,
      locationSource: "home_city", targetTimezone: "Asia/Shanghai", contextResolvedAt: "2026-07-17T00:00:00.000Z",
      weatherEvidence: { weatherSource: "forecast", weatherConfidence: 1, weatherUpdatedAt: "2026-07-17T00:00:00.000Z", weatherCode: "100", summary: `${serverSnapshot.profile.homeCity?.displayName}天气` },
      endpointFreshness: [], availabilityReason: "available",
    }) as never,
    readHomeRecommendations: async () => { throw new OnlineRequestError(404, "not_found", "none", false); },
    resolveHomeRecommendations: async (dates: readonly string[]) => {
      recommendationResolves += 1;
      return { results: dates.map((targetDate) => ({ targetDate, status: "not_ready" as const })) } as never;
    },
    searchHomeCities: async () => [],
    setHomeCity: async (_locationId: string, _revision: number, clientMutationId: string) => {
      mutationIds.push(clientMutationId);
      homeAttempts += 1;
      if (homeAttempts === 1) {
        await firstAttemptGate;
        throw new OnlineRequestError(0, "network", "响应未知", true);
      }
      serverSnapshot = city("101010100", "北京", 4);
      throw new OnlineRequestError(409, "conflict", "revision 冲突", true);
    },
    setTemporaryCity: async () => {
      const response = serverSnapshot;
      await lateGate;
      return response;
    },
  };

  function Harness({ accountId, workspaceRevision, locationActive = true }: { accountId: string; workspaceRevision: number; locationActive?: boolean }) {
    controller = useHomeFeedController({
      active: locationActive,
      locationActive,
      accountId,
      accessToken: "token",
      deviceId: `device-${accountId}`,
      workspaceRevision,
      garments: [],
      plans: [],
      clients,
    });
    return <div data-city={controller.viewModel.location.displayName ?? "none"} data-weather={controller.viewModel.weather.status === "ready" ? controller.viewModel.weather.summary : controller.viewModel.weather.status} />;
  }

  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  await act(async () => {
    root.render(<React.StrictMode><Harness accountId="account-a" workspaceRevision={8} /></React.StrictMode>);
    await sleep(15);
  });
  const resolvesBeforeWorkspaceChange = recommendationResolves;

  let failedMutation!: Promise<unknown>;
  await act(async () => {
    failedMutation = controller.commitLocation("home", "101010100");
    await sleep();
  });
  await act(async () => {
    controller.setSelectedDate(controller.window.tomorrow);
    root.render(<React.StrictMode><Harness accountId="account-a" workspaceRevision={9} /></React.StrictMode>);
    await sleep(10);
  });
  assert.equal(controller.cityMutation, "home", "mutation 延迟期间切日期/workspaceRevision 不得清除保存事务或锁死状态");
  assert.ok(recommendationResolves > resolvesBeforeWorkspaceChange, "workspaceRevision 变化必须重新读取未采用推荐");
  failRelease();
  await act(async () => { await failedMutation; await sleep(); });
  assert.equal(controller.cityMutation, null, "响应未知后必须解除 UI 保存锁以允许原样重试");

  let conflictStatus = "";
  await act(async () => { conflictStatus = await controller.commitLocation("home", "101010100"); await sleep(15); });
  assert.equal(conflictStatus, "conflict");
  assert.equal(mutationIds[0], mutationIds[1], "响应未知后的同语义重试必须复用同一 clientMutationId");
  assert.equal(controller.selectedDate, controller.window.tomorrow, "地点写完成不得用旧闭包切回旧日期");
  assert.equal(controller.viewModel.location.displayName, "北京");
  assert.equal(controller.viewModel.weather.status === "ready" ? controller.viewModel.weather.summary : "", "北京天气", "409 读回后不得出现北京地点搭配上海天气");

  serverSnapshot = city("101210101", "杭州", 5);
  Object.defineProperty(dom.window.document, "hidden", { configurable: true, value: false });
  await act(async () => { dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange")); await sleep(15); });
  assert.equal(controller.viewModel.location.displayName, "杭州", "多设备地点 revision 变化后前台恢复必须应用最新快照");

  let lateStatus = "";
  await act(async () => { void controller.commitLocation("temporary", "101020100").then((status) => { lateStatus = status; }); await sleep(); });
  serverSnapshot = city("101280101", "广州", 6);
  await act(async () => {
    root.render(<React.StrictMode><Harness accountId="account-b" workspaceRevision={9} /></React.StrictMode>);
    await sleep(15);
  });
  lateRelease();
  await act(async () => { await sleep(15); });
  assert.equal(lateStatus, "stale", "账号切换必须使旧写响应失效");
  assert.equal(controller.viewModel.location.displayName, "广州", "旧账号晚到写响应不得覆盖当前账号");
  assert.equal(controller.cityMutation, null, "账号切换必须清除旧保存状态");

  lateGate = new Promise<void>((resolve) => { lateRelease = resolve; });
  await act(async () => { void controller.commitLocation("temporary", "101020100"); await sleep(); });
  await act(async () => {
    root.render(<React.StrictMode><Harness accountId="account-b" workspaceRevision={9} locationActive={false} /></React.StrictMode>);
    await sleep();
  });
  lateRelease();
  await act(async () => { await sleep(10); });
  assert.equal(controller.locationSnapshot, null, "route 失活后晚到响应不得恢复页面地点");
  assert.equal(controller.cityMutation, null, "route 失活必须解除保存状态");

  await act(async () => root.unmount());
}

function settingsConfirmationFixture() {
  const confirming = homeLocationClearFlowReducer("idle", { type: "request" });
  assert.equal(confirming, "confirming", "第一次点击只能进入二次确认状态");
  assert.equal(homeLocationClearFlowReducer(confirming, { type: "failed" }), "confirming", "冲突或网络失败必须保留确认层以显示错误并重试");
  assert.equal(homeLocationClearFlowReducer(confirming, { type: "cancel" }), "idle", "取消二次确认不得提交清除");
  assert.equal(homeLocationClearFlowReducer(confirming, { type: "committed" }), "idle", "只有服务端提交并读回成功后才关闭确认层");
}

function clearConfirmationBackFixture() {
  const overlays = new OverlayStackStore();
  const pages = new BackHandlerStore();
  const closed: string[] = [];
  overlays.register({ id: "location-sheet", kind: "sheet", dismissible: true, onDismiss: () => closed.push("location-sheet") });
  overlays.register({ id: "clear-home-confirm", kind: "alertdialog", dismissible: true, onDismiss: () => closed.push("clear-home-confirm") });
  pages.register({ id: "settings-page", handler: () => { closed.push("settings-page"); return true; } });
  const result = coordinateBackRequest(overlays, pages, "android-back");
  assert.deepEqual(closed, ["clear-home-confirm"], "Android Back 必须先关闭清除确认层，不得穿透到地点 Sheet 或页面");
  assert.equal(result.source, "overlay");
}

function homeSheetFixture() {
  assert.deepEqual(homeCitySheetLocationActions(true), ["clear_temporary"], "首页地点 Sheet 保留恢复常驻城市操作");
  assert.equal(homeCitySheetLocationActions(true).includes("clear_home" as never), false, "首页地点 Sheet 不得暴露清除常驻城市命令");
}

async function main() {
  uuidFallbackFixture();
  cacheFixture();
  const dom = installDom();
  await controllerLifecycleFixture(dom);
  settingsConfirmationFixture();
  clearConfirmationBackFixture();
  homeSheetFixture();
  dom.window.close();
  console.log("home feed P1.2 behavior fixtures passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
