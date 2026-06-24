import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Close any overlay
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Click demo
  console.log("Clicking demo...");
  const demo = page.locator('button:has-text("示例衣橱")').first();
  console.log(`  Demo btn: exists=${await demo.count() > 0}, visible=${await demo.isVisible().catch(()=>false)}`);
  if (await demo.count() > 0) {
    await demo.click({ force: true }).catch(e => console.log("  Click error:", e.message));
    await page.waitForTimeout(5000);
  }

  // Check what's on the page now
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/dbg-after-demo.png" });
  const text = await page.textContent("body");
  console.log("After demo:", text?.substring(0, 500));

  // Check for items
  const allBtns = page.locator("button:visible");
  const cnt = await allBtns.count();
  for (let i = 0; i < cnt; i++) {
    const txt = await allBtns.nth(i).textContent();
    if (txt?.trim()) console.log(`  Btn ${i}: "${txt.trim()}"`);
  }

  // Navigate to outfit tab
  await page.locator('button:has-text("套装")').last().click({ force: true });
  await page.waitForTimeout(1000);
  console.log("\nAfter navigating to outfit tab:");
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/dbg-outfit-tab.png" });
  const t2 = await page.textContent("body");
  console.log(t2?.substring(0, 500));

  // FAB → create
  const fab = page.locator('button[aria-label="新建"]');
  if (await fab.count() > 0) {
    await fab.first().click();
    await page.waitForTimeout(600);
    const create = page.locator('button:has-text("创建搭配")').first();
    if (await create.count() > 0) {
      await create.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "scripts/screenshots-v1.0.0/dbg-create-flow.png" });
      const t3 = await page.textContent("body");
      console.log("\nCreate flow - looking for items...");
      // Print visible buttons
      const all = page.locator("button:visible");
      for (let i = 0; i < await all.count(); i++) {
        const txt = await all.nth(i).textContent();
        if (txt?.trim()) console.log(`  "${txt.trim()}"`);
      }
      // Check for any imgs
      console.log(`\nImages on page: ${await page.locator("img").count()}`);
    }
  }

  await browser.close();
}
main().catch(console.error);
