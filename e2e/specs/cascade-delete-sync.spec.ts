import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import { expectSingleDefaultLocation } from "../helpers/workspace";

test.describe("删除级联与数据一致性", () => {
  test("删除默认衣橱中的单品后，本地与服务端默认衣橱仍唯一", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // verify default closet exists
    await expectSingleDefaultLocation(page);

    // go back to wardrobe home
    await navigateToTab(page, "wardrobe");
    await expect(page.getByTestId("global-create")).toBeVisible();

    // refresh and verify default closet still 1
    await page.reload();
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await expectSingleDefaultLocation(page);

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("注销后重新登录 — 默认衣橱不重复", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // logout
    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();
    await expect(page.getByText("退出登录？")).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).last().click();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10000 });

    // re-login
    await loginByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // default closet should still be unique
    await expectSingleDefaultLocation(page);
  });
});
