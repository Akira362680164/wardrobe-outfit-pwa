import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import { expectSingleDefaultLocation, getWorkspaceOverview } from "../helpers/workspace";
import {
  startGarmentIntake,
  completeIntakeDraft,
  getAssetPath,
  recoverFailedRecognitionDraft,
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

      await expectSingleDefaultLocation(pageA);

      await expectSingleDefaultLocation(pageB);
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
      // Device A: create through the documented no-Key manual fallback. AI itself
      // is covered separately; sync must not depend on an external model call.
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);

      await startGarmentIntake(pageA);
      await expect(pageA.getByRole("heading", { name: "选择单品照片" })).toBeVisible({ timeout: 10000 });

      await completeIntakeDraft(pageA, getAssetPath("black-shoes.jpg"));
      await recoverFailedRecognitionDraft(pageA, {
        name: "双设备同步黑色上衣",
        category: "上衣",
        color: "黑",
      });
      await saveGarmentBatch(pageA);
      await expect(pageA.getByTestId("global-create")).toBeVisible({ timeout: 10000 });

      const overviewA = await getWorkspaceOverview(pageA);
      expect(overviewA.garments).toHaveLength(1);
      expect(overviewA.garments[0].payload.name).toBe("双设备同步黑色上衣");
      expect(overviewA.garments[0].assetRefs?.imageDataUrl).toMatchObject({
        variants: expect.arrayContaining(["original", "thumbnail"]),
      });

      // Device B: login to same account, verify data synced
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);
      await expect(pageB.getByTestId("global-create")).toBeVisible({ timeout: 10000 });

      const overviewB = await getWorkspaceOverview(pageB);
      expect(overviewB.garments).toEqual(overviewA.garments);
      await navigateToTab(pageB, "wardrobe");
      await expect(pageB.getByText("双设备同步黑色上衣", { exact: true })).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
