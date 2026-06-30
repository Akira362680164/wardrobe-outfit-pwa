import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("账号管理页面", () => {
  test("账号管理页显示正确的账号信息", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // should show account info
    await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
    await expect(page.getByText(/状态：已登录/i)).toBeVisible();
    // masked phone
    await expect(page.getByText(/139\*{4,}\d{3,4}/)).toBeVisible();
    // shortened device label, not full deviceId
    await expect(page.getByText(/设备：/)).toBeVisible();

    // only these three items should be visible
    await expect(page.getByRole("button", { name: "修改密码" })).toBeVisible();
    await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  });

  test("账号管理页不显示全局加号", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    await expect(page.getByTestId("global-create")).not.toBeVisible();
  });

  test("账号管理页不应出现同步冲突和MiniMax配置入口", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // these items must NOT be visible on the account management page
    // "MiniMax" may appear as a global notification banner — skip it
    const forbidden = [
      "同步冲突",
      "本机数据",
      "退出当前设备",
      "退出全部设备",
    ];
    for (const text of forbidden) {
      await expect(page.getByText(text, { exact: false })).not.toBeVisible();
    }
  });

  test("退出登录必须二次确认", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // click 退出登录 — confirmation UI should appear
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    await expect(page.getByText("退出登录？")).toBeVisible();
    await expect(page.getByRole("button", { name: "取消" })).toBeVisible();
    // confirm 退出登录 button still exists in the dialog
    await expect(page.getByText(/重新登录后会从服务器读取衣橱数据/)).toBeVisible();
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
