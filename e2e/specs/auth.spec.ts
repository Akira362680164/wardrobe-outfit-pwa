import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("注册、退出和重新登录", () => {
  test("全新账号注册 → 主界面渲染 → 无控制台错误", async ({ page, consoleErrors, requestErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // verify main UI renders after registration+bootstrap
    await expect(page.getByTestId("global-create")).toBeVisible();
    await expect(page.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();

    // only Capacitor warnings are harmless in browser E2E
    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
    // no 5xx responses
    expect(requestErrors).toEqual([]);
  });

  test("确认退出登录 → 回到登录页", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // go to account management
    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // click 退出登录
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    // wait for confirmation UI
    await expect(page.getByText("退出登录？")).toBeVisible();
    // click confirm
    await page.getByRole("button", { name: "退出登录" }).last().click();

    // should be back on login page
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10_000 });

    // verify session invalidated — login fields should be empty/ready
    await expect(page.getByLabel("手机号")).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
  });

  test("取消退出登录 → 留在账号管理页", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();

    // click 退出登录
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    // confirmation appears
    await expect(page.getByText("退出登录？")).toBeVisible();
    // click cancel
    await page.getByRole("button", { name: "取消" }).click();

    // still on account management
    await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
    await expect(page.getByText("退出登录？")).not.toBeVisible();
  });

  test("退出后重新登录 → 恢复工作区", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // verify workspace is active
    await expect(page.getByTestId("global-create")).toBeVisible();

    // logout
    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();
    await expect(page.getByText("退出登录？")).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).last().click();

    // verify on login page
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10_000 });

    // re-login
    await loginByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // workspace restored
    await expect(page.getByTestId("global-create")).toBeVisible();
    await expect(page.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });
});
