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
  // 点击缩略图触发裁切编辑器
  const thumbBtn = page.getByRole("button", { name: /选择第 1 张图片/i });
  if (await thumbBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await thumbBtn.click();
  }
  // 点击 "确认图片" 确认裁切
  const confirmBtn = page.getByRole("button", { name: "确认图片" });
  if (await confirmBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  // 裁切后可能回到主流程
  await page.waitForTimeout(1000);
}

export async function submitForAiRecognition(page: Page): Promise<void> {
  await page.getByRole("button", { name: /下一步.*AI.*识别/i }).click();
  await expect(page.getByText(/核对 AI 识别结果/)).toBeVisible({ timeout: 130000 });
}

export async function recoverFailedRecognitionDraft(
  page: Page,
  input: { name: string; category?: string; color?: string },
): Promise<void> {
  await expect(page.getByText(/AI 识别失败，已生成待确认草稿/)).toBeVisible();
  const nameInput = page.locator('[data-item-form-section="intake-basic"] input').first();
  await nameInput.fill(input.name);
  await page.getByRole("radio", { name: input.category ?? "上衣", exact: true }).click();
  await page.locator(`[data-color-swatch="${input.color ?? "黑"}"]`).click();
  await expect(page.getByRole("button", { name: /保存 1 件/ })).toBeEnabled();
}

export async function fillGarmentName(page: Page, name: string): Promise<void> {
  // After AI recognition (or fallback), the confirmation form appears
  await page.waitForTimeout(3000);
  const nameInput = page.getByLabel(/名称/i);
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.clear();
    await nameInput.fill(name);
  }
}

export async function saveGarmentBatch(page: Page): Promise<void> {
  const saveBtn = page.getByRole("button", { name: /保存 \d+ 件/ });
  await expect(saveBtn).toBeEnabled({ timeout: 60000 });
  await saveBtn.click();
  await waitForSyncIdle(page);
}

export async function completeIntakeDraft(page: Page, imagePath: string): Promise<void> {
  await selectImageFromAlbum(page, imagePath);
  await confirmCrop(page);
  await submitForAiRecognition(page);
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
