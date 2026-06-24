import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Demo
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  const demo = page.locator('button:has-text("示例衣橱")').first();
  if (await demo.count() > 0 && await demo.isVisible().catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(5000);
    console.log("Demo loaded");
  }

  // Outfit tab
  await page.locator('button:has-text("套装")').last().click({ force: true });
  await page.waitForTimeout(1000);

  // FAB → create
  await page.locator('button[aria-label="新建"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("创建搭配")').first().click();
  await page.waitForTimeout(2000);

  // Select 2 items
  const cards = page.locator('button:has(img)');
  console.log(`Cards: ${await cards.count()}`);
  await cards.nth(0).click(); await page.waitForTimeout(200);
  await cards.nth(1).click(); await page.waitForTimeout(300);

  // Continue → step 2
  await page.locator('button:has-text("继续")').first().click();
  await page.waitForTimeout(3000);
  console.log("\n=== STEP 2 (analyze) buttons ===");
  let all = page.locator("button:visible");
  for (let i = 0; i < await all.count(); i++) {
    const t = await all.nth(i).textContent();
    if (t?.trim()) console.log(`  "${t.trim()}"`);
  }

  // 生成草稿 → step 3
  await page.locator('button:has-text("生成草稿")').first().click();
  await page.waitForTimeout(2000);
  console.log("\n=== STEP 3 (review) buttons ===");
  all = page.locator("button:visible");
  for (let i = 0; i < await all.count(); i++) {
    const t = await all.nth(i).textContent();
    if (t?.trim()) console.log(`  "${t.trim()}"`);
  }

  // Try clicking save
  const saveBtn = page.locator('button:has-text("保存")').first();
  const saveBtn2 = page.locator('button:has-text("完成")').first();
  console.log(`\n"保存": ${await saveBtn.count()}, "完成": ${await saveBtn2.count()}`);

  // Check all visible buttons more carefully
  console.log("\nAll visible buttons:");
  for (let i = 0; i < await all.count(); i++) {
    const t = await all.nth(i).textContent();
    const c = await all.nth(i).getAttribute("class");
    console.log(`  [${i}] "${t?.trim()}" class="${c?.substring(0, 80)}"`);
  }

  await browser.close();
}
main().catch(console.error);
