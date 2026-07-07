import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";

const root = join(__dirname, "..");
const htmlUrl = pathToFileURL(join(root, "docs/designs/wardrobe-ui-spec.html")).toString();

async function checkViewport(width: number, height: number) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(htmlUrl);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `horizontal overflow at ${width}x${height}`);
    assert.ok(await page.locator("h1").count(), "h1 exists");
    assert.ok(await page.locator(".token-grid").count(), "token swatches exist");
    assert.ok(await page.locator(".phone-preview").count(), "phone preview exists");
    assert.ok(await page.locator(".side nav").count(), "section navigation exists");
    assert.ok(await page.locator(".part-visual").count(), "part-level visuals exist");
    assert.ok(await page.locator('[data-visual="detail-media"]').count(), "detail media visual exists");
    assert.ok(await page.locator('[data-visual="color-fields"]').count(), "color fields visual exists");
    assert.ok(await page.locator('[data-visual="temperature-range"]').count(), "temperature range visual exists");
    assert.ok(await page.locator('[data-visual="icon-library"] .demo-icon').count(), "icon library visual exists");
    assert.ok(await page.locator(".phone-preview .phone-nav .demo-icon").count(), "hero nav icons exist");
    assert.ok(await page.locator(".temperature-view-window").count(), "temperature view window exists");
    assert.ok(await page.locator(".practice-board .practice-phone").count(), "product practice screens exist");
    assert.ok(await page.locator(".toast-stage .mini-toast").count(), "toast visual exists");
  } finally {
    await browser.close();
  }
}

async function main() {
  await checkViewport(1280, 900);
  await checkViewport(390, 844);
  await checkViewport(360, 780);
  console.log("ui spec preview render: passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
