import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("全局加号白名单", () => {
  test("加号在三个主首页显示", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // wardrobe_home
    await navigateToTab(page, "wardrobe");
    await expect(page.getByTestId("global-create")).toBeVisible();

    // outfit_home
    await navigateToTab(page, "recommend");
    await expect(page.getByTestId("global-create")).toBeVisible();

    // wishlist_home
    await navigateToTab(page, "shopping");
    await expect(page.getByTestId("global-create")).toBeVisible();
  });

  test("加号在设置、账号管理、修改密码页隐藏", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // settings_home
    await navigateToTab(page, "settings");
    await expect(page.getByTestId("global-create")).not.toBeVisible();

    // account_management
    await page.getByRole("button", { name: /^管理$/ }).click();
    await expect(page.getByTestId("global-create")).not.toBeVisible();

    // change_password
    await page.getByRole("button", { name: "修改密码" }).click();
    await expect(page.getByTestId("global-create")).not.toBeVisible();
  });

  test("加号在新建面板中显示正确的创建入口", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // open create sheet from wardrobe home
    await page.getByTestId("global-create").click();
    await expect(page.getByText("新建")).toBeVisible();

    // should show Add Clothes entry
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();

    // close
    await page.keyboard.press("Escape");
  });
});
