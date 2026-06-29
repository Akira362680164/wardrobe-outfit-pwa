import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { configureMiniMaxKeyByUi } from "../helpers/minimax-key";
import { navigateToTab } from "../helpers/navigation";
import {
  startGarmentIntake,
  completeIntakeDraft,
  getAssetPath,
  saveGarmentBatch,
} from "../helpers/garment";

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
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);
      await expect(pageA.getByTestId("global-create")).toBeVisible();

      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);
      await expect(pageB.getByTestId("global-create")).toBeVisible();

      await navigateToTab(pageA, "settings");
      await expect(pageA.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);

      await navigateToTab(pageB, "settings");
      await expect(pageB.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("设备A录入带图单品 → 设备B登录恢复 → 验证同步", async ({ browser }) => {
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
      // Device A: register, configure MiniMax, create garment with image
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);
      await configureMiniMaxKeyByUi(pageA);

      await startGarmentIntake(pageA);
      await expect(pageA.getByRole("heading", { name: "选择单品照片" })).toBeVisible({ timeout: 10000 });

      await completeIntakeDraft(pageA, getAssetPath("black-shoes.jpg"));
      await saveGarmentBatch(pageA);
      await expect(pageA.getByTestId("global-create")).toBeVisible({ timeout: 10000 });

      // Device B: login to same account, verify data synced
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);
      await expect(pageB.getByTestId("global-create")).toBeVisible({ timeout: 10000 });

      await expect(pageA.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();
      await expect(pageB.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
