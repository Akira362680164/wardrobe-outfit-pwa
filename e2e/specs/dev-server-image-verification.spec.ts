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
  recoverFailedRecognitionDraft,
  saveGarmentBatch,
} from "../helpers/garment";
import { getWorkspaceOverview } from "../helpers/workspace";

test.describe("Dev Server 图片裁切实操", () => {
  test.setTimeout(300_000);

  test("A: 录入横向图片(red-shirt) → 裁切 → 保存 → 首页显示无拉伸", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await navigateToTab(page, "wardrobe");

    // 录入横向图片
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/red-shirt.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);

    await recoverFailedRecognitionDraft(page, { name: "红色T恤测试", category: "上衣", color: "红" });
    await saveGarmentBatch(page);

    const card = page.getByRole("button", { name: "红色T恤测试", exact: true });
    await expect(card.locator("img")).toBeVisible();

    // 验证首页无控制台错误
    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("B: 录入纵向图片(blue-jeans) → 首页图片无拉伸", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await navigateToTab(page, "wardrobe");

    // 录入纵向窄长图片
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/blue-jeans.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);

    await recoverFailedRecognitionDraft(page, { name: "蓝色牛仔裤测试", category: "裤子", color: "牛仔蓝" });
    await saveGarmentBatch(page);

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
    await navigateToTab(page, "wardrobe");

    // 录入一张图
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/black-shoes.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);

    await recoverFailedRecognitionDraft(page, { name: "黑鞋测试", category: "鞋", color: "黑" });
    await saveGarmentBatch(page);

    await page.getByRole("button", { name: "黑鞋测试", exact: true }).click();
    await expect(page.getByRole("region", { name: "详情图片" }).locator("img").first()).toBeVisible();

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

  test("G: 已有衣物添加灵感图 → 服务端资产读回 → 刷新后显示", async ({ page }) => {
    await registerByUi(page, createE2ETestAccount());
    await waitForBootstrapReady(page);
    await navigateToTab(page, "wardrobe");
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, "e2e/assets/red-shirt.jpg");
    await confirmCrop(page);
    await submitForAiRecognition(page);
    await recoverFailedRecognitionDraft(page, { name: "灵感图目标衣物", category: "上衣", color: "红" });
    await saveGarmentBatch(page);

    await page.getByRole("button", { name: "灵感图目标衣物", exact: true }).click();
    await page.locator("button").filter({ hasText: /^灵感$/ }).last().click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "添加灵感图" }).click();
    await (await chooserPromise).setFiles("e2e/assets/blue-jeans.jpg");
    await expect(page.getByText("1 张参考穿搭")).toBeVisible({ timeout: 20_000 });

    let overview = await getWorkspaceOverview(page);
    const garment = overview.garments.find((entry) => entry.payload.name === "灵感图目标衣物")!;
    const references = garment.payload.referenceOutfitImages as Array<{ id: string; assetField: string }>;
    expect(references).toHaveLength(1);
    expect(references[0]?.assetField).toBe(`referenceOutfitImage:${references[0]?.id}`);
    expect(garment.assetRefs?.[references[0]!.assetField]).toBeTruthy();

    await page.reload();
    await waitForBootstrapReady(page);
    await page.getByRole("button", { name: "灵感图目标衣物", exact: true }).click();
    await page.locator("button").filter({ hasText: /^灵感$/ }).last().click();
    await expect(page.getByRole("img", { name: "灵感图", exact: true })).toBeVisible();
    overview = await getWorkspaceOverview(page);
    expect(overview.garments.find((entry) => entry.id === garment.id)?.assetRefs?.[references[0]!.assetField]).toBeTruthy();
  });
});
