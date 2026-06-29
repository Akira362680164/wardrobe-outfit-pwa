import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { clearMiniMaxKeyFromBrowser, assertMiniMaxKeyAvailable } from "../helpers/minimax-key";
import { openGlobalCreateSheet } from "../helpers/garment";

test.describe("AI 识别故障与重试", () => {
  test("无 MiniMax Key 时录入入口仍可访问", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // clear any existing MiniMax key
    await clearMiniMaxKeyFromBrowser(page);

    // verify intake entry is still accessible even without MiniMax key
    await openGlobalCreateSheet(page);
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();
    await page.keyboard.press("Escape");

    // verify app is still functional
    await expect(page.getByTestId("global-create")).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  // ponytail: MiniMax key configuration via UI and full AI recognition flow
  // requires file upload that depends on Capacitor APIs in browser.
  test.skip("配置 MiniMax Key → 录入单品 → AI 识别或手动兜底", async () => {
    assertMiniMaxKeyAvailable();
  });
});
