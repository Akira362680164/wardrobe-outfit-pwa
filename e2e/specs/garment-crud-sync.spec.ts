import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { navigateToTab } from "../helpers/navigation";
import { openGlobalCreateSheet } from "../helpers/garment";

test.describe("单品录入 UI 可达性", () => {
  test("全局新建面板包含添加衣物入口", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // open create sheet from wardrobe home
    await openGlobalCreateSheet(page);
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();

    // close sheet
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // verify we're still on the main page
    await expect(page.getByTestId("global-create")).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });

  // ponytail: full image upload + crop + AI + save flow requires Capacitor APIs
  // that aren't available in browser E2E. The hidden-input fallback has timing
  // issues with fileChooser. Run on real device or Capacitor-enabled environment.
  test.skip("单品完整录入流程：选图 → 裁切 → 识别 → 保存", async ({ page }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await openGlobalCreateSheet(page);
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
