import { expect, type Page } from "@playwright/test";

export async function waitForBootstrapReady(page: Page): Promise<void> {
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 60_000 });

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
