import { expect, test } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import {
  completeIntakeDraft,
  getAssetPath,
  recoverFailedRecognitionDraft,
  startGarmentIntake,
} from "../helpers/garment";
import { getWorkspaceOverview } from "../helpers/workspace";

test("图片上传 500 后停留原页并保留草稿，重试只创建一件", async ({ page }) => {
  await registerByUi(page, createE2ETestAccount());
  await waitForBootstrapReady(page);
  await prepareDraft(page, "图片失败保留草稿");

  let failed = false;
  await page.route("**/api/workspace/assets/sessions", async (route) => {
    if (!failed && route.request().method() === "POST") {
      failed = true;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "image_upload", message: "测试图片上传失败", retryable: true }) });
      return;
    }
    await route.continue();
  });
  const save = page.getByRole("button", { name: /保存 1 件/ });
  await save.click();
  await expect(page.locator('[data-item-form-section="intake-basic"] input').first()).toHaveValue("图片失败保留草稿");
  await expect(page.getByText(/草稿已保留|保存单品失败，请重试/).first()).toBeVisible({ timeout: 35_000 });
  await expect(save).toBeVisible();
  await page.unroute("**/api/workspace/assets/sessions");
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 20_000 });
  const overview = await getWorkspaceOverview(page);
  expect(overview.garments.filter((entry) => entry.payload.name === "图片失败保留草稿")).toHaveLength(1);
});

test("服务器已提交但网关超时后复用 mutationId，重试不产生重复数据", async ({ page }) => {
  await registerByUi(page, createE2ETestAccount());
  await waitForBootstrapReady(page);
  await prepareDraft(page, "超时幂等草稿");

  let intercepted = false;
  await page.route("**/api/workspace/garments/batch", async (route) => {
    if (!intercepted && route.request().method() === "POST") {
      intercepted = true;
      await route.fetch();
      await route.fulfill({ status: 504, contentType: "application/json", body: JSON.stringify({ code: "timeout", message: "测试网关超时", retryable: true }) });
      return;
    }
    await route.continue();
  });
  const save = page.getByRole("button", { name: /保存 1 件/ });
  await save.click();
  await expect(page.locator('[data-item-form-section="intake-basic"] input').first()).toHaveValue("超时幂等草稿");
  await expect(page.getByText(/草稿已保留|保存单品失败，请重试/).first()).toBeVisible({ timeout: 35_000 });
  await page.unroute("**/api/workspace/garments/batch");
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 20_000 });
  const overview = await getWorkspaceOverview(page);
  expect(overview.garments.filter((entry) => entry.payload.name === "超时幂等草稿")).toHaveLength(1);
});

test("断网保存失败后保留草稿，恢复网络可直接重试", async ({ page, context }) => {
  await registerByUi(page, createE2ETestAccount());
  await waitForBootstrapReady(page);
  await prepareDraft(page, "断网恢复草稿");
  const save = page.getByRole("button", { name: /保存 1 件/ });
  await context.setOffline(true);
  await save.click();
  await expect(page.locator('[data-item-form-section="intake-basic"] input').first()).toHaveValue("断网恢复草稿");
  await expect(page.getByText(/草稿已保留|保存单品失败，请重试/).first()).toBeVisible({ timeout: 35_000 });
  await context.setOffline(false);
  await expect(save).toBeEnabled({ timeout: 10_000 });
  await save.click();
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 20_000 });
  const overview = await getWorkspaceOverview(page);
  expect(overview.garments.filter((entry) => entry.payload.name === "断网恢复草稿")).toHaveLength(1);
});

async function prepareDraft(page: Parameters<typeof startGarmentIntake>[0], name: string): Promise<void> {
  await startGarmentIntake(page);
  await completeIntakeDraft(page, getAssetPath("red-shirt.jpg"));
  await recoverFailedRecognitionDraft(page, { name, category: "上衣", color: "红" });
}
