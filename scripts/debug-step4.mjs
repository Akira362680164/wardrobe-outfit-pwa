import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const demo = page.locator('button:has-text("示例衣橱")').first();
  if (await demo.count() > 0 && await demo.isVisible().catch(() => false)) {
    await demo.click(); await page.waitForTimeout(4000);
  }

  await page.locator('button:has-text("套装")').last().click({ force: true });
  await page.waitForTimeout(1000);

  await page.locator('button[aria-label="新建"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("创建搭配")').first().click();
  await page.waitForTimeout(2000);

  const cards = page.locator('button:has(img)');
  await cards.nth(0).click(); await page.waitForTimeout(200);
  await cards.nth(1).click(); await page.waitForTimeout(300);
  await page.locator('button:has-text("继续")').first().click();
  await page.waitForTimeout(3000);
  await page.locator('button:has-text("生成草稿")').first().click();
  await page.waitForTimeout(2000);
  
  // Click "继续" on review step
  console.log("Clicking 继续 on review step...");
  await page.locator('button:has-text("继续")').first().click();
  await page.waitForTimeout(2000);
  
  console.log("\n=== STEP 4 (save) buttons ===");
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/dbg-step4.png" });
  const all = page.locator("button:visible");
  for (let i = 0; i < await all.count(); i++) {
    const t = await all.nth(i).textContent();
    if (t?.trim()) console.log(`  "${t.trim()}"`);
  }
  const text = await page.textContent("body");
  console.log("\nBody text:", text?.substring(0, 500));

  await browser.close();
}
main().catch(console.error);
