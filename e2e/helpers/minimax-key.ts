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

  // Wait for settings page to settle
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible({ timeout: 10000 });

  // Find the MiniMax settings section and click "配置 Key"
  const configBtn = page.getByRole("button", { name: "配置 Key" });
  if (await configBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await configBtn.click();

    // Wait for the MiniMax detail page to appear
    await expect(page.getByRole("heading", { name: "配置 MiniMax 密钥" })).toBeVisible({ timeout: 10000 });

    // Fill in the API Key
    const keyInput = page.getByLabel("API Key");
    await expect(keyInput).toBeVisible({ timeout: 5000 });
    await keyInput.fill(key);

    // Wait for save button to become enabled (dirty state)
    const saveBtn = page.getByRole("button", { name: "保存" });
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();

    // Should navigate back to settings main page
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible({ timeout: 10000 });
  }

  // Navigate back to wardrobe home
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
