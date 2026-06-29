import type { Page } from "@playwright/test";
import type { E2ETestAccount } from "../fixtures/accounts";

export async function registerByUi(page: Page, account: E2ETestAccount): Promise<void> {
  await page.goto("/");
  // "还没有账号，去注册" button
  await page.getByRole("button", { name: "还没有账号，去注册" }).click();

  // fill register form — use exact:true because "确认密码" label also matches "密码"
  await page.getByLabel("手机号").fill(account.phone);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByLabel("确认密码").fill(account.password);

  // accept terms checkbox
  const checkbox = page.locator("#auth-terms-accepted");
  if (!(await checkbox.isChecked())) await checkbox.check();

  // submit
  await page.getByRole("button", { name: "注册" }).click();
}

export async function loginByUi(page: Page, account: E2ETestAccount): Promise<void> {
  await page.goto("/");
  // should be on login form
  await page.getByLabel("手机号").fill(account.phone);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: "登录" }).click();
}

export async function logoutByUi(page: Page): Promise<void> {
  // navigate to account management
  await page.goto("/");
  // click settings tab, then account management
  // ponytail: go directly via route-based navigation
  await page.getByRole("button", { name: /设置|settings/i }).click();
  await page.getByRole("button", { name: /账号管理/i }).click();
  // click 退出当前设备
  await page.getByRole("button", { name: "退出当前设备" }).click();
  // confirm in any dialog if present
  const confirmBtn = page.getByRole("button", { name: /确定|确认退出|退出/i });
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click();
  }
}
