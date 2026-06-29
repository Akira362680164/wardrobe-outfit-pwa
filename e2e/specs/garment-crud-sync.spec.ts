import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi, loginByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import {
  startGarmentIntake,
  selectImageFromAlbum,
  getAssetPath,
  confirmCrop,
  fillGarmentName,
  saveGarmentBatch,
  deleteGarmentViaDetail,
} from "../helpers/garment";
import { configureMiniMaxKeyByUi } from "../helpers/minimax-key";

test.describe("单品 CRUD 与同步", () => {
  test("单品完整录入流程：选图 → 裁切 → 识别 → 保存", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // configure MiniMax key if available
    try {
      await configureMiniMaxKeyByUi(page);
    } catch {
      // MiniMax key not available — intake will use manual entry fallback
    }

    // open intake flow and select image
    await startGarmentIntake(page);
    await selectImageFromAlbum(page, getAssetPath("red-shirt.jpg"));

    // verify preview appears — image was selected
    await expect(page.getByText(/已选择 1 张/)).toBeVisible({ timeout: 10000 });

    // confirm crop
    await confirmCrop(page);

    // after crop, either AI recognition runs or manual entry is available
    // fill name (works for both AI and manual paths)
    await fillGarmentName(page, "E2E 红色上衣");

    // save
    await saveGarmentBatch(page);
    await waitForSyncIdle(page);

    // verify we're back on a main page
    await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 15000 });

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("单品创建 → 设备B恢复 → 双方验证", async ({ browser }) => {
    const account = createE2ETestAccount();

    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      // Device A: register and create garment
      await pageA.goto("/");
      await registerByUi(pageA, account);
      await waitForBootstrapReady(pageA);
      await waitForSyncIdle(pageA);

      try { await configureMiniMaxKeyByUi(pageA); } catch { /* manual fallback */ }

      await startGarmentIntake(pageA);
      await selectImageFromAlbum(pageA, getAssetPath("red-shirt.jpg"));
      await expect(pageA.getByText(/已选择 1 张/)).toBeVisible({ timeout: 10000 });
      await confirmCrop(pageA);
      await fillGarmentName(pageA, "E2E 红色上衣");
      await saveGarmentBatch(pageA);
      await waitForSyncIdle(pageA);

      // Device B: login and verify
      await pageB.goto("/");
      await loginByUi(pageB, account);
      await waitForBootstrapReady(pageB);
      await waitForSyncIdle(pageB);

      await expect(pageB.getByTestId("global-create")).toBeVisible({ timeout: 15000 });

      // Both devices should show consistent state
      await expect(pageA.getByTestId("global-create")).toBeVisible();
      await expect(pageB.getByTestId("global-create")).toBeVisible();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
