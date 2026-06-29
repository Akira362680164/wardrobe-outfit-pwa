import { expect, type Page } from "@playwright/test";

export async function waitForBootstrapReady(page: Page): Promise<void> {
  const errorText = page.getByText("云端衣橱初始化失败");

  // ponytail: one retry for intermittent bootstrap / probe failures
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await errorText.isVisible().catch(() => false)) {
      if (attempt === 2) throw new Error("Bootstrap failed twice: 云端衣橱初始化失败");
      await page.reload();
      await page.waitForTimeout(2000);
      continue;
    }

    try {
      await expect(page.getByTestId("global-create")).toBeVisible({ timeout: attempt === 1 ? 30_000 : 60_000 });
      break;
    } catch {
      if (attempt === 2 || !(await errorText.isVisible().catch(() => false))) {
        throw new Error("Bootstrap timeout: global-create never appeared");
      }
      await page.reload();
      await page.waitForTimeout(2000);
    }
  }

  const diag = page.getByTestId("e2e-sync-state");
  const count = await diag.count();
  if (count > 0) {
    await expect(diag).toHaveAttribute("data-bootstrap-state", "ready", { timeout: 30_000 });
  }
}

export async function waitForSyncIdle(page: Page): Promise<void> {
  const diag = page.getByTestId("e2e-sync-state");
  const count = await diag.count();
  if (count === 0) {
    await page.waitForTimeout(3000);
    return;
  }
  // ponytail: outbox must be 0 and no error; syncState cycles between "idle" and "syncing" — both are acceptable
  await expect(diag).toHaveAttribute("data-outbox-count", "0", { timeout: 30_000 });
  await expect(diag).toHaveAttribute("data-last-error", "");
}
