import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function assertGarmentCardVisible(page: Page, name: string): Promise<void> {
  const card = page.getByText(name, { exact: false }).first();
  await expect(card).toBeVisible();
}

export async function assertGarmentImageLoaded(page: Page): Promise<void> {
  // find the first garment card image
  const img = page.locator("img").first();
  await expect(img).toBeVisible();
  await expect(img).toHaveJSProperty("complete", true);
  await expect(img).toHaveJSProperty("naturalWidth", expect.any(Number));
  const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);
}

export async function assertDefaultClosetCount(
  page: Page,
  expectedCount: number,
): Promise<void> {
  // navigate to wardrobe management
  // ponytail: the "默认衣橱" entries are in wardrobe management view
  const rows = page.getByRole("button", { name: /^默认衣橱/ });
  const count = await rows.count();
  expect(count).toBe(expectedCount);
}

export async function openWardrobeManagement(page: Page): Promise<void> {
  // ponytail: wardrobe management is within settings page
  await page.getByRole("button", { name: "设置", exact: true }).click();
}

export async function refreshPage(page: Page): Promise<void> {
  await page.reload();
}
