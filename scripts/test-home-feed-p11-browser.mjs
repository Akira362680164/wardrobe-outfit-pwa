import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.HOME_FEED_APP_ORIGIN ?? "http://127.0.0.1:4173";
const evidenceDir = process.env.HOME_FEED_BROWSER_EVIDENCE ?? "test-results/home-feed-p12-browser/20260717";
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const searchRequests = [];
const fatalErrors = [];
page.setDefaultTimeout(8_000);
page.setDefaultNavigationTimeout(12_000);
page.on("request", (request) => {
  if (request.url().includes("/api/weather/locations/search")) searchRequests.push(request.url());
});
page.on("pageerror", (error) => fatalErrors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("/api/weather/locations/search")) console.log(`browser:p12 search-response ${response.status()}`);
  if (response.status() >= 500) fatalErrors.push(`${response.status()} ${response.url()}`);
});
page.on("requestfailed", (request) => console.log(`browser:p12 request-failed ${request.url()} ${request.failure()?.errorText ?? "unknown"}`));

try {
console.log("browser:p12 login");
await page.goto(origin, { waitUntil: "networkidle" });
await page.screenshot({ path: `${evidenceDir}/initial.png`, fullPage: true });
if (!(await page.getByLabel("邮箱或手机号").count())) throw new Error(`login form missing: ${await page.locator("body").innerText()}`);
await page.getByLabel("邮箱或手机号").fill("fixture111@example.test");
await page.getByLabel("密码").fill("FixturePassword123!");
await page.getByLabel("我已阅读并同意").check();
await page.getByRole("button", { name: "登录", exact: true }).click();
await page.getByText("设置", { exact: true }).last().click();
await page.getByTestId("open-home-feed-preview").click();
await page.getByTestId("wardora-home-feed").waitFor();
console.log("browser:p12 home");
await page.waitForTimeout(350);
if (await page.getByRole("button", { name: "关闭提示" }).isVisible()) await page.getByRole("button", { name: "关闭提示" }).click();

for (const width of [360, 375, 390, 412, 430]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) {
    const offenders = await page.evaluate(() => Array.from(document.querySelectorAll("*")).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, testid: element.getAttribute("data-testid"), className: element.getAttribute("class"), left: rect.left, right: rect.right, width: rect.width };
    }).filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1).slice(0, 8));
    throw new Error(`${width}px horizontal overflow: ${overflow}; ${JSON.stringify(offenders)}`);
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
await page.screenshot({ path: `${evidenceDir}/home-390-font-125.png`, fullPage: true });
await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

if (await page.getByTestId("home-wardrobe-column").count()) throw new Error("wardrobe tree mounted on recommendation first paint");
await page.getByRole("tab", { name: "衣橱" }).click();
await page.getByTestId("home-wardrobe-column").waitFor();
await page.getByRole("tab", { name: "推荐" }).click();
if (!(await page.getByTestId("home-wardrobe-column").count())) throw new Error("wardrobe tree did not remain mounted");

await page.getByTestId("home-location-entry").click();
const cityInput = page.getByLabel("搜索城市");
await cityInput.fill("上");
await page.waitForTimeout(100);
await cityInput.fill("上海");
await page.waitForTimeout(550);
if (searchRequests.length !== 1) throw new Error(`expected one debounced search, got ${searchRequests.length}`);
await cityInput.fill(" 上海 ");
await page.waitForTimeout(450);
if (searchRequests.length !== 1) throw new Error(`normalized query cache missed, got ${searchRequests.length} searches`);

console.log(`browser:p12 city-sheet ${JSON.stringify(await page.getByTestId("home-city-sheet").innerText())}`);
await page.getByRole("button", { name: "设为常驻" }).click();
await page.getByRole("status").filter({ hasText: "正在保存地点" }).waitFor();
console.log("browser:p12 mutation");
await page.screenshot({ path: `${evidenceDir}/city-saving-status.png`, fullPage: true });
await page.getByRole("button").filter({ hasText: "明天" }).click();
await page.screenshot({ path: `${evidenceDir}/city-saving-state.png`, fullPage: true });
await page.getByText(/上海 · 常驻/).waitFor();
if ((await page.getByRole("button").filter({ hasText: "明天" }).getAttribute("aria-pressed")) !== "true") throw new Error("date selection was reset by delayed location mutation");

await page.getByTestId("home-location-entry").click();
await page.screenshot({ path: `${evidenceDir}/city-sheet.png`, fullPage: true });
await page.getByRole("button", { name: "关闭城市选择" }).click();
await page.getByTestId("home-city-sheet").waitFor({ state: "hidden" });

await page.getByText("设置", { exact: true }).last().click();
await page.getByTestId("open-weather-location-settings").click();
await page.getByTestId("weather-location-settings").waitFor();
console.log("browser:p12 settings");
await page.evaluate(() => { document.documentElement.style.fontSize = "20.8px"; });
for (const width of [360, 375, 390, 412, 430]) {
  await page.setViewportSize({ width, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll("body *")]
      .map((element) => ({
        tag: element.tagName,
        testid: element.getAttribute("data-testid"),
        className: typeof element.className === "string" ? element.className : "",
        rect: element.getBoundingClientRect().toJSON(),
      }))
      .filter(({ rect }) => rect.left < -1 || rect.right > window.innerWidth + 1)
      .slice(0, 8));
    throw new Error(`${width}px settings location overflow at 130% font: ${overflow}; offenders=${JSON.stringify(offenders)}`);
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await page.getByTestId("request-clear-home-city").click();
await page.getByTestId("confirm-clear-home-city").waitFor();
await page.waitForTimeout(450);
await page.screenshot({ path: `${evidenceDir}/clear-home-confirm-font-130.png`, fullPage: true });
await page.keyboard.press("Escape");
await page.getByTestId("confirm-clear-home-city").waitFor({ state: "hidden" });
await page.getByTestId("request-clear-home-city").click();
await page.getByTestId("confirm-clear-home-city").click();
await page.getByText("尚未设置", { exact: true }).waitFor();
console.log("browser:p12 clear-confirmed");
await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
await page.getByRole("button", { name: "返回设置" }).click();
await page.getByRole("button", { name: "管理", exact: true }).click();
await page.getByRole("button", { name: "退出登录", exact: true }).click();
await page.getByRole("button", { name: "退出登录", exact: true }).last().click();
await page.getByLabel("邮箱或手机号").fill("fixture222@example.test");
await page.getByLabel("密码").fill("FixturePassword123!");
await page.getByLabel("我已阅读并同意").check();
await page.getByRole("button", { name: "登录", exact: true }).click();
await page.getByText("设置", { exact: true }).last().click();
await page.getByTestId("open-home-feed-preview").click();
await page.getByText("未设置城市", { exact: true }).first().waitFor();
await page.screenshot({ path: `${evidenceDir}/account-b-cleared.png`, fullPage: true });

if (fatalErrors.length) throw new Error(`browser fatal errors: ${fatalErrors.join(" | ")}`);
console.log(JSON.stringify({ widths: [360, 375, 390, 412, 430], searchRequests: searchRequests.length, evidenceDir }));
} finally {
  await browser.close();
}
