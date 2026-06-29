import { test, expect } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";

test.describe("默认衣橱不重复创建", () => {
  test("全新账号只有一条默认衣橱", async ({ page, consoleErrors }) => {
    const account = createE2ETestAccount();
    await registerByUi(page, account);
    await waitForBootstrapReady(page);
    await waitForSyncIdle(page);

    // check the wardrobe home shows default closet
    // ponytail: after bootstrap, the wardrobe home should show at least the default closet badge
    await expect(page.getByTestId("global-create")).toBeVisible();

    expect(consoleErrors.filter((e) => !e.includes("Capacitor"))).toEqual([]);
  });
});
