import { chromium } from "playwright";
const BASE_URL = "http://localhost:3000";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  const fab = page.locator('button[aria-label="新建"]');
  const fabCount = await fab.count();
  console.log("FAB count:", fabCount);
  if (fabCount > 0) {
    await fab.first().click();
    await page.waitForTimeout(800);

    const bodyText = await page.textContent("body");
    console.log("\n=== BODY TEXT ===");
    console.log(bodyText?.substring(0, 2000));

    console.log("\n=== BUTTONS ===");
    const buttons = page.locator("button");
    const btnCount = await buttons.count();
    for (let i = 0; i < Math.min(btnCount, 25); i++) {
      const text = await buttons.nth(i).textContent();
      const cls = await buttons.nth(i).getAttribute("class");
      const visible = await buttons.nth(i).isVisible();
      console.log(`  Btn ${i}: "${text?.trim()}" visible=${visible} class=${cls?.substring(0, 120)}`);
    }
  }

  await browser.close();
}
main().catch(console.error);
