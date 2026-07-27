import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const host = "127.0.0.1";
const fixturePort = 4244;
const appPort = 4243;
const fixtureOrigin = `http://${host}:${fixturePort}`;
const appOrigin = `http://${host}:${appPort}`;
const evidenceDir = process.env.HOME_FEED_P5_ROLLBACK_EVIDENCE ?? "test-results/home-feed-p5-rollback/20260727";
const children = [];
await mkdir(evidenceDir, { recursive: true });

function start(command, args, env) {
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
}
async function waitFor(url, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).status < 500) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout waiting for ${url}`);
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
  NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF: "true",
});
await waitFor(appOrigin);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
try {
  await page.goto(appOrigin, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱或手机号").fill("fixture111@example.test");
  await page.getByLabel("密码").fill("FixturePassword123!");
  await page.getByLabel("我已阅读并同意").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByText("全部衣橱", { exact: true }).first().waitFor();
  assert((await page.getByTestId("wardora-home-feed").count()) === 0, "emergency-off still launched home_feed");
  assert((await page.getByTestId("open-home-feed-preview").count()) === 0, "emergency rollback exposed the removed preview entry");
  const screenshot = `${evidenceDir}/rollback-wardrobe-home-390.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  await writeFile(`${evidenceDir}/manifest.json`, JSON.stringify({
    explicitEnv: "NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF=true",
    launchedRoute: "wardrobe_home",
    homeFeedVisible: false,
    previewEntryVisible: false,
    screenshot,
  }, null, 2));
  console.log(`home feed P5 emergency rollback gate passed: ${evidenceDir}`);
} finally {
  await browser.close();
  for (const child of children) child.kill("SIGTERM");
}
