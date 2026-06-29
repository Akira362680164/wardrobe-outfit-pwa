import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("全局加号白名单", () => {
  test("加号在主页显示", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "wardrobe");
    await expect(page.getByTestId("global-create")).toBeVisible();
    await navigateToTab(page, "recommend");
    await expect(page.getByTestId("global-create")).toBeVisible();
    await navigateToTab(page, "shopping");
    await expect(page.getByTestId("global-create")).toBeVisible();
  });

  test("加号在设置和账号页隐藏", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await navigateToTab(page, "settings");
    await expect(page.getByTestId("global-create")).not.toBeVisible();

    await page.getByRole("button", { name: /^管理$/ }).click();
    await expect(page.getByTestId("global-create")).not.toBeVisible();

    await page.getByRole("button", { name: "修改密码" }).click();
    await expect(page.getByTestId("global-create")).not.toBeVisible();
  });
});
