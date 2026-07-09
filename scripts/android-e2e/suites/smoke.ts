import { expect as playwrightExpect, type Locator, type Page } from "@playwright/test";

export interface AndroidSmokeAccount {
  phone: string;
  password: string;
}

export interface AndroidSmokeApiSession {
  [key: string]: unknown;
}

export interface AndroidSmokeEntity {
  id: string;
  revision?: number;
  payload: Record<string, unknown>;
}

export interface AndroidSmokeWorkspaceOverview {
  locations: AndroidSmokeEntity[];
}

export interface AndroidSmokeApi {
  login(account: AndroidSmokeAccount): Promise<AndroidSmokeApiSession>;
  getWorkspaceOverview(session: AndroidSmokeApiSession): Promise<AndroidSmokeWorkspaceOverview>;
}

export interface AndroidSmokeArtifacts {
  step?<T>(name: string, action: () => Promise<T>): Promise<T>;
  screenshot(name: string, page?: Page): Promise<void>;
}

export interface AndroidSmokeDevice {
  restartApp(): Promise<Page | void>;
}

export interface AndroidSmokeContext {
  page: Page;
  api: AndroidSmokeApi;
  device: AndroidSmokeDevice;
  artifacts: AndroidSmokeArtifacts;
  freshAccount(): AndroidSmokeAccount | Promise<AndroidSmokeAccount>;
  verifyLaunch(): Promise<void>;
  assert?: (condition: unknown, message?: string) => void;
  expect?: typeof playwrightExpect;
}

export interface AndroidSmokeCase {
  name: string;
  run(ctx: AndroidSmokeContext): Promise<void>;
}

type TabName = "wardrobe" | "recommend" | "shopping" | "settings";

const tabLabels: Record<TabName, string> = {
  wardrobe: "衣橱",
  recommend: "套装",
  shopping: "种草",
  settings: "设置",
};

export const smokeCases: AndroidSmokeCase[] = [
  {
    name: "launch-verification",
    async run(ctx) {
      await step(ctx, "smoke-launch-verified", async () => {
        await ctx.verifyLaunch();
        await shot(ctx, "smoke-launch-verified");
      });
    },
  },
  {
    name: "register-logout-login",
    async run(ctx) {
      const account = await ctx.freshAccount();
      await ensureLoggedOut(ctx);

      await step(ctx, "smoke-auth-register-main", async () => {
        await registerByUi(ctx, account);
        await waitForMainUi(ctx);
        await verifyApiLogin(ctx, account);
        await shot(ctx, "smoke-auth-register-main");
      });

      await step(ctx, "smoke-auth-logout", async () => {
        await logoutByUi(ctx);
        await visibleExpect(ctx, ctx.page.getByRole("button", { name: "登录" }));
        await shot(ctx, "smoke-auth-logout");
      });

      await step(ctx, "smoke-auth-login-again", async () => {
        await loginByUi(ctx, account);
        await waitForMainUi(ctx);
        await verifyApiLogin(ctx, account);
        await shot(ctx, "smoke-auth-login-again");
      });
    },
  },
  {
    name: "default-closet-singleton",
    async run(ctx) {
      const account = await ctx.freshAccount();
      await ensureLoggedOut(ctx);

      await step(ctx, "smoke-default-closet-after-register", async () => {
        await registerByUi(ctx, account);
        await waitForMainUi(ctx);
        await expectOneDefaultCloset(ctx, account);
        await shot(ctx, "smoke-default-closet-after-register");
      });

      await step(ctx, "smoke-default-closet-after-refresh", async () => {
        await ctx.page.reload();
        await waitForMainUi(ctx);
        await expectOneDefaultCloset(ctx, account);
        await shot(ctx, "smoke-default-closet-after-refresh");
      });

      await step(ctx, "smoke-default-closet-after-restart", async () => {
        const restartedPage = await ctx.device.restartApp();
        if (restartedPage) ctx.page = restartedPage;
        await waitForMainUi(ctx);
        await expectOneDefaultCloset(ctx, account);
        await shot(ctx, "smoke-default-closet-after-restart");
      });
    },
  },
  {
    name: "main-navigation-global-create",
    async run(ctx) {
      const account = await ctx.freshAccount();
      await ensureLoggedOut(ctx);
      await registerByUi(ctx, account);
      await waitForMainUi(ctx);

      await step(ctx, "smoke-nav-wardrobe-plus", async () => {
        await navigateToTab(ctx, "wardrobe");
        await expectGlobalCreate(ctx, true);
        await shot(ctx, "smoke-nav-wardrobe-plus");
      });

      await step(ctx, "smoke-nav-outfits-plus", async () => {
        await navigateToTab(ctx, "recommend");
        await expectGlobalCreate(ctx, true);
        await shot(ctx, "smoke-nav-outfits-plus");
      });

      await step(ctx, "smoke-nav-wishlist-plus", async () => {
        await navigateToTab(ctx, "shopping");
        await expectGlobalCreate(ctx, true);
        await shot(ctx, "smoke-nav-wishlist-plus");
      });

      await step(ctx, "smoke-nav-settings-no-plus", async () => {
        await navigateToTab(ctx, "settings");
        await expectGlobalCreate(ctx, false);
        await shot(ctx, "smoke-nav-settings-no-plus");
      });

      await step(ctx, "smoke-global-create-sheet", async () => {
        await navigateToTab(ctx, "wardrobe");
        await ctx.page.getByTestId("global-create").click();
        await visibleExpect(ctx, ctx.page.getByText("新建"));
        await visibleExpect(ctx, ctx.page.getByRole("button", { name: /添加衣物/ }));
        await visibleExpect(ctx, ctx.page.getByRole("button", { name: /添加套装/ }));
        await visibleExpect(ctx, ctx.page.getByRole("button", { name: /添加种草单品/ }));
        await shot(ctx, "smoke-global-create-sheet");
      });
    },
  },
];

export async function runSmokeSuite(ctx: AndroidSmokeContext): Promise<void> {
  for (const testCase of smokeCases) {
    await testCase.run(ctx);
  }
}

async function registerByUi(ctx: AndroidSmokeContext, account: AndroidSmokeAccount): Promise<void> {
  const { page } = ctx;
  await visibleExpect(ctx, page.getByRole("button", { name: "还没有账号，去注册" }));
  await page.getByRole("button", { name: "还没有账号，去注册" }).click();
  await page.getByLabel("手机号").fill(account.phone);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByLabel("确认密码").fill(account.password);

  const terms = page.locator("#auth-terms-accepted");
  if (await terms.isVisible({ timeout: 2_000 }).catch(() => false)) {
    if (!(await terms.isChecked())) await terms.check();
  }

  await page.getByRole("button", { name: "注册" }).click();
}

async function loginByUi(ctx: AndroidSmokeContext, account: AndroidSmokeAccount): Promise<void> {
  const { page } = ctx;
  await visibleExpect(ctx, page.getByRole("button", { name: "登录" }));
  await page.getByLabel("手机号").fill(account.phone);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录" }).click();
}

async function logoutByUi(ctx: AndroidSmokeContext): Promise<void> {
  const { page } = ctx;
  await waitForMainUi(ctx);
  await navigateToTab(ctx, "settings");
  await page.getByRole("button", { name: /^管理$/ }).click();
  await visibleExpect(ctx, page.getByRole("heading", { name: "账号管理" }));
  const logout = page.getByRole("button", { name: "退出登录" }).first();
  await logout.scrollIntoViewIfNeeded();
  await logout.click();
  await visibleExpect(ctx, page.getByText("退出登录？"));
  await page.getByRole("button", { name: "退出登录" }).last().click();
}

async function ensureLoggedOut(ctx: AndroidSmokeContext): Promise<void> {
  const { page } = ctx;
  if (await isVisible(page.getByRole("button", { name: "登录" }), 1_000)) return;
  if (await isVisible(page.getByRole("button", { name: "衣橱", exact: true }), 10_000)) {
    await logoutByUi(ctx);
  }
  await visibleExpect(ctx, page.getByRole("button", { name: "登录" }));
}

async function navigateToTab(ctx: AndroidSmokeContext, tab: TabName): Promise<void> {
  await ctx.page.getByRole("button", { name: tabLabels[tab], exact: true }).click();
  await visibleExpect(ctx, ctx.page.getByRole("button", { name: tabLabels[tab], exact: true }));
}

async function waitForMainUi(ctx: AndroidSmokeContext): Promise<void> {
  const { page } = ctx;
  const bootstrapError = page.getByText("云端衣橱初始化失败");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (await isVisible(bootstrapError, 500)) {
      if (attempt === 2) throw new Error("Bootstrap failed twice: 云端衣橱初始化失败");
      await page.reload();
      await page.waitForTimeout(2_000);
      continue;
    }

    try {
      await visibleExpect(ctx, page.getByRole("button", { name: "衣橱", exact: true }), attempt === 1 ? 30_000 : 60_000);
      break;
    } catch (error) {
      if (attempt === 2 || !(await isVisible(bootstrapError, 500))) throw error;
      await page.reload();
      await page.waitForTimeout(2_000);
    }
  }

  const syncState = page.getByTestId("e2e-sync-state");
  if ((await syncState.count()) === 0) {
    await page.waitForTimeout(2_000);
    return;
  }

  await expectOf(ctx)(syncState).toHaveAttribute("data-bootstrap-state", "ready", { timeout: 30_000 });
  await expectOf(ctx)(syncState).toHaveAttribute("data-outbox-count", "0", { timeout: 30_000 });
  const lastError = await syncState.getAttribute("data-last-error");
  assert(ctx, !lastError || lastError === "sync_skipped", `Sync error: ${lastError}`);
}

async function verifyApiLogin(ctx: AndroidSmokeContext, account: AndroidSmokeAccount): Promise<AndroidSmokeApiSession> {
  return ctx.api.login(account);
}

async function expectOneDefaultCloset(ctx: AndroidSmokeContext, account: AndroidSmokeAccount): Promise<void> {
  const session = await ctx.api.login(account);
  const overview = await ctx.api.getWorkspaceOverview(session);
  const defaultLocations = overview.locations.filter((location) => (
    location.payload.dexieId === "home" && location.payload.name === "默认衣橱"
  ));

  assert(ctx, overview.locations.length === 1, `expected exactly 1 closet, got ${overview.locations.length}`);
  assert(ctx, defaultLocations.length === 1, `expected exactly 1 default closet, got ${defaultLocations.length}`);
}

async function expectGlobalCreate(ctx: AndroidSmokeContext, visible: boolean): Promise<void> {
  const locator = ctx.page.getByTestId("global-create");
  if (visible) {
    await visibleExpect(ctx, locator);
  } else {
    await expectOf(ctx)(locator).toBeHidden({ timeout: 5_000 });
  }
}

async function step<T>(ctx: AndroidSmokeContext, name: string, action: () => Promise<T>): Promise<T> {
  if (ctx.artifacts.step) return ctx.artifacts.step(name, action);
  return action();
}

async function shot(ctx: AndroidSmokeContext, name: string): Promise<void> {
  await ctx.artifacts.screenshot(name, ctx.page);
}

async function isVisible(locator: Locator, timeout: number): Promise<boolean> {
  return locator.isVisible({ timeout }).catch(() => false);
}

async function visibleExpect(ctx: AndroidSmokeContext, locator: Locator, timeout = 20_000): Promise<void> {
  await expectOf(ctx)(locator).toBeVisible({ timeout });
}

function expectOf(ctx: AndroidSmokeContext): typeof playwrightExpect {
  return ctx.expect ?? playwrightExpect;
}

function assert(ctx: AndroidSmokeContext, condition: unknown, message: string): void {
  if (ctx.assert) {
    ctx.assert(condition, message);
    return;
  }
  if (!condition) throw new Error(message);
}
