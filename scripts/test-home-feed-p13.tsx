import { strict as assert } from "node:assert";
import React, { useCallback, useMemo, useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { HomeLocationSettingsPage } from "../src/components/home/home-location-settings-page";
import { useHomeFeedController, type HomeFeedController } from "../src/components/home/use-home-feed-controller";
import { BackHandlerStore, coordinateBackRequest } from "../src/lib/back-coordinator";
import { OverlayStackStore } from "../src/lib/overlay-stack";
import { OnlineRequestError } from "../src/lib/online/online-error";
import type { HomeLocationSnapshot } from "../src/lib/online/online-home-client";

type HomeGarment = { id: string; name: string; category: string; status: string; hasImage: boolean };

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

function currentCandidateId(controller: HomeFeedController, fallback = "") {
  if (controller.viewModel.recommendation.status !== "ready") return fallback;
  return controller.viewModel.recommendation.candidates[0]?.candidateId ?? fallback;
}

async function workspaceRevisionRefreshFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  let readHomeRecommendationsCalls = 0;

  const clients = {
    readHomeLocation: async () => city("101020100", "上海", 4),
    readHomeWeather: async (targetDate: string) => ({
      targetDate,
      contextMode: "forecast",
      contextResolvedAt: "2026-07-17T00:00:00.000Z",
      locationSource: "home_city",
      targetTimezone: "Asia/Shanghai",
      endpointFreshness: [],
      weatherEvidence: {
        weatherSource: "forecast",
        weatherConfidence: 1,
        weatherUpdatedAt: "2026-07-17T00:00:00.000Z",
        weatherCode: "100",
        summary: `天气-${targetDate}`,
      },
      availabilityReason: "available",
    } as never),
    readHomeRecommendations: async (startDate: string) => {
      readHomeRecommendationsCalls += 1;
      return {
        items: [
          {
            targetDate: startDate,
            recommendationId: `reco-${readHomeRecommendationsCalls}`,
            recommendationRevision: readHomeRecommendationsCalls,
            contextMode: "forecast",
            recommendations: [
              {
                candidateId: `candidate-${readHomeRecommendationsCalls}`,
                objective: "safe",
                garmentIds: ["1", "2", "3"],
                reasonCodes: [],
                riskCodes: [],
                finalScore: 90,
              },
            ],
          },
        ],
      } as never;
    },
    resolveHomeRecommendations: async (dates: readonly string[]) => ({
      results: dates.map((targetDate) => ({ targetDate, status: "not_ready" as const })),
    } as never),
    searchHomeCities: async () => [] as never[],
    setHomeCity: async () => city("101020100", "上海", 4),
    setTemporaryCity: async () => city("101020100", "上海", 4),
  };

  let setGarments: React.Dispatch<React.SetStateAction<HomeGarment[]>> = () => undefined;
  let setWorkspaceRevision: React.Dispatch<React.SetStateAction<number>> = () => 1;
  let controller!: HomeFeedController;

  const baseGarments: HomeGarment[] = [
    { id: "1", name: "衬衫", category: "tops", status: "active", hasImage: true },
    { id: "2", name: "长裤", category: "pants", status: "active", hasImage: true },
  ];
  const plusGarment: HomeGarment = { id: "3", name: "鞋子", category: "shoes", status: "active", hasImage: true };

  function Harness() {
    const [workspaceRevision, setWorkspaceRevisionLocal] = useState(1);
    const [garments, setGarmentsLocal] = useState(baseGarments);
    setWorkspaceRevision = setWorkspaceRevisionLocal;
    setGarments = setGarmentsLocal;
    controller = useHomeFeedController({
      active: true,
      accountId: "account-a",
      accessToken: "token",
      deviceId: "device-a",
      workspaceRevision,
      garments,
      plans: [],
      clients,
    });

    return (
      <div>
        <button type="button" id="change-garments" onClick={() => setGarments((current) => [...current, plusGarment])}>
          改变单品
        </button>
        <button type="button" id="bump-workspace" onClick={() => setWorkspaceRevision((revision) => revision + 1)}>
          提升 workspaceRevision
        </button>
      </div>
    );
  }

  const root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
    await sleep(25);
  });

  const baseCalls = readHomeRecommendationsCalls;
  const baseCandidate = currentCandidateId(controller, "baseline");
  assert.equal(controller.viewModel.recommendation.status, "ready", "初始启动应完成推荐读取");

  await act(async () => {
    host.querySelector<HTMLButtonElement>("#change-garments")?.click();
    await sleep(20);
  });
  assert.equal(baseCalls, readHomeRecommendationsCalls, "garments 变化仅改列表时，推荐读取次数不应变化");
  assert.equal(currentCandidateId(controller, ""), baseCandidate, "garments 变化但 workspaceRevision 不变时不应重读推荐");

  await act(async () => {
    host.querySelector<HTMLButtonElement>("#bump-workspace")?.click();
    await sleep(20);
  });
  assert.ok(readHomeRecommendationsCalls > baseCalls, "workspaceRevision 变化应触发推荐重读");
  assert.notEqual(currentCandidateId(controller, ""), baseCandidate, "workspaceRevision 变化后不应保留旧 candidate");

  await act(async () => {
    root.unmount();
  });
}

async function weatherSameKeyLateFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  let primaryWeatherReadCalls = 0;
  let releaseFirstPrimaryWeather: (() => void) | null = null;
  let primaryDate = "";

  const clients = {
    readHomeLocation: async () => city("101020100", "上海", 4),
    readHomeWeather: async (targetDate: string) => {
      if (!primaryDate) primaryDate = targetDate;
      const isPrimaryDate = targetDate === primaryDate;
      if (!isPrimaryDate) {
        return {
          targetDate,
          contextMode: "forecast",
          contextResolvedAt: "2026-07-17T00:00:00.000Z",
          locationSource: "home_city",
          targetTimezone: "Asia/Shanghai",
          endpointFreshness: [],
          weatherEvidence: {
            weatherSource: "forecast",
            weatherConfidence: 1,
            weatherUpdatedAt: "2026-07-17T00:00:00.000Z",
            weatherCode: "100",
            summary: `other-${targetDate}`,
          },
          availabilityReason: "available",
        } as never;
      }

      primaryWeatherReadCalls += 1;
      if (primaryWeatherReadCalls === 2) {
        await new Promise<void>((resolve) => {
          releaseFirstPrimaryWeather = resolve;
        });
      }
      return {
        targetDate,
        contextMode: "forecast",
        contextResolvedAt: "2026-07-17T00:00:00.000Z",
        locationSource: "home_city",
        targetTimezone: "Asia/Shanghai",
        endpointFreshness: [],
        weatherEvidence: {
          weatherSource: "forecast",
          weatherConfidence: 1,
          weatherUpdatedAt: "2026-07-17T00:00:00.000Z",
          weatherCode: "100",
          summary: `weather-${primaryWeatherReadCalls}`,
        },
        availabilityReason: "available",
      } as never;
    },
    readHomeRecommendations: async () => ({ items: [] } as never),
    resolveHomeRecommendations: async (dates: readonly string[]) => ({
      results: dates.map((targetDate) => ({ targetDate, status: "not_ready" as const })),
    } as never),
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
    return <div data-testid="ready" />;
  }

  const root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
    await sleep(25);
  });
  assert.equal(controller.viewModel.weather.status, "ready", "初始启动应读取一次天气");

  await act(async () => {
    controller.retryWeather(controller.selectedDate);
    await sleep(1);
    controller.retryWeather(controller.selectedDate);
    await sleep(10);
  });
  if (releaseFirstPrimaryWeather) {
    releaseFirstPrimaryWeather();
  }
  await sleep(20);

  assert.ok(primaryWeatherReadCalls >= 3, "同 key 重试天气应触发延迟响应和最新响应共存");
  assert.equal(
    controller.viewModel.weather.status === "ready" ? controller.viewModel.weather.summary : "",
    "weather-3",
    "同 key 迟到天气响应不得覆盖同 key 的新响应",
  );
  await act(async () => {
    root.unmount();
  });
}

async function recommendationCurrentReadSameKeyFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  let readHomeRecommendationsCalls = 0;
  let releaseFirstCurrentRead: (() => void) | null = null;
  const clients = {
    readHomeLocation: async () => city("101020100", "上海", 4),
    readHomeWeather: async (targetDate: string) => ({
      targetDate,
      contextMode: "forecast",
      contextResolvedAt: "2026-07-17T00:00:00.000Z",
      locationSource: "home_city",
      targetTimezone: "Asia/Shanghai",
      endpointFreshness: [],
      weatherEvidence: {
        weatherSource: "forecast",
        weatherConfidence: 1,
        weatherUpdatedAt: "2026-07-17T00:00:00.000Z",
        weatherCode: "100",
        summary: `weather-${targetDate}`,
      },
      availabilityReason: "available",
    } as never),
    readHomeRecommendations: async (startDate: string) => {
      readHomeRecommendationsCalls += 1;
      const call = readHomeRecommendationsCalls;
      if (call === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstCurrentRead = resolve;
        });
      }
      return {
        items: [
          {
            targetDate: startDate,
            recommendationId: `reco-${call}`,
            recommendationRevision: call,
            contextMode: "forecast",
            recommendations: [
              {
                candidateId: `current-${call}`,
                objective: "safe",
                garmentIds: ["1", "2", "3"],
                reasonCodes: [],
                riskCodes: [],
                finalScore: 90,
              },
            ],
          },
        ],
      } as never;
    },
    resolveHomeRecommendations: async (dates: readonly string[]) => ({
      results: dates.map((targetDate) => ({ targetDate, status: "not_ready" as const })),
    } as never),
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
    return <div data-testid="ready" />;
  }

  const root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
    await sleep(25);
  });

  await act(async () => {
    controller.retryRecommendation();
    await sleep(15);
  });

  assert.equal(readHomeRecommendationsCalls, 2, "current-read 同 key 迟到场景应触发重读");
  if (releaseFirstCurrentRead) {
    releaseFirstCurrentRead();
  }
  await sleep(20);

  assert.ok(currentCandidateId(controller).includes("current-"), "retry 后应有推荐候选返回");
  assert.notEqual(
    currentCandidateId(controller, ""),
    "current-1",
    "较晚的 current-read 不得覆盖同 key 的较新 current-read",
  );

  await act(async () => {
    root.unmount();
  });
}

async function recommendationResolveSameKeyFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  let resolveCalls = 0;
  let releaseFirstResolve: (() => void) | null = null;

  const clients = {
    readHomeLocation: async () => city("101020100", "上海", 4),
    readHomeWeather: async (targetDate: string) => ({
      targetDate,
      contextMode: "forecast",
      contextResolvedAt: "2026-07-17T00:00:00.000Z",
      locationSource: "home_city",
      targetTimezone: "Asia/Shanghai",
      endpointFreshness: [],
      weatherEvidence: {
        weatherSource: "forecast",
        weatherConfidence: 1,
        weatherUpdatedAt: "2026-07-17T00:00:00.000Z",
        weatherCode: "100",
        summary: `weather-${targetDate}`,
      },
      availabilityReason: "available",
    } as never),
    readHomeRecommendations: async () => {
      throw new OnlineRequestError(404, "not_found", "not found", false);
    },
    resolveHomeRecommendations: async (dates: readonly string[]) => {
      resolveCalls += 1;
      const call = resolveCalls;
      if (call === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstResolve = resolve;
        });
      }
      return {
        results: dates.map((targetDate) => ({
          targetDate,
          status: "generated",
          recommendation: {
            recommendationId: `resolve-${call}`,
            recommendationRevision: call,
            targetDate,
            contextMode: "forecast",
            recommendations: [
              {
                candidateId: `resolve-candidate-${call}`,
                objective: "safe",
                garmentIds: ["1", "2", "3"],
                reasonCodes: [],
                riskCodes: [],
                finalScore: 88,
              },
            ],
          },
        })),
      } as never;
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
    return <div data-testid="ready" />;
  }

  const root = createRoot(host);
  await act(async () => {
    root.render(<Harness />);
    await sleep(25);
  });

  await act(async () => {
    controller.retryRecommendation();
    await sleep(15);
  });

  assert.equal(resolveCalls, 2, "resolve 同 key 迟到场景应触发重解析");
  if (releaseFirstResolve) {
    releaseFirstResolve();
  }
  await sleep(20);

  assert.equal(
    currentCandidateId(controller, ""),
    "resolve-candidate-2",
    "resolve 迟到响应不应替换同 key 的新候选",
  );

  await act(async () => {
    root.unmount();
  });
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
  await act(async () => {
    root.unmount();
  });
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
  assert.ok(errorInSheet, "网络失败文案应可见在 alertdialog 内");
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
  await act(async () => {
    root.unmount();
  });
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

async function directedWeatherRetryFixture(dom: JSDOM) {
  const host = dom.window.document.getElementById("root")!;
  const calls: string[] = [];
  const attempts = new Map<string, number>();
  let controller!: HomeFeedController;
  const clients = {
    readHomeLocation: async () => city("101020100", "上海", 4),
    readHomeWeather: async (targetDate: string) => {
      calls.push(targetDate);
      const attempt = (attempts.get(targetDate) ?? 0) + 1;
      attempts.set(targetDate, attempt);
      if (controller && targetDate === controller.window.today && attempt === 1) throw new Error("today partial failure");
      return { targetDate, contextMode: "forecast", contextResolvedAt: "2026-07-18T00:00:00.000Z", resolvedLocation: { locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" }, locationSource: "home_city", targetTimezone: "Asia/Shanghai", endpointFreshness: [], weatherEvidence: { weatherSource: "forecast", weatherConfidence: 1, weatherUpdatedAt: "2026-07-18T00:00:00.000Z", weatherCode: "100", dayWeatherCode: "100", summary: `retry-${targetDate}` }, availabilityReason: "available" } as never;
    },
    readHomeRecommendations: async () => ({ items: [] } as never),
    resolveHomeRecommendations: async (dates: readonly string[]) => ({ results: dates.map((targetDate) => ({ targetDate, status: "not_ready" as const })) } as never),
    searchHomeCities: async () => [] as never[],
    setHomeCity: async () => city("101020100", "上海", 4),
    setTemporaryCity: async () => city("101020100", "上海", 4),
  };
  function Harness() {
    controller = useHomeFeedController({ active: true, accountId: "account-retry-date", accessToken: "token", deviceId: "device-retry-date", workspaceRevision: 1, garments: [], plans: [], clients });
    return <div />;
  }
  const root = createRoot(host);
  await act(async () => { root.render(<Harness />); await sleep(30); });
  const today = controller.window.today;
  const tomorrow = controller.window.tomorrow;
  assert.equal(controller.viewModel.todayWeather.status, "error", "fixture 必须先形成今天单日失败");
  assert.equal(controller.viewModel.tomorrowWeather.status, "ready", "明天应独立成功");
  await act(async () => { controller.setSelectedDate(tomorrow); await sleep(20); });
  await act(async () => { controller.retryWeather(today); await sleep(30); });
  assert.equal(controller.selectedDate, tomorrow, "定向重试不得改写用户已选中的明天");
  assert.equal(calls.at(-1), today, "重试参数必须锁定失败的今天，而非 selectedDateRef 当前值");
  assert.equal(controller.viewModel.todayWeather.status === "ready" ? controller.viewModel.todayWeather.summary : "", `retry-${today}`);
  await act(async () => { root.unmount(); });
}

async function main() {
  const dom = installDom();
  await workspaceRevisionRefreshFixture(dom);
  await weatherSameKeyLateFixture(dom);
  await recommendationCurrentReadSameKeyFixture(dom);
  await recommendationResolveSameKeyFixture(dom);
  await clearHomeErrorFixture(dom);
  clearConfirmationBackFixture();
  await retryLocationFixture(dom);
  await directedWeatherRetryFixture(dom);
  dom.window.close();
  console.log("home feed P1.3 behavior fixtures passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
