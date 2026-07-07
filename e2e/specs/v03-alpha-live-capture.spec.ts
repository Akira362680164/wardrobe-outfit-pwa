import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady, waitForSyncIdle } from "../fixtures/sync";
import { loginByUi } from "../helpers/auth";
import { configureMiniMaxKeyByUi } from "../helpers/minimax-key";
import { navigateToTab } from "../helpers/navigation";
import { getWorkspaceOverview } from "../helpers/workspace";

type Repeatability = "one_time" | "repeatable";

interface CaptureEntry {
  stateId: string;
  segment: string;
  filename: string;
  businessStep: string;
  triggerAction: string;
  routeOrVisiblePage: string;
  capturedAt: string;
  repeatability: Repeatability;
  source: "live_business_flow";
}

const expectedGarmentCount = 9;
const root = process.cwd();
const outDir = join(root, "docs/designs/v0.3-alpha");
const screenshotDir = join(outDir, "screenshots");
const garmentImages = [
  "test-clothes/Du_240122123203-1242822577.png",
  "test-clothes/Du_240521225816-1242822577.png",
  "test-clothes/qq_pic_merged_1782562637315.jpg",
  "test-clothes/qq_pic_merged_1782562649933.jpg",
  "test-clothes/qq_pic_merged_1782562667372.jpg",
  "test-clothes/qq_pic_merged_1782562680800.jpg",
  "test-clothes/tb_image_share_1782562576659.png",
  "test-clothes/tb_image_share_1782562599293.png",
  "test-clothes/tb_image_share_1782562613995.png",
].map((path) => resolve(root, path));
const wishlistImage = garmentImages.find((path) => /\.(jpe?g)$/i.test(path)) ?? garmentImages[0]!;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test("v0.3-alpha live visual capture", async ({ page }) => {
  test.setTimeout(12 * 60_000);
  await installVisualCaptureGuards(page);
  mkdirSync(screenshotDir, { recursive: true });
  const captures: CaptureEntry[] = [];

  async function shot(
    stateId: string,
    segment: string,
    businessStep: string,
    triggerAction: string,
    repeatability: Repeatability,
  ) {
    await hideNextDevOverlay(page);
    await page.waitForTimeout(300);
    const filename = `${stateId}_390_${segment}.png`;
    await page.screenshot({ path: join(screenshotDir, filename) });
    captures.push({
      stateId,
      segment,
      filename: `screenshots/${filename}`,
      businessStep,
      triggerAction,
      routeOrVisiblePage: await visiblePageLabel(page),
      capturedAt: new Date().toISOString(),
      repeatability,
      source: "live_business_flow",
    });
  }

  await page.goto("/");
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  await shot("auth_login", "top", "打开 App 后的登录页", "page.goto('/')", "repeatable");

  await page.getByRole("button", { name: "还没有账号，去注册" }).click();
  await expect(page.getByRole("button", { name: "注册" })).toBeVisible();
  await shot("auth_register", "top", "注册页提交前", "点击去注册", "repeatable");

  const account = createE2ETestAccount();
  await page.getByLabel("手机号").fill(account.phone);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByLabel("确认密码").fill(account.password);
  const checkbox = page.locator("#auth-terms-accepted");
  if (!(await checkbox.isChecked())) await checkbox.check();
  await page.getByRole("button", { name: "注册" }).click();
  await waitForBootstrapReady(page);
  await waitForSyncIdle(page);

  await navigateToTab(page, "settings");
  await page.getByRole("button", { name: /^管理$/ }).click();
  await page.getByRole("button", { name: "退出登录" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByText("退出登录？")).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).last().click();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible({ timeout: 10_000 });

  await loginByUi(page, account);
  await waitForBootstrapReady(page);
  await waitForSyncIdle(page);

  await navigateToTab(page, "settings");
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  await shot("settings_home", "top", "登录后设置首页", "点击设置 Tab", "repeatable");

  await configureMiniMaxKeyByUi(page);

  await startGarmentIntake(page);
  await expect(page.getByRole("heading", { name: "选择单品照片" })).toBeVisible({ timeout: 10_000 });
  await shot("intake_single_step1_empty", "top", "单品录入 Step 1 空状态", "点击新建 > 添加衣物", "one_time");

  await selectImagesFromAlbum(page, garmentImages);
  await expect(page.getByText(new RegExp(`已选择 ${expectedGarmentCount} 张单品照片`))).toBeVisible({ timeout: 45_000 });
  await shot("intake_single_step1_imported", "top", "9 张图片导入后、AI 识别前", "从图库选择 9 张图片", "one_time");

  await page.getByRole("button", { name: /下一步.*AI.*识别/i }).click();
  await expect(page.getByText(/核对 AI 识别结果/)).toBeVisible({ timeout: 8 * 60_000 });
  await scrollTop(page);
  await shot("intake_single_confirm", "top", "live MiniMax 识别后的确认页首屏", "点击下一步 AI 识别", "one_time");
  await scrollBottom(page);
  await shot("intake_single_confirm", "bottom", "live MiniMax 识别后的确认页底部", "滚动到保存区域", "one_time");

  const saveGarments = page.getByRole("button", { name: new RegExp(`保存 ${expectedGarmentCount} 件单品`) });
  await expect(saveGarments).toBeEnabled({ timeout: 60_000 });
  await saveGarments.click();
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 30_000 });
  await waitForSyncIdle(page);

  await navigateToTab(page, "wardrobe");
  await expect(page.getByTestId("global-create")).toBeVisible();
  await shot("wardrobe_home", "top", "单品保存并服务器读回后的衣橱首页", "点击衣橱 Tab", "repeatable");

  const overviewAfterGarments = await getWorkspaceOverview(page);
  const garmentNames = overviewAfterGarments.garments
    .map((entry) => String(entry.payload.name ?? ""))
    .filter(Boolean);
  if (garmentNames.length < expectedGarmentCount) {
    throw new Error(`live flow saved only ${garmentNames.length}/${expectedGarmentCount} garment(s)`);
  }

  await openCardByName(page, garmentNames[0]!);
  await expect(page.getByText(garmentNames[0]!).first()).toBeVisible({ timeout: 15_000 });
  await scrollTop(page);
  await shot("garment_detail", "top", "真实单品详情首屏", "点击衣橱首件单品", "repeatable");
  await page.mouse.wheel(0, 720);
  await shot("garment_detail", "info", "真实单品详情信息区", "滚动到信息区", "repeatable");
  await scrollBottom(page);
  await shot("garment_detail", "bottom", "真实单品详情底部区", "滚动到页面底部", "repeatable");

  await triggerDeleteConfirm(page);
  await shot("confirm_delete_sheet", "top", "删除确认 Sheet", "详情页更多菜单 > 删除衣物", "one_time");
  await page.getByRole("alertdialog", { name: /删除/ }).getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "返回" }).click();

  await createOutfitFromFirstTwoGarments(page, garmentNames.slice(0, 2));
  await navigateToTab(page, "recommend");
  await shot("outfit_home", "top", "正式创建套装后的套装首页", "点击套装 Tab", "repeatable");
  await openCardByName(page, "v03-alpha live 套装");
  await scrollTop(page);
  await shot("outfit_detail", "top", "真实套装详情首屏", "点击 live 套装", "repeatable");
  await page.mouse.wheel(0, 720);
  await shot("outfit_detail", "info", "真实套装详情信息区", "滚动到信息区", "repeatable");
  await scrollBottom(page);
  await shot("outfit_detail", "bottom", "真实套装详情底部区", "滚动到页面底部", "repeatable");
  await page.getByRole("button", { name: "返回" }).click();
  await page.getByRole("button", { name: "打开穿搭月历" }).click();
  await expect(page.getByText("穿搭计划", { exact: true })).toBeVisible();
  await shot("outfit_calendar", "top", "套装月历页", "点击月历", "repeatable");
  await page.getByRole("button", { name: "返回" }).click();

  await createWishlistItem(page);
  await navigateToTab(page, "shopping");
  await shot("wishlist_home", "top", "正式创建种草后的种草首页", "点击种草 Tab", "repeatable");
  const overviewAfterWishlist = await getWorkspaceOverview(page);
  const wishlistName = String(overviewAfterWishlist.wishlistItems.at(-1)?.payload.name ?? "");
  if (!wishlistName) throw new Error("wishlist item was not saved");
  await openCardByName(page, wishlistName);
  await scrollTop(page);
  await shot("wishlist_detail", "top", "真实种草详情首屏", "点击种草单品", "repeatable");
  await page.mouse.wheel(0, 720);
  await shot("wishlist_detail", "info", "真实种草详情信息区", "滚动到信息区", "repeatable");
  await scrollBottom(page);
  await shot("wishlist_detail", "bottom", "真实种草详情底部区", "滚动到页面底部", "repeatable");

  writeFileSync(join(outDir, "live-capture-manifest.json"), `${JSON.stringify({
    version: "v0.3-alpha",
    resolution: { width: 390, height: 844 },
    source: "live_business_flow",
    accountPhoneSuffix: account.phone.slice(-4),
    capturedAt: new Date().toISOString(),
    captures,
  }, null, 2)}\n`);
});

async function installVisualCaptureGuards(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const styleId = "v03-alpha-hide-next-dev-overlay";
    const css = `
      nextjs-portal,
      [data-nextjs-dev-overlay],
      [data-nextjs-toast],
      [aria-label="Open issues overlay"],
      [aria-label="Collapse issues badge"] {
        display: none !important;
        pointer-events: none !important;
      }
    `;
    const install = () => {
      if (!document.head || document.getElementById(styleId)) return;
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    };
    install();
    document.addEventListener("DOMContentLoaded", install);
    if (document.documentElement) {
      new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
    }
  });
}

async function hideNextDevOverlay(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-dev-overlay],
      [data-nextjs-toast],
      [aria-label="Open issues overlay"],
      [aria-label="Collapse issues badge"] {
        display: none !important;
        pointer-events: none !important;
      }
    `,
  }).catch(() => {});
}

async function visiblePageLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    return `${location.pathname}${location.hash} :: ${headings.slice(0, 3).join(" / ")}`;
  });
}

async function startGarmentIntake(page: Page): Promise<void> {
  await navigateToTab(page, "wardrobe");
  await page.getByTestId("global-create").click();
  await expect(page.getByText("新建")).toBeVisible();
  await page.getByRole("button", { name: /添加衣物/i }).click();
}

async function selectImagesFromAlbum(page: Page, imagePaths: string[]): Promise<void> {
  const chooser = page.waitForEvent("filechooser", { timeout: 30_000 });
  await page.getByRole("button", { name: /从图库|继续从图库/i }).click();
  await (await chooser).setFiles(imagePaths);
}

async function openCardByName(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: name, exact: false }).first().click();
}

async function triggerDeleteConfirm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("button", { name: "删除衣物" }).click();
  await expect(page.getByRole("alertdialog", { name: /删除/ })).toBeVisible();
}

async function createOutfitFromFirstTwoGarments(page: Page, garmentNames: string[]): Promise<void> {
  await navigateToTab(page, "recommend");
  await page.getByTestId("global-create").click();
  await page.getByRole("button", { name: /添加套装/i }).click();
  await expect(page.getByText("选择衣物组成套装")).toBeVisible({ timeout: 15_000 });
  for (const name of garmentNames) {
    await page.getByRole("button", { name: name, exact: false }).first().click();
  }
  await page.getByRole("button", { name: /下一步/ }).click();
  await expect(page.getByText("校对套装草稿")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("套装名称").fill("v03-alpha live 套装");
  await page.getByRole("button", { name: "保存套装" }).click();
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 30_000 });
  await waitForSyncIdle(page);
}

async function createWishlistItem(page: Page): Promise<void> {
  await navigateToTab(page, "shopping");
  await page.getByTestId("global-create").click();
  await page.getByRole("button", { name: /添加种草/i }).click();
  await expect(page.getByRole("heading", { name: "选择种草照片" })).toBeVisible({ timeout: 10_000 });
  await selectImagesFromAlbum(page, [wishlistImage]);
  await expect(page.getByText(/已选择 1 张种草照片/)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /下一步.*AI.*识别/i }).click();
  await expect(page.getByText(/核对 AI 识别结果/)).toBeVisible({ timeout: 4 * 60_000 });
  const nameInput = page.getByLabel(/名称/i).first();
  if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await nameInput.fill("v03-alpha live 种草");
  }
  const save = page.getByRole("button", { name: /保存 \d+ 件种草/ });
  await expect(save).toBeEnabled({ timeout: 60_000 });
  await save.click();
  await expect(page.getByTestId("global-create")).toBeVisible({ timeout: 30_000 });
  await waitForSyncIdle(page);
}

async function scrollTop(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(300);
}

async function scrollBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(300);
}
