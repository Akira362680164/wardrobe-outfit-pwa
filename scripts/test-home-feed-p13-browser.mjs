import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const FIXTURE_PORT = Number(process.env.HOME_FEED_FIXTURE_PORT ?? "4174");
const FIXTURE_HOST = process.env.HOME_FEED_FIXTURE_HOST ?? "127.0.0.1";
const FIXTURE_ORIGIN = `http://${FIXTURE_HOST}:${FIXTURE_PORT}`;
const APP_PORT = Number(process.env.HOME_FEED_APP_PORT ?? "4173");
const APP_ORIGIN = process.env.HOME_FEED_APP_ORIGIN ?? `http://127.0.0.1:${APP_PORT}`;
const EVIDENCE_DIR = process.env.HOME_FEED_BROWSER_EVIDENCE ?? "test-results/home-feed-p13-browser/20260718";
const widths = [360, 375, 390, 412, 430];
const TIMEOUT_MS = 20_000;
const APP_BOOT_MS = 90_000;

await mkdir(EVIDENCE_DIR, { recursive: true });

const startedProcesses = new Set();
const startInfo = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // starting...
    }
    await sleep(250);
  }
  throw new Error(`wait for ${url} timeout`);
}

function spawnProcess(command, args, env) {
  const proc = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  startedProcesses.add(proc);
  startInfo.set(proc, `${command} ${args.join(" ")}`);
  return proc;
}

function stopProcesses() {
  for (const proc of startedProcesses) {
    if (!proc.killed) {
      proc.kill("SIGTERM");
      proc.unref?.();
    }
  }
  startedProcesses.clear();
  startInfo.clear();
}

process.on("SIGINT", () => {
  stopProcesses();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopProcesses();
  process.exit(143);
});

async function withFixtureAndApp(cb) {
  let appStarted = false;
  try {
    spawnProcess("node", ["scripts/home-feed-browser-fixture-server.mjs"], {
      ...process.env,
      HOME_FEED_FIXTURE_PORT: String(FIXTURE_PORT),
      HOME_FEED_FIXTURE_HOST: FIXTURE_HOST,
      HOME_FEED_APP_ORIGIN: APP_ORIGIN,
      HOME_FEED_FIXTURE_SCENARIO: "p13",
      HOME_FEED_MUTATION_DELAY_MS: "350",
      NEXT_PUBLIC_WARDORA_HOME_FEED_P1: "true",
    });
    await waitForHttp(`http://${FIXTURE_HOST}:${FIXTURE_PORT}`);

    try {
      const response = await fetch(`${APP_ORIGIN}/`, { redirect: "manual" });
      if (response.status >= 500) throw new Error("app unavailable");
    } catch {
      spawnProcess("npm", ["run", "dev", "--", "--hostname", FIXTURE_HOST, "--port", String(APP_PORT)], {
        ...process.env,
        HOME_FEED_FIXTURE_SCENARIO: "p13",
        NEXT_PUBLIC_WARDROBE_API_BASE_URL: `http://${FIXTURE_HOST}:${FIXTURE_PORT}`,
        NEXT_PUBLIC_WARDORA_HOME_FEED_P1: process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_P1 ?? "true",
      });
      appStarted = true;
      await waitForHttp(APP_ORIGIN, APP_BOOT_MS);
    }

    await cb({ appStarted });
  } finally {
    stopProcesses();
  }
}

async function expectNoHorizontalOverflow(page, widthList) {
  for (const width of widthList) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) {
      const offenders = await page.evaluate(() => Array.from(document.querySelectorAll("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            testid: element.getAttribute("data-testid"),
            className: typeof element.className === "string" ? element.className : "",
            rect: rect.toJSON(),
          };
        })
        .filter((item) => item.rect.left < -1 || item.rect.right > window.innerWidth + 1)
        .slice(0, 10)
      );
      throw new Error(`${width}px horizontal overflow; offenders=${JSON.stringify(offenders)}`);
    }
  }
}

async function waitForSheetClose(dialog, timeout = 8000) {
  await dialog.waitFor({ state: "hidden", timeout });
}

function assert(message, condition) {
  if (!condition) throw new Error(message);
}

async function waitForCondition(condition, timeoutMs = 12_000, message = "condition timeout") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(120);
  }
  throw new Error(message);
}

function isExpectedConsoleError(text) {
  return /Failed to load resource: the server responded with a status of (404|409|503)/.test(text);
}

async function clickDialogBackdrop(page, dialog) {
  const bounds = await dialog.boundingBox();
  if (bounds) {
    const x = Math.max(8, Math.floor(bounds.x + 4));
    const y = Math.max(8, Math.floor(bounds.y - 8));
    await page.mouse.click(x, y);
    return;
  }
  await page.mouse.click(8, 8);
}

async function getText(locator) {
  return (await locator.textContent())?.trim() ?? "";
}

async function settleVisual(page, delayMs = 180) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(delayMs);
}

async function assertViewportVisible(locator, label) {
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      visible: rect.width > 0 && rect.height > 0
        && rect.top >= -1 && rect.left >= -1
        && rect.bottom <= window.innerHeight + 1
        && rect.right <= window.innerWidth + 1,
      rect: rect.toJSON(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  assert(`${label} 被视口裁切: ${JSON.stringify(result)}`, result.visible);
}

async function fixtureTrace() {
  const response = await fetch(`${FIXTURE_ORIGIN}/__fixture/trace`);
  assert("Fixture trace 读取失败", response.ok);
  return response.json();
}

await withFixtureAndApp(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const highResponses = [];
  const responseStats = {
    locationProfileGets: [],
    locationProfileDeletes: [],
    locationProfileDeleteAttempts: [],
    weatherOverviews: [],
    recommendationReads: [],
    recommendationResolves: [],
    locationSearches: [],
    settingLocations: [],
  };
  const allowedFailures = {
    profileGet: 0,
    clearFirst: 0,
  };

  page.setDefaultTimeout(12_000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (isExpectedConsoleError(text)) return;
    consoleErrors.push(text);
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" });
  });
  page.on("response", (response) => {
    if (!response.url().includes("/api/")) return;
    const status = response.status();
    const url = response.url();
    const method = response.request().method();
    if (url.includes("/api/settings/location-profile") && method === "GET") {
      responseStats.locationProfileGets.push(status);
    }
    if (url.includes("/api/settings/location-profile") && method === "DELETE") {
      responseStats.locationProfileDeleteAttempts.push(status);
    }
    if (status >= 500) {
      highResponses.push({ url, method, status });
      return;
    }

    if (url.includes("/api/settings/location-profile") && method === "DELETE") {
      responseStats.locationProfileDeletes.push(status);
    }
    if (url.includes("/api/weather/overview")) {
      responseStats.weatherOverviews.push(status);
    }
    if (url.includes("/api/recommendations/resolve")) {
      responseStats.recommendationResolves.push(status);
    }
    if (url.includes("/api/recommendations") && method === "GET" && !url.includes("/resolve")) {
      responseStats.recommendationReads.push(status);
    }
    if (url.includes("/api/weather/locations/search")) {
      responseStats.locationSearches.push(status);
    }
    if (url.includes("/api/settings/location-override")) {
      responseStats.settingLocations.push(status);
    }
  });

  try {
    await page.goto(APP_ORIGIN, { waitUntil: "networkidle" });
    await fetch(`${FIXTURE_ORIGIN}/__fixture/control`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "fail-next-profile-get", count: 2 }),
    });
    await page.getByLabel("邮箱或手机号").fill("fixture111@example.test");
    await page.getByLabel("密码").fill("FixturePassword123!");
    await page.getByLabel("我已阅读并同意").check();
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await page.getByTestId("wardora-home-feed").waitFor();
    await waitForCondition(async () => (await fixtureTrace()).entries.some((entry) => entry.method === "GET" && entry.path === "/api/settings/location-profile" && entry.status === 503), 12_000, "首次地点失败序列未完成");
    await settleVisual(page);
    await page.screenshot({ path: `${EVIDENCE_DIR}/home-entry.png`, fullPage: true });
    await expectNoHorizontalOverflow(page, widths);

    // 1) 首次读取地点失败：通过 HomeCitySheet 弹层确认并重试，恢复天气与推荐
    await page.getByTestId("home-location-entry").click();
    const sheet = page.getByTestId("home-city-sheet");
    await sheet.waitFor({ state: "visible" });
    const sheetError = sheet.locator("[role='alert']");
    await sheetError.waitFor({ timeout: 12_000 });
    assert("首次地点读取失败未显示错误提示", (await getText(sheetError)).length > 0);
    assert("强制地点读取未触发 503", responseStats.locationProfileGets.includes(503));
    allowedFailures.profileGet += responseStats.locationProfileGets.filter((status) => status === 503).length;

    const retryLocationGet = page.waitForResponse((response) => {
      return response.request().method() === "GET" && response.url().includes("/api/settings/location-profile") && response.status() === 200;
    });
    const retryWeatherRead = page.waitForResponse((response) => {
      return response.url().includes("/api/weather/overview") && response.status() === 200;
    });
    const retryRecommendationResolve = page.waitForResponse((response) => {
      return response.url().includes("/api/recommendations/resolve") && response.status() === 200;
    });
    const retryButton = sheet.locator("button", { hasText: "重试" });
    await retryButton.click();
    await Promise.all([retryLocationGet, retryWeatherRead, retryRecommendationResolve]);
    await page.waitForTimeout(350);

    const locationEntry = page.getByTestId("home-location-entry");
    await locationEntry.waitFor();
    const restoredLocationText = await getText(locationEntry);
    assert("地点重试后未恢复常驻城市", restoredLocationText.includes("上海"));
    assert("重试后仍显示地点未设置", !(await getText(locationEntry)).includes("未设置城市"));
    assert("重试后天气仍处于错误态", !(await page.getByRole("button", { name: "重试天气" }).isVisible()));
    assert("重试后推荐仍处于错误态", !(await page.getByRole("button", { name: "重试推荐" }).isVisible()));
    assert("重试后未读回天气", responseStats.weatherOverviews.some((status) => status === 200));
    assert("重试后未读回推荐", responseStats.recommendationResolves.some((status) => status === 200) || responseStats.recommendationReads.some((status) => status === 200));

    await settleVisual(page);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-location-retry-success.png`, fullPage: true });
    await sheet.getByRole("button", { name: "关闭城市选择" }).click();
    await sheet.waitFor({ state: "hidden" });

    // 2) 130% 字体与断点检查
    await page.evaluate(() => { document.documentElement.style.fontSize = "20.8px"; });
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page, widths);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("wardora-home-feed").scrollIntoViewIfNeeded();
    await settleVisual(page);
    await assertViewportVisible(page.getByRole("heading", { name: /早上好|中午好|下午好|晚上好/ }), "时间语义问候");
    await assertViewportVisible(page.getByTestId("home-location-entry"), "地点入口");
    await assertViewportVisible(page.getByText("今天", { exact: true }).first(), "今天日期");
    await assertViewportVisible(page.getByRole("tab", { name: "推荐" }), "推荐 Tab");
    await assertViewportVisible(page.getByRole("tab", { name: "衣橱" }), "衣橱 Tab");
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-home-font130.png`, fullPage: true });

    await page.getByText("设置", { exact: true }).last().click();
    await page.getByRole("button", { name: /天气地点/ }).click();
    const settingsSheet = page.getByTestId("weather-location-settings");
    await settingsSheet.waitFor({ state: "visible" });
    await expectNoHorizontalOverflow(page, widths);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-settings-font130.png`, fullPage: true });

    function waitForDeleteStatus(targetStatus, expectedOffset, stepLabel) {
      return waitForCondition(
        () => responseStats.locationProfileDeleteAttempts.slice(expectedOffset).includes(targetStatus),
        12_000,
        `未收到清除请求 ${stepLabel} 的响应: ${targetStatus}`,
      );
    }

    // 3) 清除常驻城市：网络失败 -> 409 -> 成功；pending 时不允许关闭
    const clearButton = page.getByTestId("request-clear-home-city");
    await clearButton.waitFor({ state: "visible", timeout: 12000 });
    await clearButton.click();
    const clearDialog = page.getByRole("alertdialog");
    await clearDialog.waitFor({ state: "visible" });
    const confirmButton = page.getByTestId("confirm-clear-home-city");
    await confirmButton.waitFor({ state: "visible" });
    const clearErrorAlert = clearDialog.locator("[role='alert']");
    const pendingMarker = clearDialog.locator('p[role="status"]');

    const clearFailureResponse = waitForDeleteStatus(503, responseStats.locationProfileDeleteAttempts.length, "网络失败");
    await confirmButton.click();
    await page.waitForTimeout(50);
    const hasPendingMarker = await pendingMarker.count();
    let hadPendingMarker = false;
    if (hasPendingMarker) {
      await pendingMarker.waitFor({ state: "visible", timeout: 6000 });
      hadPendingMarker = true;
    }
    assert("清除提交应进入 pending 状态", hadPendingMarker);

    if (hadPendingMarker) {
      await page.keyboard.press("Escape");
      await sleep(500);
      await clearDialog.waitFor({ state: "visible", timeout: 6000 });

      await clickDialogBackdrop(page, clearDialog);
      await sleep(500);
      await clearDialog.waitFor({ state: "visible", timeout: 6000 });
    }
    await clearFailureResponse;
    allowedFailures.clearFirst += 1;
    await page.waitForTimeout(150);
    const clearFailureStatus = responseStats.locationProfileDeleteAttempts.slice(-1)[0];
    assert("首次清除未以 503 响应", clearFailureStatus === 503);
    await clearErrorAlert.waitFor({ state: "visible", timeout: 6000 });
    assert("首次清除未出现 sheet 内错误提示", (await getText(clearErrorAlert)).length > 0);
    assert("首次清除误标记为冲突", !(await clearErrorAlert.getAttribute("data-conflict")));
    const networkErrorText = await getText(clearErrorAlert);
    assert("网络失败未显示人类可读错误", networkErrorText.includes("网络") && !/Zod|schema|fallback modes|\{\s*"/i.test(networkErrorText));
    await settleVisual(page);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-clear-home-fail.png`, fullPage: true });

    const clearConflictResponse = waitForDeleteStatus(409, responseStats.locationProfileDeleteAttempts.length, "冲突重试");
    await Promise.all([clearConflictResponse, confirmButton.click()]);
    const clearConflictStatus = responseStats.locationProfileDeleteAttempts.slice(-1)[0];
    assert("409 场景未触发 409", clearConflictStatus === 409);
    await clearErrorAlert.waitFor({ state: "visible", timeout: 6000 });
    assert("409 情况未保留清除弹层", await clearDialog.isVisible());
    assert("409 情况未在 alert 标记", (await clearErrorAlert.getAttribute("data-conflict")) === "true");
    assert("409 场景未恢复可重试", await confirmButton.isEnabled());
    const conflictErrorText = await getText(clearErrorAlert);
    assert("409 未显示人类可读冲突", /冲突|其他设备|更新/.test(conflictErrorText) && !/Zod|schema|fallback modes|\{\s*"/i.test(conflictErrorText));
    await settleVisual(page);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-clear-home-conflict.png`, fullPage: true });

    const clearSuccessResponse = waitForDeleteStatus(200, responseStats.locationProfileDeleteAttempts.length, "成功清除");
    await Promise.all([clearSuccessResponse, confirmButton.click()]);
    const clearSuccessStatus = responseStats.locationProfileDeleteAttempts.slice(-1)[0];
    assert("成功清除未以 200 响应", clearSuccessStatus === 200);
    await waitForSheetClose(clearDialog);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-clear-home-success.png`, fullPage: true });

    // 4) 回读确认
    await page.goto(APP_ORIGIN, { waitUntil: "networkidle" });
    await page.getByTestId("wardora-home-feed").waitFor();
    const finalLocationText = await getText(page.getByTestId("home-location-entry"));
    assert("清除后未读回“未设置城市”", finalLocationText.includes("未设置城市"));
    await waitForCondition(async () => (await getText(page.getByTestId("home-weather-module"))).includes("设置地点后可查看天气"), 12_000, "locationless 天气模块未进入合法空状态");
    const finalWeatherText = await getText(page.getByTestId("home-weather-module"));
    assert("locationless 天气模块泄露伪温度", !/\d+°/.test(finalWeatherText));
    assert("locationless 天气卡泄露原始 schema 文本", !/Zod|schema|fallback modes cannot expose weather values|invalid_type|\{\s*"/i.test(finalWeatherText));
    await settleVisual(page);
    await page.screenshot({ path: `${EVIDENCE_DIR}/p13-final-home.png`, fullPage: true });
    await expectNoHorizontalOverflow(page, widths);

    const unexpectedFailureCount = highResponses.length - allowedFailures.profileGet - allowedFailures.clearFirst;
    const allowedRequestFailures = requestFailures.filter((failure) => failure.url.includes("/api/settings/location-profile") && /ABORTED|canceled/i.test(failure.error));
    const unexpectedRequestFailures = requestFailures.filter((failure) => !allowedRequestFailures.includes(failure));
    if (
      pageErrors.length > 0 ||
      consoleErrors.length > 0 ||
      unexpectedRequestFailures.length > 0 ||
      responseStats.locationProfileDeletes.includes(500) ||
      unexpectedFailureCount > 0 ||
      !responseStats.locationProfileGets.includes(200) ||
      !responseStats.locationProfileDeletes.includes(200)
    ) {
      throw new Error(
        `browser fatal check failed: pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}, requestFailures=${JSON.stringify(requestFailures)}, unexpectedRequestFailures=${JSON.stringify(unexpectedRequestFailures)}, highResponses=${highResponses.length}, allowedFailures=${JSON.stringify(allowedFailures)}, unexpectedFailureCount=${unexpectedFailureCount}, deletes=${responseStats.locationProfileDeletes.join(",")}`,
      );
    }

    const trace = await fixtureTrace();
    const tracedProfileGets = trace.entries.filter((entry) => entry.path === "/api/settings/location-profile" && entry.method === "GET").map((entry) => entry.status);
    const tracedProfileDeletes = trace.entries.filter((entry) => entry.path === "/api/settings/location-profile" && entry.method === "DELETE").map((entry) => entry.status);
    const tracedWeatherOverviews = trace.entries.filter((entry) => entry.path === "/api/weather/overview" && entry.method === "GET").map((entry) => entry.status);
    assert(`浏览器 GET 流水缺少首次失败→重试恢复: ${JSON.stringify(tracedProfileGets)}`, tracedProfileGets.some((status, index) => status === 503 && tracedProfileGets.slice(index + 1).includes(200)));
    assert(`浏览器 DELETE 流水不一致: ${JSON.stringify({ tracedProfileDeletes, observed: responseStats.locationProfileDeleteAttempts })}`, JSON.stringify(tracedProfileDeletes) === JSON.stringify(responseStats.locationProfileDeleteAttempts));
    assert(`浏览器天气流水不一致: ${JSON.stringify({ tracedWeatherOverviews, observed: responseStats.weatherOverviews })}`, JSON.stringify(tracedWeatherOverviews) === JSON.stringify(responseStats.weatherOverviews));

    await writeFile(
      `${EVIDENCE_DIR}/manifest.json`,
      JSON.stringify(
        {
          scenario: "home-feed-p13-browser",
          evidenceDir: EVIDENCE_DIR,
          widths,
          fontScale: 130,
          responseStats,
          allowedFailures,
          pageErrors,
          consoleErrors,
          requestFailures,
          allowedRequestFailures,
          unexpectedRequestFailures,
          highResponses,
          homeLocationAfterRetry: restoredLocationText,
          homeLocationAfterClear: finalLocationText,
          locationlessWeatherText: finalWeatherText,
          fixtureTrace: trace.entries,
        },
        null,
        2,
      ),
      "utf-8",
    );

    console.log(JSON.stringify({
      evidenceDir: EVIDENCE_DIR,
      homeLocationAfterRetry: restoredLocationText,
      homeLocationAfterClear: finalLocationText,
      pageErrors,
      consoleErrors,
      requestFailures,
      highResponses,
      responseStats,
    }));
  } finally {
  await browser.close().catch(() => undefined);
}
});
