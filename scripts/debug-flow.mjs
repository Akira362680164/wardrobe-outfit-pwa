import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Seed demo data
  const backdrop = page.locator('.fixed.inset-0.z-50 .absolute.inset-0').first();
  if (await backdrop.count() === 0) {
    const demoBtn = page.locator('button:has-text("示例衣橱")').first();
    if (await demoBtn.count() > 0) {
      await demoBtn.click({ force: true, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(4000);
      console.log("Demo loaded");
    }
  }
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/debug-0-demo.png" });

  // Navigate to outfit tab
  const navBtn = page.locator('button:has-text("套装")').last();
  await navBtn.click({ force: true });
  await page.waitForTimeout(1000);

  // Click FAB → create outfit
  const fab = page.locator('button[aria-label="新建"]');
  await fab.first().click();
  await page.waitForTimeout(600);
  const createBtn = page.locator('button:has-text("创建搭配")').first();
  await createBtn.click();
  await page.waitForTimeout(2000);

  // Step 1: Select items
  console.log("\n=== STEP 1: SELECT ===");
  let text = await page.textContent("body");
  console.log("Text snippet:", text?.substring(0, 300));
  const allBtns = page.locator("button");
  const btnCount = await allBtns.count();
  for (let i = 0; i < btnCount; i++) {
    const txt = await allBtns.nth(i).textContent();
    const vis = await allBtns.nth(i).isVisible();
    if (vis && txt?.trim()) console.log(`  Btn: "${txt.trim()}"`);
  }

  // Select items
  const itemCards = page.locator('button:has(img)');
  const cnt = await itemCards.count();
  console.log(`\nSelectable cards: ${cnt}`);
  if (cnt >= 2) {
    await itemCards.nth(0).click();
    await page.waitForTimeout(200);
    await itemCards.nth(1).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "scripts/screenshots-v1.0.0/debug-1-selected.png" });
  }

  // Find next button
  console.log("\n=== After selecting 2 items ===");
  text = await page.textContent("body");
  for (let i = 0; i < btnCount; i++) {
    const txt = await allBtns.nth(i).textContent();
    const vis = await allBtns.nth(i).isVisible();
    if (vis && txt?.trim()) console.log(`  Btn: "${txt.trim()}"`);
  }

  // Click next
  let nextBtn = page.locator('button:has-text("分析套装")').first();
  if (await nextBtn.count() === 0) nextBtn = page.locator('button:has-text("下一步")').first();
  if (await nextBtn.count() === 0) nextBtn = page.locator('button:has-text("继续")').first();
  console.log(`\nNext btn: count=${await nextBtn.count()}`);
  if (await nextBtn.count() > 0) {
    await nextBtn.click();
    await page.waitForTimeout(3000);
  }

  // Step 2: Analyze
  console.log("\n=== STEP 2: ANALYZE ===");
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/debug-2-analyze.png" });
  text = await page.textContent("body");
  console.log("Text:", text?.substring(0, 500));
  for (let i = 0; i < btnCount; i++) {
    const txt = await allBtns.nth(i).textContent();
    const vis = await allBtns.nth(i).isVisible();
    if (vis && txt?.trim()) console.log(`  Btn: "${txt.trim()}"`);
  }

  // Click next
  nextBtn = page.locator('button:has-text("校对信息")').first();
  if (await nextBtn.count() === 0) nextBtn = page.locator('button:has-text("下一步")').first();
  if (await nextBtn.count() === 0) nextBtn = page.locator('button:has-text("继续")').first();
  console.log(`\nNext btn: count=${await nextBtn.count()}`);
  if (await nextBtn.count() > 0) {
    await nextBtn.click();
    await page.waitForTimeout(2000);
  }

  // Step 3: Review
  console.log("\n=== STEP 3: REVIEW ===");
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/debug-3-review.png" });
  text = await page.textContent("body");
  console.log("Text:", text?.substring(0, 500));
  for (let i = 0; i < btnCount; i++) {
    const txt = await allBtns.nth(i).textContent();
    const vis = await allBtns.nth(i).isVisible();
    if (vis && txt?.trim()) console.log(`  Btn: "${txt.trim()}"`);
  }

  // Click save
  nextBtn = page.locator('button:has-text("保存完成")').first();
  if (await nextBtn.count() === 0) nextBtn = page.locator('button:has-text("保存")').first();
  if (await nextBtn.count() === 0) nextBtn = page.locator('button:has-text("完成")').first();
  console.log(`\nSave btn: count=${await nextBtn.count()}`);
  if (await nextBtn.count() > 0) {
    await nextBtn.click();
    await page.waitForTimeout(3000);
  }

  // Step 4: Detail page
  console.log("\n=== AFTER SAVE (detail page?) ===");
  await page.screenshot({ path: "scripts/screenshots-v1.0.0/debug-4-detail.png" });
  text = await page.textContent("body");
  console.log("Text:", text?.substring(0, 600));

  await browser.close();
}
main().catch(console.error);
