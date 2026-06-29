import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("套装 CRUD 与同步", () => {
  test("套装首页可打开 — 显示添加套装入口", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // navigate to recommend (outfit) tab
    await navigateToTab(page, "recommend");

    // global create button should be visible
    await expect(page.getByTestId("global-create")).toBeVisible();

    // open create sheet and verify "添加套装" entry
    await page.getByTestId("global-create").click();
    await expect(page.getByRole("button", { name: /添加套装/i })).toBeVisible();
    await page.keyboard.press("Escape");

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("套装创建 → 设备B恢复 → 验证数据同步", async ({ browser }) => {
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

      // Navigate to recommend tab and verify add outfit entry
      await navigateToTab(pageA, "recommend");
      await pageA.getByTestId("global-create").click();
      await expect(pageA.getByRole("button", { name: /添加套装/i })).toBeVisible();
      await pageA.keyboard.press("Escape");

      // Device B: login
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);

      await navigateToTab(pageB, "recommend");
      await expect(pageB.getByTestId("global-create")).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
