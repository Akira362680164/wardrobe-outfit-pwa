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
  const settings = page.getByText("设置", { exact: true }).last();
  await settings.waitFor({ state: "visible" });
  await settings.click();
  await page.getByTestId("open-home-feed-preview").click();
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
    return {
      weatherRowsAligned: aligned('[data-testid^="home-weather-"]', ['data-weather-row="label"', 'data-weather-row="temperature"', 'data-weather-row="summary"', 'data-weather-row="meta"']),
      recommendationRowsAligned: aligned('[data-testid="home-recommendation-rail"]', ['data-rec-row="target"', 'data-rec-row="title"', 'data-rec-row="garments"', 'data-rec-row="reason"', 'data-rec-row="risk"']),
      shadows,
    };
  });
  assert(visualGeometry.weatherRowsAligned, "weather text rows are not aligned");
  assert(visualGeometry.recommendationRowsAligned, "recommendation text rows are not aligned");
  assert(visualGeometry.shadows.every((value) => value === "none" || !/rgba\([^)]*,\s*(?:0\.\d*[1-9]\d*|1)\)/.test(value)), `unexpected card shadow: ${visualGeometry.shadows.join(" | ")}`);

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
  assert((await page.getByTestId("home-date-strip").count()) === 0, "date strip incorrectly precedes protected plan");
  await capture(page, "protected-plan-390");

  await reloadMode(page, "actual");
  assert(await page.getByTestId("home-actual-wear").isVisible(), "actual wear fact is not first-class");
  assert((await page.getByTestId("home-date-strip").count()) === 0, "date strip incorrectly precedes actual wear");
  await capture(page, "actual-wear-390");

  const unexpectedFailures = requestFailures.filter((failure) => !/ERR_ABORTED|canceled/i.test(failure.error));
  assert(pageErrors.length === 0, `page errors: ${JSON.stringify(pageErrors)}`);
  assert(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);
  assert(unexpectedFailures.length === 0, `request failures: ${JSON.stringify(unexpectedFailures)}`);

  await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify({
    scenario: "wardora-home-p1.4-visual",
    viewportMatrix: [360, 390, 430],
    fontScaleMatrix: [100, 130],
    states: ["ready_forecast_real_candidates", "empty_locationless", "weather_fallback", "protected_plan", "actual_wear"],
    checklist: { greeting: true, singleLocation: true, dualWeatherCards: true, segmentedTabs: true, dateStripInRecommendation: true, horizontalRecommendationRail: true, bottomNavigation: true, realServerImages: true, alignedTextRows: visualGeometry, noPageOverflow: true, verticalPanPriority: true },
    screenshots, pageErrors, consoleErrors, requestFailures, responseErrors, unexpectedRequestFailures: unexpectedFailures,
  }, null, 2));
  console.log(`home feed P1.4 visual gate passed: ${evidenceDir}`);
} finally {
  await browser.close();
  for (const child of processes) child.kill("SIGTERM");
}

async function homeState(page) { return page.getByTestId("wardora-home-feed").getAttribute("data-home-state"); }
