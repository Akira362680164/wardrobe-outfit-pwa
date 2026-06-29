import type { Page } from "@playwright/test";

type TabName = "wardrobe" | "recommend" | "shopping" | "settings";

const tabNames: Record<TabName, string> = {
  wardrobe: "衣橱",
  recommend: "套装",
  shopping: "种草",
  settings: "设置",
};

export async function navigateToTab(page: Page, tab: TabName): Promise<void> {
  await page.getByRole("button", { name: tabNames[tab], exact: true }).click();
}

export async function openAccountManagement(page: Page): Promise<void> {
  await navigateToTab(page, "settings");
  // ponytail: "管理" button next to "账号服务" heading
  await page.getByRole("button", { name: /^管理$/ }).click();
}

export async function openChangePassword(page: Page): Promise<void> {
  await openAccountManagement(page);
  await page.getByRole("button", { name: "修改密码" }).click();
}
