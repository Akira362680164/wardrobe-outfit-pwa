import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";

test.describe("双设备数据同步", () => {
  test("设备A注册 → 设备B登录同账号 → 两端主界面一致", async ({ browser }) => {
    const account = createE2ETestAccount();

    const ctxA = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const ctxB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });

    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Device A: register
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);
      await expect(pageA.getByTestId("global-create")).toBeVisible();

      // Device B: login to same account
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);
      await expect(pageB.getByTestId("global-create")).toBeVisible();

      // Both devices show consistent default closet
      await navigateToTab(pageA, "settings");
      await expect(pageA.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);

      await navigateToTab(pageB, "settings");
      await expect(pageB.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // ponytail: full image upload + cross-device sync requires Capacitor APIs
  // that aren't available in browser E2E. Run on real device.
  test.skip("设备A录入带图单品 → 设备B登录恢复 → 验证数据与图片", async () => {});
});
