import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const fixturePort = 4194, appPort = 4193, host = "127.0.0.1";
const fixtureOrigin = `http://${host}:${fixturePort}`, appOrigin = `http://${host}:${appPort}`;
const prototypePath = "/Users/fangzheng/Downloads/Wardora_新首页_天气Canvas_高级动效验证_v0.2.3.html";
const evidenceDir = process.env.HOME_FEED_P3_EVIDENCE ?? "test-results/home-feed-p3-visual/20260718";
const processes = [];
await mkdir(evidenceDir, { recursive: true });

function start(command, args, env) { const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] }); processes.push(child); return child; }
async function waitFor(url, timeout = 90_000) { const end = Date.now() + timeout; while (Date.now() < end) { try { if ((await fetch(url)).status < 500) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`timeout: ${url}`); }
async function setCode(code) { const response = await fetch(`${fixtureOrigin}/__fixture/control`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set-weather-code", code }) }); if (!response.ok) throw new Error(`code control failed: ${code}`); }
async function openHome(page) { await page.goto(appOrigin, { waitUntil: "networkidle" }); if (await page.getByLabel("邮箱或手机号").isVisible().catch(() => false)) { await page.getByLabel("邮箱或手机号").fill("fixture111@example.test"); await page.getByLabel("密码").fill("FixturePassword123!"); await page.getByLabel("我已阅读并同意").check(); await page.getByRole("button", { name: "登录", exact: true }).click(); } await page.getByText("设置", { exact: true }).last().click(); await page.getByTestId("open-home-feed-preview").click(); await page.getByTestId("home-weather-today").waitFor(); }
async function compare(leftPath, rightPath, outputPath) { const leftMeta = await sharp(leftPath).metadata(), rightMeta = await sharp(rightPath).metadata(); if (!leftMeta.width || !leftMeta.height || leftMeta.width !== rightMeta.width || leftMeta.height !== rightMeta.height) throw new Error(`visual dimensions differ: ${leftMeta.width}x${leftMeta.height} vs ${rightMeta.width}x${rightMeta.height}`); const left = await sharp(leftPath).removeAlpha().raw().toBuffer(); const right = await sharp(rightPath).removeAlpha().raw().toBuffer(); let sum = 0; for (let index = 0; index < left.length; index++) sum += Math.abs(left[index] - right[index]); const meanAbsoluteError = sum / left.length / 255; const scale = 2; await sharp({ create: { width: leftMeta.width * scale * 2, height: leftMeta.height * scale, channels: 3, background: "white" } }).composite([{ input: await sharp(leftPath).resize(leftMeta.width * scale, leftMeta.height * scale).toBuffer(), left: 0, top: 0 }, { input: await sharp(rightPath).resize(rightMeta.width * scale, rightMeta.height * scale).toBuffer(), left: leftMeta.width * scale, top: 0 }]).png().toFile(outputPath); return Number(meanAbsoluteError.toFixed(5)); }

start("node", ["scripts/home-feed-browser-fixture-server.mjs"], { ...process.env, HOME_FEED_FIXTURE_PORT: String(fixturePort), HOME_FEED_APP_ORIGIN: appOrigin, HOME_FEED_FIXTURE_SCENARIO: "p14" });
await waitFor(fixtureOrigin);
start("npm", ["run", "dev", "--", "--hostname", host, "--port", String(appPort)], { ...process.env, NEXT_PUBLIC_WARDROBE_API_BASE_URL: fixtureOrigin, NEXT_PUBLIC_WARDORA_HOME_FEED_P1: "true" });
await waitFor(appOrigin);

const browser = await chromium.launch({ headless: true });
const appPage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const prototypePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await appPage.emulateMedia({ reducedMotion: "reduce" });
const results = [];
try {
  const cases = [
    { code: "304", kind: "scene", clock: 0 }, { code: "304", kind: "lightning", clock: .03 }, { code: "304", kind: "lightning", clock: .32 },
    { code: "304", kind: "hail", clock: .40 }, { code: "304", kind: "hail", clock: .70 }, { code: "304", kind: "hail", clock: .90 },
    { code: "403", kind: "scene", clock: 0 }, { code: "403", kind: "scene", clock: 2.5 },
    { code: "508", kind: "scene", clock: 0 }, { code: "508", kind: "scene", clock: 4 },
    { code: "512", kind: "scene", clock: 0 }, { code: "512", kind: "scene", clock: 8 },
    { code: "998", kind: "static", clock: 0 },
  ];
  for (const sample of cases) {
    const { code, kind, clock } = sample;
    await setCode(code); await openHome(appPage); await appPage.waitForTimeout(350);
    await appPage.addStyleTag({ content: '[data-testid="home-weather-today"] > :not(canvas){visibility:hidden!important}' });
    if (code !== "998" && (kind !== "scene" || clock !== 0)) await appPage.evaluate(({ kind, clock }) => window.__wardoraWeatherCanvasTest.preview(kind, clock), { kind, clock });
    const preview = code !== "998" && (kind !== "scene" || clock !== 0) ? `&preview=${kind}&phase=${clock}` : "&reduced=1";
    const prototypeUrl = `${pathToFileURL(prototypePath).href}?today=${code}&tomorrow=103&blind=1${preview}`;
    await prototypePage.goto(prototypeUrl, { waitUntil: "load" }); await prototypePage.locator('[data-weather-card="today"]').waitFor(); await prototypePage.waitForTimeout(150);
    const prototypeTarget = code === "998" ? prototypePage.locator('[data-weather-card="today"]') : prototypePage.locator('[data-weather-canvas="today"]');
    const appTarget = code === "998" ? appPage.getByTestId("home-weather-today") : appPage.locator('[data-weather-canvas="today"]');
    if (code !== "998") await appTarget.waitFor();
    const prototypeBox = await prototypeTarget.boundingBox();
    if (!prototypeBox) throw new Error(`${code}: prototype visual bounds missing`);
    await appPage.getByTestId("home-weather-today").evaluate((element, height) => { element.style.height = `${height}px`; element.style.minHeight = `${height}px`; }, prototypeBox.height);
    await appPage.waitForTimeout(100);
    const label = `${code}-${kind}-${String(clock).replace(".", "p")}`;
    const prototypeShot = `${evidenceDir}/${label}-prototype.png`, appShot = `${evidenceDir}/${label}-production.png`, sideBySide = `${evidenceDir}/${label}-side-by-side.png`;
    await prototypeTarget.screenshot({ path: prototypeShot }); await appTarget.screenshot({ path: appShot });
    const mae = await compare(prototypeShot, appShot, sideBySide);
    const structure = await appPage.evaluate(() => ({ diagnostics: window.__wardoraWeatherCanvas ?? null, todayCanvas: document.querySelectorAll('[data-weather-canvas="today"]').length, tomorrowCanvas: document.querySelectorAll('[data-weather-canvas="tomorrow"]').length, todayFamily: document.querySelector('[data-testid="home-weather-today"]')?.getAttribute("data-weather-family"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    if (structure.tomorrowCanvas !== 0) throw new Error(`${code}: tomorrow must remain static`);
    if (code === "998" && structure.todayCanvas !== 0) throw new Error("998 must be static");
    if (code !== "998" && structure.todayCanvas !== 1) throw new Error(`${code}: dynamic today canvas missing`);
    const threshold = code === "998" ? .03 : .08;
    if (mae > threshold) throw new Error(`${label}: MAE ${mae} exceeded ${threshold}`);
    results.push({ code, kind, clock, mae, threshold, structure, prototypeShot, appShot, sideBySide });
  }
  await writeFile(`${evidenceDir}/comparison.json`, JSON.stringify({ prototypeSha256: "30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db", fixedClocks: true, hardThresholds: true, results }, null, 2));
  console.log(JSON.stringify({ evidenceDir, results: results.map(({ code, kind, clock, mae, threshold, structure }) => ({ code, kind, clock, mae, threshold, structure })) }));
} finally {
  await browser.close();
  for (const process of processes) process.kill("SIGTERM");
}
