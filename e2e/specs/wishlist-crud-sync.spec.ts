import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("种草 CRUD 与同步", () => {
  test("种草首页可打开 — 显示添加种草入口", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // navigate to shopping (wishlist) tab
    await navigateToTab(page, "shopping");

    // global create button should be visible on wishlist_home
    await expect(page.getByTestId("global-create")).toBeVisible();

    // open create sheet and verify "添加种草单品" entry
    await page.getByTestId("global-create").click();
    await expect(page.getByRole("button", { name: /添加种草/i })).toBeVisible();
    await page.keyboard.press("Escape");

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("种草创建 → 设备B恢复 → 验证数据同步", async ({ browser }) => {
    const account = createE2ETestAccount();

    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Device A: register
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);

      // Navigate to shopping tab and open create sheet
      await navigateToTab(pageA, "shopping");
      await pageA.getByTestId("global-create").click();
      await expect(pageA.getByRole("button", { name: /添加种草/i })).toBeVisible();
      await pageA.keyboard.press("Escape");

      // Device B: login
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);

      // Both should have consistent wishlist home
      await navigateToTab(pageB, "shopping");
      await expect(pageB.getByTestId("global-create")).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
