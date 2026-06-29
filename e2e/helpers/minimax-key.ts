import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";
import { navigateToTab } from "./navigation";

function getMiniMaxApiKey(): string {
  const key = process.env.MINIMAX_API_KEY?.trim();
  if (!key) throw new Error("MINIMAX_API_KEY not set in environment");
  return key;
}

export async function configureMiniMaxKeyByUi(page: Page): Promise<void> {
  const key = getMiniMaxApiKey();

  await navigateToTab(page, "settings");

  // open MiniMax Key config — the settings page should have a way to configure it
  const minimaxBtn = page.getByRole("button", { name: /MiniMax|API Key|密钥/i });
  if (await minimaxBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await minimaxBtn.click();
  }

  // look for an input field for the key
  const keyInput = page.getByLabel(/密钥|API Key|key/i);
  const isConfigurable = await keyInput.isVisible({ timeout: 3000 }).catch(() => false);

  if (isConfigurable) {
    await keyInput.fill(key);
    await page.getByRole("button", { name: /保存|确认/i }).click();
    // verify saved
    await expect(page.getByText(/已保存|保存成功|成功/i)).toBeVisible({ timeout: 5000 });
  }
}

export function assertMiniMaxKeyAvailable(): void {
  getMiniMaxApiKey();
}

export async function clearMiniMaxKeyFromBrowser(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("wardrobe-minimax-settings");
  });
}
