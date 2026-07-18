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
async function compare(leftPath, rightPath, outputPath) { const left = await sharp(leftPath).resize(360, 226, { fit: "fill" }).removeAlpha().raw().toBuffer(); const right = await sharp(rightPath).resize(360, 226, { fit: "fill" }).removeAlpha().raw().toBuffer(); let sum = 0; for (let index = 0; index < left.length; index++) sum += Math.abs(left[index] - right[index]); const meanAbsoluteError = sum / left.length / 255; await sharp({ create: { width: 720, height: 226, channels: 3, background: "white" } }).composite([{ input: await sharp(leftPath).resize(360, 226, { fit: "fill" }).toBuffer(), left: 0, top: 0 }, { input: await sharp(rightPath).resize(360, 226, { fit: "fill" }).toBuffer(), left: 360, top: 0 }]).png().toFile(outputPath); return Number(meanAbsoluteError.toFixed(5)); }

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
  for (const code of ["304", "403", "508", "512", "998"]) {
    await setCode(code); await openHome(appPage); await appPage.waitForTimeout(350);
    await appPage.addStyleTag({ content: '[data-testid="home-weather-today"] > :not(canvas){visibility:hidden!important}' });
    const prototypeUrl = `${pathToFileURL(prototypePath).href}?today=${code}&tomorrow=103&reduced=1&blind=1`;
    await prototypePage.goto(prototypeUrl, { waitUntil: "load" }); await prototypePage.locator('[data-weather-card="today"]').waitFor(); await prototypePage.waitForTimeout(150);
    const prototypeTarget = code === "998" ? prototypePage.locator('[data-weather-card="today"]') : prototypePage.locator('[data-weather-canvas="today"]');
    const appTarget = code === "998" ? appPage.getByTestId("home-weather-today") : appPage.locator('[data-weather-canvas="today"]');
    if (code !== "998") await appTarget.waitFor();
    const prototypeShot = `${evidenceDir}/${code}-prototype.png`, appShot = `${evidenceDir}/${code}-production.png`, sideBySide = `${evidenceDir}/${code}-side-by-side.png`;
    await prototypeTarget.screenshot({ path: prototypeShot }); await appTarget.screenshot({ path: appShot });
    const mae = await compare(prototypeShot, appShot, sideBySide);
    const structure = await appPage.evaluate(() => ({ diagnostics: window.__wardoraWeatherCanvas ?? null, todayCanvas: document.querySelectorAll('[data-weather-canvas="today"]').length, tomorrowCanvas: document.querySelectorAll('[data-weather-canvas="tomorrow"]').length, todayFamily: document.querySelector('[data-testid="home-weather-today"]')?.getAttribute("data-weather-family"), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    if (structure.tomorrowCanvas !== 0) throw new Error(`${code}: tomorrow must remain static`);
    if (code === "998" && structure.todayCanvas !== 0) throw new Error("998 must be static");
    if (code !== "998" && structure.todayCanvas !== 1) throw new Error(`${code}: dynamic today canvas missing`);
    results.push({ code, mae, structure, prototypeShot, appShot, sideBySide });
  }
  await writeFile(`${evidenceDir}/comparison.json`, JSON.stringify({ prototypeSha256: "30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db", fixedClock: 0, reducedMotion: true, results }, null, 2));
  console.log(JSON.stringify({ evidenceDir, results: results.map(({ code, mae, structure }) => ({ code, mae, structure })) }));
} finally {
  await browser.close();
  for (const process of processes) process.kill("SIGTERM");
}
