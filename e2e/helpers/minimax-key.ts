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

  // find the MiniMax settings section and click "配置 Key"
  const configBtn = page.getByRole("button", { name: "配置 Key" });
  if (await configBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await configBtn.click();

    // look for an input field for the key
    const keyInput = page.getByLabel(/密钥|API Key|key/i);
    if (await keyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keyInput.fill(key);
      await page.getByRole("button", { name: /保存|确认/i }).click();
    }
  }

  // navigate back to wardrobe home
  await navigateToTab(page, "wardrobe");
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 10000 });
}

export function assertMiniMaxKeyAvailable(): void {
  getMiniMaxApiKey();
}

export async function clearMiniMaxKeyFromBrowser(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem("wardrobe-minimax-settings");
  });
}
