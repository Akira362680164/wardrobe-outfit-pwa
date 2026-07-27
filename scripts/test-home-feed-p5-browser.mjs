import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const fixturePort = Number(process.env.HOME_FEED_FIXTURE_PORT ?? 4234);
const appPort = Number(process.env.HOME_FEED_APP_PORT ?? 4233);
const fixtureOrigin = `http://${host}:${fixturePort}`;
const appOrigin = `http://${host}:${appPort}`;
const evidenceDir = process.env.HOME_FEED_P5_EVIDENCE ?? "test-results/home-feed-p5-browser/20260727";
const children = [];
const screenshots = [];
const pageErrors = [];
const consoleErrors = [];

await mkdir(evidenceDir, { recursive: true });

function start(command, args, env) {
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
}

async function waitFor(url, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout waiting for ${url}`);
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function capture(page, name) {
  const path = `${evidenceDir}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `${label}: horizontal overflow ${overflow}px`);
}

async function waitForStableRoute(page, routeName) {
  await page.locator(`[data-navigation-presence="current"]`).waitFor();
  await page.waitForFunction((name) => {
    const container = document.querySelector(`[data-navigation-to="${name}"]`);
    return Boolean(
      container
      && container.querySelectorAll('[data-navigation-presence="current"]').length === 1
      && container.querySelectorAll('[data-navigation-presence="exiting"]').length === 0,
    );
  }, routeName);
}

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
});
await waitFor(appOrigin);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text());
});

try {
  await page.goto(appOrigin, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱或手机号").fill("fixture111@example.test");
  await page.getByLabel("密码").fill("FixturePassword123!");
  await page.getByLabel("我已阅读并同意").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByTestId("wardora-home-feed").waitFor();
  await waitForStableRoute(page, "home_feed");
  assert((await page.getByTestId("home-feed-navigation").innerText()).includes("首页"), "Home navigation is not selected");
  assert((await page.getByTestId("open-home-feed-preview").count()) === 0, "legacy preview entry exists on the default home");

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : width === 390 ? 844 : 932 });
    for (const [scale, fontSize] of [[100, "16px"], [130, "20.8px"]]) {
      await page.evaluate((value) => { document.documentElement.style.fontSize = value; document.scrollingElement.scrollTo(0, 0); }, fontSize);
      await assertNoOverflow(page, `home-${width}-${scale}`);
      await capture(page, `home-${width}-font${scale}`);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "16px"; });
  await page.getByRole("tab", { name: "衣橱", exact: true }).click();
  await page.getByRole("tabpanel", { name: "衣橱" }).waitFor();
  await assertNoOverflow(page, "home-wardrobe");
  await capture(page, "home-wardrobe-390-font100");

  await page.getByText("设置", { exact: true }).last().click();
  await page.getByRole("heading", { name: "设置", exact: true }).waitFor();
  await waitForStableRoute(page, "settings_home");
  const settingsText = await page.locator("main").innerText();
  assert(!settingsText.includes("Wardora 新首页预览") && !settingsText.includes("内部只读入口"), "legacy preview copy remains in Settings");
  assert((await page.getByTestId("open-home-feed-preview").count()) === 0, "legacy preview control remains in Settings");
  await capture(page, "settings-390-font100");
  await page.evaluate(() => { document.documentElement.style.fontSize = "20.8px"; });
  await assertNoOverflow(page, "settings-390-130");
  await capture(page, "settings-390-font130");

  await page.evaluate(() => { document.documentElement.style.fontSize = "16px"; });
  // Next dev toolbar overlaps the lower-left Tab in headless development mode.
  // Force is limited to this dev-only overlay; the production build has no portal.
  await page.getByText("首页", { exact: true }).last().evaluate((element) => {
    const button = element.closest("button");
    if (!button) throw new Error("Home Tab button missing");
    button.click();
  });
  await page.getByTestId("wardora-home-feed").waitFor();
  assert((await page.getByTestId("home-feed-navigation").innerText()).includes("首页"), "Home Tab did not return to home_feed");

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
  await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify({
    appOrigin,
    fixtureOrigin,
    widths: [360, 390, 430],
    fontScales: [100, 130],
    screenshots,
    pageErrors,
    consoleErrors,
    assertions: {
      defaultRoute: "home_feed",
      wardrobeTab: true,
      settingsPreviewEntryAbsent: true,
      homeTabReturn: true,
      overflow: 0,
    },
  }, null, 2));
  console.log(`home feed P5 browser gate passed: ${evidenceDir}`);
} finally {
  await browser.close();
  for (const child of children) child.kill("SIGTERM");
}
