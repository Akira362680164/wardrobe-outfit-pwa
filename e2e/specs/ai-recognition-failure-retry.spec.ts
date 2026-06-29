import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { configureMiniMaxKeyByUi, clearMiniMaxKeyFromBrowser } from "../helpers/minimax-key";
import {
  openGlobalCreateSheet,
  startGarmentIntake,
  completeIntakeDraft,
  getAssetPath,
  saveGarmentBatch,
} from "../helpers/garment";

test.describe("AI 识别故障与重试", () => {
  test("无 MiniMax Key 时录入入口仍可访问", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await clearMiniMaxKeyFromBrowser(page);

    await openGlobalCreateSheet(page);
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("global-create")).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  test("配置 MiniMax Key → AI 识别成功 → 录入保存", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await configureMiniMaxKeyByUi(page);

    await startGarmentIntake(page);
    await expect(page.getByRole("heading", { name: "选择单品照片" })).toBeVisible({ timeout: 10000 });

    await completeIntakeDraft(page, getAssetPath("blue-jeans.jpg"));
    await saveGarmentBatch(page);

    await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 10000 });

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });
});
