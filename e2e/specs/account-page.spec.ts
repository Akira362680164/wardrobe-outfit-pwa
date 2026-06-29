import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("账号管理页面", () => {
  test("账号管理页显示账号信息", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // should show account info
    await expect(page.getByText(/账号服务已连接/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
  });

  test("账号管理页不显示全局加号", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    await expect(page.getByTestId("global-create")).not.toBeVisible();
    expect(consoleErrors.filter((e) => !e.includes("Capacitor"))).toEqual([]);
  });

  test("修改密码页返回按钮回到账号管理页", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();
    await page.getByRole("button", { name: "修改密码" }).click();

    await page.getByRole("button", { name: "返回" }).click();
    await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
  });
});
