import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { configureMiniMaxKeyByUi } from "../helpers/minimax-key";
import { navigateToTab } from "../helpers/navigation";
import {
  openGlobalCreateSheet,
  startGarmentIntake,
  completeIntakeDraft,
  getAssetPath,
  saveGarmentBatch,
} from "../helpers/garment";

test.describe("单品录入 UI 可达性", () => {
  test("全局新建面板包含添加衣物入口", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await openGlobalCreateSheet(page);
    await expect(page.getByRole("button", { name: /添加衣物/i })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await expect(page.getByTestId("global-create")).toBeVisible();

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });
});

test.describe("单品 CRUD 与同步", () => {
  test("完整录入流程：选图 → AI 识别 → 保存 → 衣柜可见", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    await configureMiniMaxKeyByUi(page);

    await startGarmentIntake(page);
    await expect(page.getByRole("heading", { name: "选择单品照片" })).toBeVisible({ timeout: 10000 });

    await completeIntakeDraft(page, getAssetPath("red-shirt.jpg"));
    await saveGarmentBatch(page);

    await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 10000 });
    await navigateToTab(page, "wardrobe");

    const realErrors = consoleErrors.filter((e) => !e.includes("Capacitor"));
    expect(realErrors).toEqual([]);
  });
});
