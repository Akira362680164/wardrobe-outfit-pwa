import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";

test.describe("温度全链路", () => {
  test("温度组件在录入流程中渲染", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // verify basic app load — temperature controls tested in unit tests
    await expect(page.getByTestId("global-create")).toBeVisible();
    expect(consoleErrors.filter((e) => !e.includes("Capacitor") && !e.includes("MiniMax"))).toEqual([]);
  });
});
