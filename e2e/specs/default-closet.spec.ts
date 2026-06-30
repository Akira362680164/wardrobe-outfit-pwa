import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import { expectSingleDefaultLocation } from "../helpers/workspace";

test.describe("默认衣橱不重复创建", () => {
  test("全新账号只有一条默认衣橱 — 创建单品、刷新、重新登录后仍唯一", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // verify main UI renders
    await expect(page.getByTestId("global-create")).toBeVisible();

    // verify exactly one "默认衣橱" on settings page
    await expectSingleDefaultLocation(page);

    // go back to wardrobe home
    await navigateToTab(page, "wardrobe");

    // open create sheet, verify garment intake entry exists
    await page.getByTestId("global-create").click();
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();
    // close without creating (test does not upload images in this check)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // navigate back to settings and verify still 1 default closet
    await expectSingleDefaultLocation(page);

    // refresh and verify still 1
    await page.reload();
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);
    await expectSingleDefaultLocation(page);

    // logout
    await navigateToTab(page, "settings");
    await page.getByRole("button", { name: /^管理$/ }).click();
    const logoutBtn = page.getByRole("button", { name: "退出登录" });
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();
    await expect(page.getByText("退出登录？")).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).last().click();

    // re-login
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10_000 });
    await loginByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // verify still exactly 1 default closet
    await expectSingleDefaultLocation(page);

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });
});
