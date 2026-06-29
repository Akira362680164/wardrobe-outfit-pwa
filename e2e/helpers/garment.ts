import type { Page } from "@playwright/test";
import { expect } from "../fixtures/test";
import { waitForSyncIdle } from "../fixtures/sync";

const GARMENT_ASSET_DIR = "e2e/assets";

export function getAssetPath(filename: string): string {
  return `${GARMENT_ASSET_DIR}/${filename}`;
}

export async function openGlobalCreateSheet(page: Page): Promise<void> {
  await page.getByTestId("global-create").click();
  await expect(page.getByText("新建")).toBeVisible();
}

export async function startGarmentIntake(page: Page): Promise<void> {
  await openGlobalCreateSheet(page);
  await page.getByRole("button", { name: /添加衣物/i }).click();
}

export async function selectImageFromAlbum(page: Page, imagePath: string): Promise<void> {
  // The "继续从图库选择" button triggers Capacitor first, which fails in browser,
  // then falls back to a hidden <input type="file"> element.
  // Playwright's fileChooser event fires when the hidden input is triggered.
  const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 30000 });
  await page.getByRole("button", { name: /从图库|继续从图库/i }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(imagePath);
}

export async function confirmCrop(page: Page): Promise<void> {
  // Wait for crop editor to appear
  await expect(page.getByRole("button", { name: /裁切/ })).toBeVisible({ timeout: 15000 });
  // Click "裁切" to open the crop editor
  await page.getByRole("button", { name: /^裁切$/ }).click();
  // Click "确认图片" to confirm crop
  await expect(page.getByRole("button", { name: "确认图片" })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "确认图片" }).click();
}

export async function fillGarmentName(page: Page, name: string): Promise<void> {
  // After AI recognition (or fallback), the confirmation form appears
  // Look for the name input - may be labeled "单品名称" or similar
  await page.waitForTimeout(3000);
  const nameInput = page.getByLabel(/名称/i);
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.clear();
    await nameInput.fill(name);
  }
}

export async function saveGarmentBatch(page: Page): Promise<void> {
  await page.getByRole("button", { name: /保存/ }).click();
  await waitForSyncIdle(page);
}

export async function deleteGarmentViaDetail(page: Page): Promise<void> {
  // Open the three-dot menu and delete
  const menuBtn = page.getByRole("button", { name: /更多|menu|\.\.\./i });
  if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await menuBtn.click();
    await page.getByRole("button", { name: /删除/i }).click();
  } else {
    await page.getByRole("button", { name: /删除/i }).click();
  }
  // confirm if dialog appears
  const confirmBtn = page.getByRole("button", { name: /确认|确定|删除/i });
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await waitForSyncIdle(page);
}
