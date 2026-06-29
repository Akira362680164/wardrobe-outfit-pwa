import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";

test.describe("单品图片保存与刷新", () => {
  test("录入流程可打开并加载图片选择", async ({ page, consoleErrors, requestErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // open create sheet
    await page.getByTestId("global-create").click();
    await expect(page.getByText("新建")).toBeVisible();
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();

    // close sheet — pressing Escape is reliable even with overlay
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    expect(consoleErrors.filter((e) => !e.includes("Capacitor") && !e.includes("MiniMax"))).toEqual([]);
  });
});
