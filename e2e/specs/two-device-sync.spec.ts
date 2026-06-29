import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";

test.describe("双设备同步", () => {
  test("设备A注册，设备B登录同一账号", async ({ browser }) => {
    const account = createE2ETestAccount();

    const contextA = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const contextB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // device A: register
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);

      // device A: confirm navbar is visible
      await expect(pageA.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();

      // device B: login same account
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);

      // device B: also sees the app
      await expect(pageB.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
