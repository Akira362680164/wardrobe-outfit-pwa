import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const fixturePort = Number(process.env.HOME_FEED_FIXTURE_PORT ?? 4184);
const appPort = Number(process.env.HOME_FEED_APP_PORT ?? 4183);
const host = "127.0.0.1";
const fixtureOrigin = `http://${host}:${fixturePort}`;
const appOrigin = `http://${host}:${appPort}`;
const evidenceDir = process.env.HOME_FEED_P14_EVIDENCE ?? "test-results/home-feed-p14-visual/20260718";
const processes = [];
const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
const responseErrors = [];
const screenshots = [];

await mkdir(evidenceDir, { recursive: true });

function start(command, args, env) {
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  processes.push(child);
  return child;
}

async function waitFor(url, timeout = 90_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if ((await fetch(url)).status < 500) return; } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function setMode(mode) {
  const response = await fetch(`${fixtureOrigin}/__fixture/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-p14-mode", mode }) });
  if (!response.ok) throw new Error(`failed to set fixture mode ${mode}`);
}

async function login(page) {
  await page.goto(appOrigin, { waitUntil: "networkidle" });
  const account = page.getByLabel("邮箱或手机号");
  if (await account.isVisible().catch(() => false)) {
    await account.fill("fixture111@example.test");
    await page.getByLabel("密码").fill("FixturePassword123!");
    await page.getByLabel("我已阅读并同意").check();
    await page.getByRole("button", { name: "登录", exact: true }).click();
  }
}

async function openHome(page) {
  await page.getByTestId("wardora-home-feed").waitFor({ state: "visible" });
  await page.waitForTimeout(700);
}

async function reloadMode(page, mode) {
  await setMode(mode);
  await page.goto(appOrigin, { waitUntil: "networkidle" });
  await openHome(page);
}

async function noOverflow(page, label) {
  const amount = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (amount > 1) throw new Error(`${label}: horizontal page overflow ${amount}px`);
}

async function capture(page, name) {
  const path = `${evidenceDir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}

async function captureViewport(page, name) {
  const path = `${evidenceDir}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  screenshots.push(path);
}

async function captureAffectedMatrix(page, label) {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : width === 390 ? 844 : 932 });
    for (const [scale, fontSize] of [[100, "16px"], [130, "20.8px"]]) {
      await page.evaluate((value) => { document.documentElement.style.fontSize = value; }, fontSize);
      await noOverflow(page, `${label}-${width}-font${scale}`);
      await capture(page, `${label}-${width}-font${scale}`);
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = "16px"; });
  await page.setViewportSize({ width: 390, height: 844 });
}

function assert(value, message) { if (!value) throw new Error(message); }

start("node", ["scripts/home-feed-browser-fixture-server.mjs"], {
  ...process.env,
  HOME_FEED_FIXTURE_PORT: String(fixturePort),
  HOME_FEED_APP_ORIGIN: appOrigin,
  HOME_FEED_FIXTURE_SCENARIO: "p14",
});
await waitFor(fixtureOrigin);
start("npm", ["run", "dev", "--", "--hostname", host, "--port", String(appPort)], {
  ...process.env,
  NEXT_PUBLIC_WARDROBE_API_BASE_URL: fixtureOrigin,
  NEXT_PUBLIC_WARDORA_HOME_FEED_P1: "true",
});
await waitFor(appOrigin);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ text: message.text(), url: message.location().url }); });
page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
page.on("response", (response) => { if (response.status() >= 400) responseErrors.push({ status: response.status(), url: response.url() }); });

try {
  await setMode("ready");
  await login(page);
  await openHome(page);
  const home = page.getByTestId("wardora-home-feed");
  await page.getByTestId("home-weather-pair").waitFor();
  await page.getByTestId("home-recommendation-card").first().waitFor();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="home-recommendation-card"] img')).filter((image) => image.naturalWidth > 0).length >= 3);

  const homeText = await home.innerText();
  assert(!homeText.includes("WARDORA") && !homeText.includes("今天穿什么"), "legacy eyebrow/title still visible");
  assert(/早上好|中午好|下午好|晚上好/.test(homeText), "time-semantic greeting missing");
  assert((await page.getByTestId("home-location-entry").innerText()).includes("上海 · 常驻"), "single authoritative location missing");
  assert(await page.getByTestId("home-weather-today").isVisible(), "today weather card missing");
  assert(await page.getByTestId("home-weather-tomorrow").isVisible(), "tomorrow weather card missing");
  assert(await page.getByTestId("home-date-strip").isVisible(), "date strip missing from recommendation panel");
  assert((await page.getByTestId("home-recommendation-card").count()) === 3, "real recommendation candidates not rendered");
  assert((await page.getByTestId("home-recommendation-card").locator("img").count()) >= 9, "server garment thumbnails not joined into cards");
  assert((await page.getByTestId("home-feed-navigation").innerText()).includes("首页"), "bottom navigation missing");
  const visualGeometry = await page.evaluate(() => {
    const aligned = (selector, rows) => rows.every((row) => {
      const tops = [...document.querySelectorAll(`${selector} [${row}]`)].map((element) => element.getBoundingClientRect().top);
      return tops.length > 1 && Math.max(...tops) - Math.min(...tops) <= 1;
    });
    const shadows = [...document.querySelectorAll('[data-testid="home-weather-module"], [data-testid="home-recommendation-card"]')].map((element) => getComputedStyle(element).boxShadow);
    const recommendation = document.querySelector('[data-testid="home-recommendation-module"]');
    const recommendationToolbar = document.querySelector('[data-testid="home-recommendation-toolbar"]');
    const card = document.querySelector('[data-testid="home-recommendation-card"]');
    const target = card?.querySelector('[data-rec-row="target"]');
    const targetLabel = card?.querySelector('[data-testid="home-recommendation-target-label"]');
    const nav = document.querySelector('[data-testid="home-feed-navigation"]');
    const activeNav = nav?.querySelector('[aria-current="page"]');
    const navRect = nav?.getBoundingClientRect();
    const activeNavRect = activeNav?.getBoundingClientRect();
    const weatherShell = document.querySelector('[data-testid="home-weather-module"]');
    const weatherDay = document.querySelector('[data-testid="home-weather-today"]');
    const locationLabel = weatherShell?.querySelector('[data-testid="home-location-label"]');
    const weatherShellStyle = weatherShell ? getComputedStyle(weatherShell) : null;
    const number = (value) => Number.parseFloat(value || "0");
    return {
      weatherRowsAligned: aligned('[data-testid^="home-weather-"]', ['data-weather-row="label"', 'data-weather-row="temperature"', 'data-weather-row="summary"', 'data-weather-row="meta"']),
      recommendationRowsAligned: aligned('[data-testid="home-recommendation-rail"]', ['data-rec-row="target"', 'data-rec-row="title"', 'data-rec-row="garments"', 'data-rec-row="reason"', 'data-rec-row="risk"']),
      shadows,
      firstLevelLeft: recommendation?.getBoundingClientRect().left,
      toolbarLeft: recommendationToolbar?.getBoundingClientRect().left,
      cardLeft: card?.getBoundingClientRect().left,
      cardInnerInset: card && target ? target.getBoundingClientRect().left - card.getBoundingClientRect().left : 0,
      cardTitleTopInset: card && targetLabel ? targetLabel.getBoundingClientRect().top - card.getBoundingClientRect().top : 0,
      locationLabelTopInset: weatherShell && locationLabel ? locationLabel.getBoundingClientRect().top - weatherShell.getBoundingClientRect().top : 0,
      weatherMaterial: weatherShellStyle ? { background: weatherShellStyle.backgroundColor, shadow: weatherShellStyle.boxShadow, filter: weatherShellStyle.backdropFilter, webkitFilter: weatherShellStyle.getPropertyValue("-webkit-backdrop-filter") || "none", outerRadius: number(weatherShellStyle.borderTopLeftRadius), innerRadius: weatherDay ? number(getComputedStyle(weatherDay).borderTopLeftRadius) : 0 } : null,
      navRadii: nav && activeNav && navRect && activeNavRect ? { outer: number(getComputedStyle(nav).borderTopLeftRadius), active: number(getComputedStyle(activeNav).borderTopLeftRadius), inset: activeNavRect.left - navRect.left } : null,
    };
  });
  assert(visualGeometry.weatherRowsAligned, "weather text rows are not aligned");
  assert(visualGeometry.recommendationRowsAligned, "recommendation text rows are not aligned");
  assert(visualGeometry.shadows.every((value) => value === "none" || !/rgba\([^)]*,\s*(?:0\.\d*[1-9]\d*|1)\)/.test(value)), `unexpected card shadow: ${visualGeometry.shadows.join(" | ")}`);
  assert(Math.abs(visualGeometry.toolbarLeft - 17) <= 1 && Math.abs(visualGeometry.cardLeft - 17) <= 1, `first-level recommendation inset invalid: ${JSON.stringify(visualGeometry)}`);
  assert(visualGeometry.cardInnerInset >= 16, `recommendation card inner padding invalid: ${visualGeometry.cardInnerInset}`);
  assert(Math.abs(visualGeometry.cardTitleTopInset - visualGeometry.locationLabelTopInset) <= 1, `recommendation title does not follow the location label inset: ${JSON.stringify(visualGeometry)}`);
  assert(visualGeometry.weatherMaterial && visualGeometry.weatherMaterial.shadow === "none" && visualGeometry.weatherMaterial.filter === "none" && visualGeometry.weatherMaterial.webkitFilter === "none", `weather shell retains an unexplained material shadow: ${JSON.stringify(visualGeometry.weatherMaterial)}`);
  assert(visualGeometry.weatherMaterial && visualGeometry.weatherMaterial.background === "rgb(255, 255, 252)" && visualGeometry.weatherMaterial.outerRadius === 28 && visualGeometry.weatherMaterial.innerRadius === 22, `weather card radius/material tokens diverged: ${JSON.stringify(visualGeometry.weatherMaterial)}`);
  assert(visualGeometry.navRadii && Math.abs((visualGeometry.navRadii.outer - visualGeometry.navRadii.active) - visualGeometry.navRadii.inset) <= 1, `bottom-nav radii are not concentric: ${JSON.stringify(visualGeometry.navRadii)}`);

  const rail = page.getByTestId("home-recommendation-rail");
  assert((await rail.evaluate((node) => getComputedStyle(node).touchAction)).includes("pan-y"), "recommendation rail does not preserve vertical pan");
  await rail.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  assert((await rail.evaluate((node) => node.scrollLeft)) > 0, "recommendation rail did not scroll horizontally");
  await page.getByTestId("home-weather-tomorrow").click();
  assert(await page.getByTestId("home-date-strip").locator('button[aria-pressed="true"]').innerText().then((text) => text.includes("明天")), "tomorrow weather card did not switch recommendation date");
  await page.getByTestId("home-weather-today").click();
  await rail.evaluate((node) => { node.scrollLeft = 0; });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : width === 390 ? 844 : 932 });
    await noOverflow(page, `ready-${width}`);
    await capture(page, `ready-${width}-font100`);
    if (width === 390) await captureViewport(page, "ready-390-viewport-font100");
    await page.evaluate(() => { document.documentElement.style.fontSize = "20.8px"; });
    await noOverflow(page, `ready-${width}-font130`);
    await capture(page, `ready-${width}-font130`);
    await page.evaluate(() => { document.documentElement.style.fontSize = "16px"; });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await reloadMode(page, "locationless");
  assert((await page.getByTestId("home-location-entry").innerText()).includes("未设置城市"), "locationless entry missing");
  assert((await page.getByTestId("home-weather-module").innerText()).includes("设置地点后可查看天气"), "locationless weather state is not neutral");
  assert((await homeState(page)).includes("home-empty-locationless"), "new-user dual empty state is not normal");
  await noOverflow(page, "locationless");
  await capture(page, "locationless-empty-390");

  await reloadMode(page, "fallback");
  assert((await page.getByTestId("home-weather-module").innerText()).includes("天气服务暂时不可用"), "weather fallback state missing");
  await capture(page, "weather-fallback-390");

  await reloadMode(page, "protected");
  assert(await page.getByTestId("home-protected-plan").isVisible(), "protected primary plan is not first-class");
  assert((await page.getByTestId("home-plan-date-strip").count()) === 1, "protected plan must be followed by the date strip");
  await capture(page, "protected-plan-390");

  await reloadMode(page, "actual");
  assert(await page.getByTestId("home-actual-wear").isVisible(), "actual wear fact is not first-class");
  assert((await page.getByTestId("home-plan-date-strip").count()) === 1, "actual wear must be followed by the date strip");
  await capture(page, "actual-wear-390");

  await reloadMode(page, "travel");
  assert((await page.getByTestId("home-location-entry").innerText()).includes("北京 · 行程"), "travel forecast was incorrectly projected as locationless");
  assert((await page.getByTestId("home-recommendation-source").first().innerText()).includes("北京 · 行程"), "recommendation source omitted travel authority");
  assert((await homeState(page)).includes("home-ready-forecast"), "travel without home city must remain forecast-ready");
  await captureAffectedMatrix(page, "travel");

  await reloadMode(page, "stale");
  const staleAttribution = await page.getByTestId("home-weather-attribution").innerText();
  assert(staleAttribution.includes("QWeather") && staleAttribution.includes("缓存"), "stale provider evidence must be labeled as cached QWeather data");
  await captureAffectedMatrix(page, "stale");

  await reloadMode(page, "protected-plan-with-date-strip");
  assert(await page.getByTestId("home-plan-availability-risk").isVisible(), "blocked plan risk is not visible");
  assert((await page.getByTestId("home-protected-plan").innerText()).includes("已删除的旅行外套"), "deleted garment snapshot name was not retained");
  await captureAffectedMatrix(page, "protected-plan-with-date-strip");
  for (let index = 2; index < 7; index += 1) {
    const futureDay = page.getByTestId("home-date-strip").locator("button").nth(index);
    await futureDay.click();
    await page.waitForFunction((selectedIndex) => document.querySelectorAll('[data-testid="home-date-strip"] button')[selectedIndex]?.getAttribute("aria-pressed") === "true", index);
  }
  await capture(page, "protected-plan-future-days-390-font100");

  await reloadMode(page, "partial-weather-error");
  assert(await page.getByTestId("home-weather-today").isVisible(), "successful today card disappeared during partial failure");
  assert((await page.getByTestId("home-weather-tomorrow").innerText()).includes("重试"), "failed tomorrow card lacks its own retry");
  await captureAffectedMatrix(page, "partial-weather-error");
  const todayBeforeRetry = await page.getByTestId("home-weather-today").innerText();
  await page.getByTestId("home-weather-tomorrow").getByRole("button", { name: "重试" }).click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="home-weather-tomorrow"]')?.textContent?.includes("重试"));
  assert((await page.getByTestId("home-weather-today").innerText()) === todayBeforeRetry, "retrying tomorrow changed the successful today card");
  assert((await page.getByTestId("home-weather-tomorrow").innerText()).includes("30°/22°"), "tomorrow retry did not recover its own forecast");
  await capture(page, "partial-weather-retry-recovered-390-font100");

  const unexpectedFailures = requestFailures.filter((failure) => !/ERR_ABORTED|canceled/i.test(failure.error));
  const expectedPartialWeatherConsoleErrors = consoleErrors.filter((entry) => entry.url.startsWith(`${fixtureOrigin}/api/weather/overview`) && entry.text.includes("503"));
  const unexpectedConsoleErrors = consoleErrors.filter((entry) => !expectedPartialWeatherConsoleErrors.includes(entry));
  assert(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
  assert(unexpectedConsoleErrors.length === 0, `unexpected console errors: ${JSON.stringify(unexpectedConsoleErrors)}`);
  assert(unexpectedFailures.length === 0, `request failures: ${JSON.stringify(unexpectedFailures)}`);

  await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify({
    scenario: "wardora-home-p1.4-visual",
    viewportMatrix: [360, 390, 430],
    fontScaleMatrix: [100, 130],
    states: ["ready_forecast_real_candidates", "empty_locationless", "weather_fallback", "protected_plan", "actual_wear", "travel_forecast_without_home", "stale_qweather_attribution", "protected_plan_with_date_strip", "partial_weather_error"],
    affectedStateMatrix: Object.fromEntries(["travel", "stale", "protected-plan-with-date-strip", "partial-weather-error"].map((state) => [state, { viewports: [360, 390, 430], fontScales: [100, 130] }])),
    checklist: { greeting: true, singleLocation: true, travelAuthority: true, staleAttribution: true, dualWeatherCards: true, segmentedTabs: true, dateStripInRecommendation: true, dateStripAfterPlan: true, futureDatesAccessed: [3, 4, 5, 6, 7], partialWeatherRetryRecoveredTomorrowOnly: true, horizontalRecommendationRail: true, bottomNavigation: true, serverImageChainFixture: true, alignedTextRows: visualGeometry, noPageOverflow: true, verticalPanPriority: true },
    screenshots, pageErrors, consoleErrors, expectedPartialWeatherConsoleErrors, unexpectedConsoleErrors, requestFailures, responseErrors, unexpectedRequestFailures: unexpectedFailures,
  }, null, 2));
  console.log(`home feed P1.4 visual gate passed: ${evidenceDir}`);
} finally {
  await browser.close();
  for (const child of processes) child.kill("SIGTERM");
}

async function homeState(page) { return page.getByTestId("wardora-home-feed").getAttribute("data-home-state"); }
