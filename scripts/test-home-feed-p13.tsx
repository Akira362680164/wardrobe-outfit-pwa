import { strict as assert } from "node:assert";
import React, { useCallback, useMemo, useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { HomeLocationSettingsPage } from "../src/components/home/home-location-settings-page";
import { useHomeFeedController, type HomeFeedController } from "../src/components/home/use-home-feed-controller";
import { BackHandlerStore, coordinateBackRequest } from "../src/lib/back-coordinator";
import { OverlayStackStore } from "../src/lib/overlay-stack";
import type { HomeLocationSnapshot } from "../src/lib/online/online-home-client";

const sleep = (milliseconds = 0) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function city(locationId: string, displayName: string, revision: number): HomeLocationSnapshot {
  return {
    profile: { homeCity: { locationId, displayName, timezone: "Asia/Shanghai" }, revision, updatedAt: "2026-07-17T00:00:00.000Z" },
    override: { override: null, revision: 0, updatedAt: null },
  };
}

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost", pretendToBeVisual: true });
  dom.window.scrollTo = () => undefined;
  dom.window.scrollBy = () => undefined;
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
    scrollTo: () => undefined,
    scrollBy: () => undefined,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return dom;
}

async function retryLocationFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  let locationReadCalls = 0;
  let weatherReadCalls = 0;
  let recommendationCalls = 0;
  let firstLocationFailure = true;
  let allowSuccessLocation = false;
  const root = createRoot(host);

  const clients = {
    readHomeLocation: async () => {
      locationReadCalls += 1;
      if (firstLocationFailure || !allowSuccessLocation) {
        firstLocationFailure = false;
        throw new Error("首次地点读取失败");
      }
      return city("101020100", "上海", 4);
    },
    readHomeWeather: async (targetDate: string) => {
      weatherReadCalls += 1;
      return {
        targetDate,
        contextMode: "forecast",
        contextResolvedAt: "2026-07-17T00:00:00.000Z",
        locationSource: "home_city",
        targetTimezone: "Asia/Shanghai",
        endpointFreshness: [],
        resolvedLocation: { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" },
        weatherEvidence: { weatherSource: "forecast", weatherConfidence: 1, weatherUpdatedAt: "2026-07-17T00:00:00.000Z", weatherCode: "100", summary: "上海天气" },
        availabilityReason: "available",
      } as never;
    },
    readHomeRecommendations: async () => {
      return { items: [] } as never;
    },
    resolveHomeRecommendations: async (dates: readonly string[]) => {
      recommendationCalls += 1;
      return { results: dates.map((targetDate) => ({ targetDate, status: "not_ready" as const })) } as never;
    },
    searchHomeCities: async () => [] as never[],
    setHomeCity: async () => city("101020100", "上海", 4),
    setTemporaryCity: async () => city("101020100", "上海", 4),
  };

  let controller!: HomeFeedController;
  function Harness() {
    controller = useHomeFeedController({
      active: true,
      accountId: "account-a",
      accessToken: "token",
      deviceId: "device-a",
      workspaceRevision: 1,
      garments: [],
      plans: [],
      clients,
    });
    return <div data-weather={controller.viewModel.weather.status} />;
  }

  await act(async () => {
    root.render(<Harness />);
    await sleep(10);
  });
  const locationReadsBeforeRetry = locationReadCalls;

  assert.ok(locationReadCalls >= 1, "初始进入应触发至少一次地点读取");
  assert.equal(controller.locationState.status, "error", "首次地点读取失败应保留 error 状态");
  assert.equal(weatherReadCalls, 0, "地点异常前不应加载天气");
  assert.equal(recommendationCalls, 0, "地点异常前不应加载推荐");

  await act(async () => {
    allowSuccessLocation = true;
    await controller.retryLocation();
    await sleep(20);
  });

  assert.ok(locationReadCalls > locationReadsBeforeRetry, "重试地点应再次读取地点");
  assert.equal(controller.locationState.status, "ready", "重试成功后地点状态应恢复");
  assert.ok(weatherReadCalls > 0, "重试成功后应立即发起天气加载");
  assert.ok(recommendationCalls > 0, "重试成功后应立即发起推荐加载");
  assert.notEqual(controller.viewModel.weather.status, "loading", "重试后天气请求应不阻塞在 loading");
  assert.notEqual(controller.viewModel.recommendation.status, "loading", "重试后推荐请求应不阻塞在 loading");
  await act(async () => { root.unmount(); });
}

async function clearHomeErrorFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  const root = createRoot(host);
  const sheetRoot = dom.window.document;
  let setFailureMode: (mode: "network" | "conflict") => void = () => undefined;
  let cityMutationCalls = 0;

  const cityState = city("101020100", "上海", 4);
  function Harness() {
    const [failureMode, setFailureModeState] = useState<"network" | "conflict">("network");
    const [cityMutationError, setCityMutationError] = useState<string | null>(null);
    const [cityMutationConflict, setCityMutationConflict] = useState(false);
    const [cityMutation, setCityMutation] = useState<string | null>(null);
    setFailureMode = setFailureModeState;
    const onBack = useCallback(() => undefined, []);
    const commitLocation = useCallback(async () => {
      cityMutationCalls += 1;
      setCityMutation("clear_home");
      const isConflict = failureMode === "conflict";
      setCityMutationError(isConflict ? "请求出现 409 冲突" : "网络请求失败");
      setCityMutationConflict(isConflict);
      setCityMutation(null);
      return "conflict";
    }, [failureMode]);
    const controller = useMemo(() => ({
      locationSnapshot: cityState,
      locationState: { status: "ready", data: cityState },
      cityMutation,
      cityMutationError,
      cityMutationConflict,
      commitLocation,
    } as unknown as HomeFeedController), [cityMutation, cityMutationConflict, cityMutationError, commitLocation]);
    return (
      <>
        <HomeLocationSettingsPage controller={controller} onBack={onBack} />
        <button id="set-conflict" type="button" onClick={() => setFailureMode("conflict")}>切换 409 模式</button>
        <button id="set-network" type="button" onClick={() => setFailureMode("network")}>切换网络错误模式</button>
      </>
    );
  }

  await act(async () => {
    root.render(<Harness />);
    await sleep(10);
  });

  const request = sheetRoot.querySelector('[data-testid="request-clear-home-city"]') as HTMLButtonElement;
  assert.ok(request, "设置页应提供清除常驻城市入口");
  await act(async () => {
    request.click();
    await sleep(10);
  });
  const sheet = sheetRoot.querySelector('[role="alertdialog"]') as HTMLElement | null;
  assert.ok(sheet, "重试失败展示层必须是 alertdialog");

  const confirm = sheetRoot.querySelector('[data-testid="confirm-clear-home-city"]') as HTMLButtonElement;
  await act(async () => {
    confirm.click();
    await sleep(10);
  });
  const errorInSheet = sheetRoot.querySelector('[role="alertdialog"] [role="alert"]') as HTMLElement | null;
  assert.ok(errorInSheet, "网络失败文案应渲染在 alertdialog 内");
  assert.match(errorInSheet.textContent ?? "", /网络请求失败/, "网络失败提示应可见");
  assert.ok(!errorInSheet.hasAttribute("data-conflict"), "非 409 情况不应标记冲突语义");

  const outsideAlert = Array.from(sheetRoot.querySelectorAll('[role="alert"]')).find((node) => !sheet?.contains(node));
  assert.equal(outsideAlert, undefined, "错误不能只在页面背景层承载");
  assert.equal(cityMutationCalls, 1, "触发确认按钮应发起一次清除请求");

  await act(async () => {
    sheetRoot.querySelector("#set-conflict")?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    await sleep(5);
  });
  await act(async () => {
    confirm.click();
    await sleep(10);
  });
  const conflictAlert = sheetRoot.querySelector('[role="alertdialog"] [role="alert"]') as HTMLElement | null;
  assert.ok(conflictAlert, "409 重试应可见错误");
  assert.equal(conflictAlert.getAttribute("data-conflict"), "true", "409 冲突应标记在 alert 内");
  assert.equal(cityMutationCalls, 2, "重试 409 亦应再次发起请求");
  await act(async () => { root.unmount(); });
}

function clearConfirmationBackFixture() {
  const overlays = new OverlayStackStore();
  const pages = new BackHandlerStore();
  const closed: string[] = [];
  overlays.register({ id: "location-confirm", kind: "alertdialog", dismissible: true, onDismiss: () => closed.push("location-confirm") });
  pages.register({ id: "settings-page", handler: () => { closed.push("settings-page"); return true; } });
  const result = coordinateBackRequest(overlays, pages, "android-back");
  assert.deepEqual(closed, ["location-confirm"], "Android Back 应优先关闭确认层");
  assert.equal(result.source, "overlay");
}

async function main() {
  const dom = installDom();
  await clearHomeErrorFixture(dom);
  clearConfirmationBackFixture();
  await retryLocationFixture(dom);
  dom.window.close();
  console.log("home feed P1.3 behavior fixtures passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
