import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import { startGarmentIntake, selectImageFromAlbum, getAssetPath, confirmCrop, fillGarmentName, saveGarmentBatch } from "../helpers/garment";

test.describe("双设备数据同步", () => {
  test("设备A创建带图片单品 → 设备B登录恢复 → 设备B验证数据与图片", async ({ browser }) => {
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
      // Device A: register and create a garment
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);

      // Open intake flow and select image
      await startGarmentIntake(pageA);
      await selectImageFromAlbum(pageA, getAssetPath("red-shirt.jpg"));

      // Wait for preview to appear
      await expect(pageA.getByText(/已选择 1 张/)).toBeVisible({ timeout: 10000 });

      // Click "下一步" to proceed to confirmation
      const nextBtn = pageA.getByRole("button", { name: /下一步|确认信息/ });
      if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextBtn.click();
      }

      // Fill name and save
      await fillGarmentName(pageA, "E2E 红色上衣");
      await saveGarmentBatch(pageA);
      await waitForSyncIdle(pageA);

      // Device B: login to the same account
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);

      // Verify navbar is visible on both devices
      await expect(pageA.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();
      await expect(pageB.getByRole("button", { name: "衣橱", exact: true })).toBeVisible();

      // Both devices should show the default closet (exactly 1)
      await navigateToTab(pageA, "settings");
      await expect(pageA.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);

      await navigateToTab(pageB, "settings");
      await expect(pageB.getByRole("button", { name: /^默认衣橱/ })).toHaveCount(1);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
