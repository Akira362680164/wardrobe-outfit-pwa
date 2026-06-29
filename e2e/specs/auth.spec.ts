import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("注册、退出和重新登录", () => {
  test("全新账号注册 → 退出 → 重新登录全链路", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();

    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // go to account management
    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // click logout — button may be below fold in 390×844 viewport
    const logoutBtn = page.getByRole("button", { name: "退出当前设备" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    // should be back on login page
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10000 });

    // re-login
    await loginByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    expect(consoleErrors.filter((e) => !e.includes("Capacitor"))).toEqual([]);
  });
});
