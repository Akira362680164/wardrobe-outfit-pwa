import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { waitForSyncIdle } from "../fixtures/sync";

export async function createGarmentFromImage(
  page: Page,
  imagePath: string,
  garmentName: string,
): Promise<void> {
  // click global create button
  await page.getByTestId("global-create").click();

  // click "添加单品" option
  await page.getByRole("button", { name: /添加单品/i }).click();

  // select image file — pick the file input
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /相册|图片|选择图片/i }).first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(imagePath);

  // wait for crop editor to appear
  await expect(page.getByRole("button", { name: /确认裁切|裁切确认|完成/i })).toBeVisible({ timeout: 15000 });

  // confirm crop
  await page.getByRole("button", { name: /确认裁切|裁切确认|完成/i }).click();

  // wait for AI recognition / intake form
  // ponytail: if AI fails, intake shows fallback form — still fill name and save
  await page.waitForTimeout(2000);

  // fill garment name
  const nameInput = page.getByLabel(/名称|单品名称/i);
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill(garmentName);
  }

  // save
  await page.getByRole("button", { name: /保存|确认|加入衣橱/i }).click();

  // wait for return to wardrobe home
  await page.waitForTimeout(1000);
}

export async function openGarmentDetail(page: Page, garmentName: string): Promise<void> {
  // find the garment card by name and click it
  await page.getByText(garmentName, { exact: false }).first().click();
  await expect(page.getByRole("button", { name: /编辑|edit/i })).toBeVisible({ timeout: 10000 });
}

export async function deleteGarment(page: Page): Promise<void> {
  await page.getByRole("button", { name: /删除|delete/i }).click();
  // confirm if dialog appears
  const confirmBtn = page.getByRole("button", { name: /确认|确定|删除/i });
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }
}
