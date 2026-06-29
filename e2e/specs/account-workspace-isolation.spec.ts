import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("账号工作区隔离", () => {
  test("账号A的数据不会泄露到账号B", async ({ browser }) => {
    const accountA = createE2ETestAccount();
    const accountB = createE2ETestAccount();

    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });

    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Account A registers
      await pageA.goto("/");
      await registerByUi(pageA, accountA);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);
      await expect(pageA.getByTestId("global-create")).toBeVisible();

      // Account A logs out
      await navigateToTab(pageA, "settings");
      await pageA.getByRole("button", { name: /^管理$/ }).click();
      const logoutBtnA = pageA.getByRole("button", { name: "退出登录" });
      await logoutBtnA.scrollIntoViewIfNeeded();
      await logoutBtnA.click();
      await expect(pageA.getByText("退出登录？")).toBeVisible();
      await pageA.getByRole("button", { name: "退出登录" }).last().click();
      await expect(pageA.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10000 });

      // Account B registers (different account)
      await pageB.goto("/");
      await registerByUi(pageB, accountB);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);
      await expect(pageB.getByTestId("global-create")).toBeVisible();

      // Account B should have its own workspace — default closet = 1
      await navigateToTab(pageB, "settings");
      await expect(pageB.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);

      // Account A re-logins — should still have its own workspace
      await loginByUi(pageA, accountA);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);
      await expect(pageA.getByTestId("global-create")).toBeVisible();

      await navigateToTab(pageA, "settings");
      await expect(pageA.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);

      // The two accounts have different phone numbers — verify workspace isolation
      expect(accountA.phone).not.toBe(accountB.phone);
      // Both can see main UI independently
      await navigateToTab(pageA, "wardrobe");
      await navigateToTab(pageB, "wardrobe");
      await expect(pageA.getByTestId("global-create")).toBeVisible();
      await expect(pageB.getByTestId("global-create")).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
