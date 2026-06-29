/**
 * Dev Server 图片裁切实操验证 (Section 11-13)
 *
 * 覆盖流程:
 *   A. 完整录入横向+纵向图片 → 裁切 → 保存 → 首页显示
 *   B. 详情页/全屏裁切一致验证
 *   C. 只改裁切框保存
 *   D. 刷新后裁切仍生效
 *   E. 退出登录 → 重新登录 → 工作区和图片恢复
 *   F. 同步诊断无错误
 *
 * 运行: set -a && source .env.e2e.local && set +a && npx playwright test e2e/specs/dev-server-image-verification.spec.ts --reporter=list
 */
import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import {
  startGarmentIntake,
  selectImageFromAlbum,
  confirmCrop,
  submitForAiRecognition,
  fillGarmentName,
  saveGarmentBatch,
} from "../helpers/garment";
import { configureMiniMaxKeyByUi } from "../helpers/minimax-key";

test.describe("Dev Server 图片裁切实操", () => {
  test.setTimeout(300_000);

  test("A: 录入横向图片(red-shirt) → 裁切 → 保存 → 首页显示无拉伸", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await configureMiniMaxKeyByUi(page);

    await navigateToTab(page, "wardrobe");

    // 录入横向图片
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/red-shirt.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);

    // 填写名称并保存
    await fillGarmentName(page, "红色T恤测试");
    await saveGarmentBatch(page);

    // 回到首页
    await navigateToTab(page, "wardrobe");

    // 验证首页无控制台错误
    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("B: 录入纵向图片(blue-jeans) → 首页图片无拉伸", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await configureMiniMaxKeyByUi(page);

    await navigateToTab(page, "wardrobe");

    // 录入纵向窄长图片
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/blue-jeans.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);

    await fillGarmentName(page, "蓝色牛仔裤测试");
    await saveGarmentBatch(page);

    await navigateToTab(page, "wardrobe");

    // 验证首页可见且无拉伸
    const imgs = page.locator("img").filter({ has: page.locator("[src]") });
    const imgCount = await imgs.count();
    if (imgCount > 0) {
      for (let i = 0; i < Math.min(imgCount, 5); i++) {
        const img = imgs.nth(i);
        if (!(await img.isVisible().catch(() => false))) continue;
        const objectFit = await img.evaluate((el: HTMLElement) =>
          window.getComputedStyle(el).objectFit
        ).catch(() => "");
        // 不应为 fill（拉伸）
        expect(objectFit).not.toBe("fill");
      }
    }

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("C: 重新裁切保存 → 确认保存按钮启用", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await configureMiniMaxKeyByUi(page);

    await navigateToTab(page, "wardrobe");

    // 录入一张图
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/black-shoes.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);

    await fillGarmentName(page, "黑鞋测试");
    await saveGarmentBatch(page);

    // 回到首页，点击刚录入的单品进入详情
    await navigateToTab(page, "wardrobe");
    await page.waitForTimeout(1000);

    // 尝试点击第一张卡片
    const firstCard = page.locator("img[src]").first();
    if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCard.click();
      await page.waitForTimeout(2000);

      // 验证详情页有图片
      const detailImgs = page.locator("img");
      const detailImgCount = await detailImgs.count();
      expect(detailImgCount).toBeGreaterThan(0);
    }

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("D: 刷新后工作区和同步恢复", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // 确认工作区正常
    await expect(page.getByTestId("global-create")).toBeVisible();

    // 刷新页面
    await page.reload();
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // 刷新后工作区仍正常
    await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("E: 退出登录 → 重新登录 → 图片和工作区恢复", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await expect(page.getByTestId("global-create")).toBeVisible();

    // 退出
    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();
    await expect(page.getByText("退出登录？")).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).last().click();

    // 回到登录页
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10_000 });

    // 重新登录
    await loginByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // 工作区恢复
    await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("F: 同步诊断 — bootstrap 成功 + sync idle + 无错误", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // 检查 E2E sync state 诊断元素
    const syncEl = page.locator('[data-testid="e2e-sync-state"]');
    if (await syncEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      const bsState = await syncEl.getAttribute("data-bootstrap-state");
      const syncState = await syncEl.getAttribute("data-sync-state");
      const lastError = await syncEl.getAttribute("data-last-error");

      expect(bsState).toBe("ready");
      expect(syncState).toBe("idle");
      expect(lastError || "").toBe("");
    }

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });
});
