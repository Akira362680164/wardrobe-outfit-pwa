// scripts/verify-v1.1.27-color-picker.mjs
// v1.1.27: 验证 ColorSwatchPicker — 12 常用色、4 扩展组、已选颜色常驻、卡其+藏青折叠后可见。
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const PORT = process.env.PORT || "3001";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = "review-artifacts/v1.1.27-color-catalog";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const consoleErrors = [];

async function newMobilePage(viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // 忽略 webpack HMR 噪音
      if (!text.includes("webpack-hmr") && !text.includes("WebSocket")) {
        consoleErrors.push(text);
      }
    }
  });
  return page;
}

async function clearState(page) {
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.clear();
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("wardrobe-outfit-pwa");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  const seed = page.locator('button', { hasText: '示例衣橱' });
  if (await seed.count() > 0) {
    try {
      await seed.first().click({ timeout: 5000 });
      await page.waitForTimeout(3500);
    } catch (e) {}
  }
}

async function openEdit(page) {
  // 1. 点击第一张卡片
  const card = page.locator('.rounded-2xl.shadow-soft').first();
  if (await card.count() > 0) {
    try {
      await card.scrollIntoViewIfNeeded();
      await card.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch (e) {
      console.log(`  · 卡片点击失败：${e.message}`);
      return false;
    }
  }
  // 2. 详情页顶部右侧三点菜单 — lucide MoreHorizontal icon
  const moreBtn = page.locator('button[aria-label*="更多"], button[aria-label*="更多操作"]').first();
  if (await moreBtn.count() === 0) {
    // fallback: 通过 svg 找 MoreHorizontal 按钮
    const moreByIcon = page.locator('button:has(svg)').filter({ hasText: '' }).last();
    // 用 text 找标题上的 "..."
    const topBarMore = page.locator('header button').last();
    if (await topBarMore.count() > 0) {
      try {
        await topBarMore.click({ timeout: 3000 });
        await page.waitForTimeout(500);
      } catch (e) {}
    }
  } else {
    try {
      await moreBtn.click({ timeout: 3000 });
      await page.waitForTimeout(500);
    } catch (e) {}
  }
  // 3. 点击"编辑衣物"
  const editBtn = page.locator('button', { hasText: '编辑衣物' }).first();
  if (await editBtn.count() > 0) {
    try {
      await editBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      return true;
    } catch (e) {
      console.log(`  · 编辑衣物点击失败：${e.message}`);
    }
  } else {
    // fallback: 直接点击 "编辑" 文本
    const editFallback = page.locator('button', { hasText: /^编辑$/ }).first();
    if (await editFallback.count() > 0) {
      try {
        await editFallback.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        return true;
      } catch (e) {}
    }
  }
  return false;
}

const failures = [];
function assertOk(name, cond, detail) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failures.push(`${name}${detail ? ": " + detail : ""}`);
    console.log(`  ❌ ${name}${detail ? ": " + detail : ""}`);
  }
}

console.log("\n=== v1.1.27 颜色选择器 Playwright 实操 ===");

// 竖屏 390x844
console.log("\n--- 1. 竖屏 390×844 ---");
{
  const page = await newMobilePage({ width: 390, height: 844 });
  await clearState(page);
  await page.screenshot({ path: `${OUT_DIR}/00-home-390x844.png`, fullPage: false });

  const opened = await openEdit(page);
  if (!opened) console.log("  · 编辑页未打开，继续截图");
  await page.screenshot({ path: `${OUT_DIR}/garment-detail-or-edit-390x844.png`, fullPage: true });

  // 验证: 已选颜色区显示
  const selectedText = await page.locator('text=已选颜色').count();
  assertOk("1.1 已选颜色区渲染", selectedText > 0);

  const commonSwatches = await page.locator('[data-color-swatch]').count();
  console.log(`  · 色卡按钮数量 (折叠初始): ${commonSwatches}`);

  const toggleText = await page.locator('text=/展开更多颜色/').count();
  assertOk("1.2 「展开更多颜色」按钮存在", toggleText > 0);

  const khaki = page.locator('[data-color-swatch="卡其"]').first();
  if (await khaki.count() > 0) {
    await khaki.click();
    await page.waitForTimeout(300);
    const sel = await page.locator('[data-color-swatch="卡其"][data-color-selected="true"]').count();
    assertOk("1.3 选择卡其后 selected=true", sel > 0);
    await page.screenshot({ path: `${OUT_DIR}/garment-single-collapsed-390x844.png`, fullPage: true });
  } else {
    assertOk("1.3 卡其按钮存在", false, "未找到卡其按钮");
  }

  const expandBtn = page.locator('[data-color-picker-toggle]').first();
  if (await expandBtn.count() > 0) {
    await expandBtn.click();
    await page.waitForTimeout(500);
    const groups = await page.locator('[data-color-picker-group]').count();
    assertOk("1.4 展开后 4 个扩展色分组", groups === 4, `实际: ${groups}`);
    await page.screenshot({ path: `${OUT_DIR}/garment-single-expanded-390x844.png`, fullPage: true });
    const navy = page.locator('[data-color-swatch="藏青"]').first();
    if (await navy.count() > 0) {
      await navy.click();
      await page.waitForTimeout(300);
      const navySel = await page.locator('[data-color-swatch="藏青"][data-color-selected="true"]').count();
      assertOk("1.5 选中藏青后 selected=true", navySel > 0);
    }
    await expandBtn.click();
    await page.waitForTimeout(300);
    const navyChip = await page.locator('[data-color-picker-selected]').first().textContent();
    assertOk("1.6 收起后藏青仍在已选颜色区", navyChip && navyChip.includes("藏青"), `实际: ${navyChip}`);
    await page.screenshot({ path: `${OUT_DIR}/garment-single-collapsed-with-navy.png`, fullPage: true });
  } else {
    assertOk("1.4 展开按钮存在", false);
  }
  await page.close();
}

// 主辅色模式
console.log("\n--- 2. 主辅色模式 ---");
{
  const page = await newMobilePage({ width: 390, height: 844 });
  await clearState(page);
  await openEdit(page);
  await page.screenshot({ path: `${OUT_DIR}/garment-edit-main-390x844.png`, fullPage: true });
  const mainAccentBtn = page.locator('button', { hasText: '主辅色' }).first();
  if (await mainAccentBtn.count() > 0) {
    try {
      await mainAccentBtn.click({ timeout: 5000 });
      await page.waitForTimeout(500);
    } catch (e) {}
    const mainKhaki = page.locator('[data-color-swatch="卡其"]').first();
    if (await mainKhaki.count() > 0) {
      try { await mainKhaki.click({ timeout: 5000 }); await page.waitForTimeout(300); } catch (e) {}
    }
    const allKhaki = page.locator('[data-color-swatch="卡其"]');
    const khakiCount = await allKhaki.count();
    let hasDisabled = false;
    for (let i = 0; i < khakiCount; i++) {
      const isDisabled = await allKhaki.nth(i).getAttribute('data-color-disabled');
      if (isDisabled === 'true') { hasDisabled = true; break; }
    }
    assertOk("2.1 辅助色 picker 中卡其被禁用", hasDisabled);
    const accRice = page.locator('[data-color-swatch="米白"]').nth(1);
    if (await accRice.count() > 0) {
      try { await accRice.click({ timeout: 5000 }); await page.waitForTimeout(300); } catch (e) {}
      const riceSel = await accRice.getAttribute('data-color-selected');
      assertOk("2.2 辅助色米白可选", riceSel === 'true', `actual=${riceSel}`);
    }
    await page.screenshot({ path: `${OUT_DIR}/garment-main-accent-390x844.png`, fullPage: true });
  } else {
    assertOk("2.1 主辅色按钮存在", false);
  }
  await page.close();
}

// 拼色
console.log("\n--- 3. 拼色模式 ---");
{
  const page = await newMobilePage({ width: 390, height: 844 });
  await clearState(page);
  await openEdit(page);
  const multiBtn = page.locator('button', { hasText: '拼色' }).first();
  if (await multiBtn.count() > 0) {
    try { await multiBtn.click({ timeout: 5000 }); await page.waitForTimeout(500); } catch (e) {}
    for (const c of ["卡其", "藏青", "米白"]) {
      if (c === "藏青") {
        const expand = page.locator('[data-color-picker-toggle]').first();
        if (await expand.count() > 0) {
          try { await expand.click({ timeout: 3000 }); await page.waitForTimeout(300); } catch (e) {}
        }
      }
      const btn = page.locator(`[data-color-swatch="${c}"]`).first();
      if (await btn.count() > 0) {
        try { await btn.click({ timeout: 3000 }); await page.waitForTimeout(200); } catch (e) {}
      }
    }
    await page.screenshot({ path: `${OUT_DIR}/garment-multicolor-390x844.png`, fullPage: true });
    const count = await page.locator('[data-color-picker-count]').first().textContent();
    // demo item may have initial color; verify count >= 3 and total <= 5
    const m = count && count.match(/(\d+)\/(\d+)/);
    const picked = m ? parseInt(m[1], 10) : 0;
    const max = m ? parseInt(m[2], 10) : 5;
    assertOk("3.1 拼色至少选了 3 个且 ≤ 5 个", picked >= 3 && picked <= max, `actual=${count}`);
  } else {
    assertOk("3.1 拼色按钮存在", false);
  }
  await page.close();
}

// 横屏
console.log("\n--- 4. 横屏 844×390 ---");
{
  const page = await newMobilePage({ width: 844, height: 390 });
  await clearState(page);
  await openEdit(page);
  await page.screenshot({ path: `${OUT_DIR}/garment-color-landscape-844x390.png`, fullPage: true });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  assertOk("4.1 横屏无横向溢出", scrollWidth <= clientWidth + 1, `scrollW=${scrollWidth} clientW=${clientWidth}`);
  await page.close();
}

await browser.close();

console.log(`\n=== Console errors (filtered) ===`);
if (consoleErrors.length === 0) {
  console.log("  ✅ No real console errors");
} else {
  console.log(`  ❌ ${consoleErrors.length} console errors:`);
  consoleErrors.slice(0, 10).forEach((e) => console.log(`    ${e}`));
}

console.log(`\n${failures.length === 0 && consoleErrors.length === 0 ? "✅ ALL CHECKS PASSED" : "❌ FAILURES"}`);
process.exit(failures.length === 0 && consoleErrors.length === 0 ? 0 : 1);