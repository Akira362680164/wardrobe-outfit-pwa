import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";

export interface AndroidCriticalAccount {
  phone: string;
  password: string;
}

export interface AndroidCriticalApiSession {
  accessToken?: string;
  deviceId?: string;
  [key: string]: unknown;
}

export interface AndroidCriticalApi {
  register?: (account: AndroidCriticalAccount) => Promise<AndroidCriticalApiSession | void>;
  login: (account: AndroidCriticalAccount) => Promise<AndroidCriticalApiSession>;
  overview?: (session: AndroidCriticalApiSession) => Promise<WorkspaceOverview>;
  request?: <T>(session: AndroidCriticalApiSession, path: string, options?: ApiRequestOptions) => Promise<T>;
  workspace?: <T>(session: AndroidCriticalApiSession, path: string, options?: ApiRequestOptions) => Promise<T>;
}

export interface AndroidCriticalDevice {
  clearAppData?: (packageName?: string) => Promise<void>;
  forceStop?: (packageName?: string) => Promise<void>;
  startApp?: (packageName?: string) => Promise<Page | void>;
}

export interface AndroidCriticalArtifacts {
  log?: (message: string) => void | Promise<void>;
  screenshot?: (name: string, page?: Page) => Promise<void>;
}

export interface AndroidCriticalContext {
  page: Page;
  api: AndroidCriticalApi;
  device: AndroidCriticalDevice;
  artifacts?: AndroidCriticalArtifacts;
  freshAccount: () => AndroidCriticalAccount | Promise<AndroidCriticalAccount>;
  packageName?: string;
}

export interface AndroidCriticalCase {
  name: string;
  run: (ctx: AndroidCriticalContext) => Promise<void>;
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

interface WorkspaceEntity {
  id: string;
  revision: number;
  payload: Record<string, unknown>;
}

interface WorkspaceOverview {
  garments: WorkspaceEntity[];
  outfits: WorkspaceEntity[];
  wishlistItems: WorkspaceEntity[];
  locations: WorkspaceEntity[];
  outfitPlans: WorkspaceEntity[];
  wearEvents: WorkspaceEntity[];
}

interface CommandResponse {
  status: "committed" | "in_progress";
  entity?: WorkspaceEntity;
  entities?: WorkspaceEntity[];
}

const DEFAULT_PACKAGE = "com.wardrobe.outfit";

export const criticalSuite: AndroidCriticalCase[] = [
  { name: "critical:garment-item-create-detail-edit-delete", run: criticalGarmentItemFlow },
  { name: "critical:wishlist-convert-undo-cascade", run: criticalWishlistConversionFlow },
  { name: "critical:outfit-plan-wear-consistency", run: criticalOutfitPlanWearFlow },
  { name: "critical:account-workspace-isolation", run: criticalAccountIsolationFlow },
  { name: "critical:logout-relogin-force-stop-restore", run: criticalLogoutReloginForceStopRestoreFlow },
];

export async function runCriticalSuite(ctx: AndroidCriticalContext): Promise<void> {
  for (const testCase of criticalSuite) {
    await ctx.artifacts?.log?.(`start ${testCase.name}`);
    try {
      await testCase.run(ctx);
      await ctx.artifacts?.log?.(`pass ${testCase.name}`);
    } catch (error) {
      await ctx.artifacts?.screenshot?.(safeArtifactName(testCase.name), ctx.page).catch(() => undefined);
      throw new Error(`${testCase.name} failed: ${message(error)}`, { cause: error });
    }
  }
}

export async function criticalGarmentItemFlow(ctx: AndroidCriticalContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("critical单品");
  const editedName = `${name}-已编辑`;
  const created = await createEntity(ctx, session, "garments", garmentPayload(name));
  const page = await loginFreshApp(ctx, account);

  await navigateToTab(page, "衣橱");
  await openCard(page, name);
  await clickButton(page, "更多操作");
  await clickButton(page, /编辑衣物/);
  await expectText(page, "编辑衣物");
  await fillFirstTextControl(page, editedName);
  await clickButton(page, /^保存$/);
  await waitForOverview(ctx, session, (overview) =>
    overview.garments.some((entry) => entry.id === created.id && entry.payload.name === editedName),
    "edited garment did not reach server",
  );
  await expectText(page, editedName);

  await clickButton(page, "更多操作");
  await clickButton(page, /删除衣物/);
  await clickButton(page, /^删除$/);
  await waitForOverview(ctx, session, (overview) =>
    !overview.garments.some((entry) => entry.id === created.id),
    "deleted garment still exists on server",
  );
  await navigateToTab(page, "衣橱");
  await expectHidden(page.getByRole("button", { name: textMatcher(editedName) }), "deleted garment card");
}

export async function criticalWishlistConversionFlow(ctx: AndroidCriticalContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("critical种草");
  const wishlist = await createEntity(ctx, session, "wishlist", wishlistPayload(name));
  const page = await loginFreshApp(ctx, account);

  await navigateToTab(page, "种草");
  await openCard(page, name);
  await clickButton(page, /^已买$/);
  await clickButton(page, "确认加入衣橱");

  const converted = await waitForOverview(ctx, session, (overview) => {
    const item = overview.wishlistItems.find((entry) => entry.id === wishlist.id);
    return Boolean(item?.payload.convertedItemId)
      && overview.garments.some((entry) => entry.payload.sourceWishlistId === wishlist.id && entry.payload.name === name);
  }, "wishlist conversion did not reach server");
  const convertedWishlist = converted.wishlistItems.find((entry) => entry.id === wishlist.id);
  assert(convertedWishlist, "converted wishlist missing from overview");
  const convertedGarment = converted.garments.find((entry) => entry.payload.sourceWishlistId === wishlist.id);
  assert(convertedGarment, "converted garment missing from overview");

  await navigateToTab(page, "衣橱");
  await expectCard(page, name);

  await navigateToTab(page, "种草");
  await clickButton(page, "种草列表菜单");
  await clickButton(page, /已买单品/);
  await expectText(page, name);
  await clickButton(page, "撤销购买");
  await expectText(page, "撤销购买并恢复到种草？");
  await clickLastButton(page, /^撤销购买$/);

  await waitForOverview(ctx, session, (overview) => {
    const item = overview.wishlistItems.find((entry) => entry.id === wishlist.id);
    return item?.payload.convertedItemId == null
      && item?.payload.purchased !== true
      && !overview.garments.some((entry) => entry.id === convertedGarment.id || entry.payload.sourceWishlistId === wishlist.id);
  }, "wishlist undo did not delete converted garment");
  await navigateToTab(page, "种草");
  await expectCard(page, name);
  await navigateToTab(page, "衣橱");
  await expectHidden(page.getByRole("button", { name: textMatcher(name) }), "converted garment after undo");
}

export async function criticalOutfitPlanWearFlow(ctx: AndroidCriticalContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const date = localDateKey();
  const topName = uniqueName("critical上衣");
  const bottomName = uniqueName("critical下装");
  const outfitName = uniqueName("critical套装");
  const editedOutfitName = `${outfitName}-已编辑`;
  const top = await createEntity(ctx, session, "garments", garmentPayload(topName, { category: "tops", colors: { mode: "single", primary: "白" } }));
  const bottom = await createEntity(ctx, session, "garments", garmentPayload(bottomName, { category: "pants", colors: { mode: "single", primary: "黑" } }));
  const topLegacyId = Number(top.payload.legacyItemId);
  const bottomLegacyId = Number(bottom.payload.legacyItemId);
  const outfit = await createEntity(ctx, session, "outfits", outfitPayload(outfitName, [topLegacyId, bottomLegacyId]));
  const page = await loginFreshApp(ctx, account);

  await navigateToTab(page, "套装");
  await openCard(page, outfitName);
  await clickButton(page, "更多操作");
  await clickButton(page, /编辑套装/);
  await expectText(page, "编辑套装信息");
  await fillFirstTextControl(page, editedOutfitName);
  await clickButton(page, "保存套装");

  const edited = await waitForOverview(ctx, session, (overview) =>
    overview.outfits.some((entry) => entry.id === outfit.id && entry.payload.name === editedOutfitName),
    "edited outfit did not reach server",
  );
  const latestOutfit = requiredEntity(edited.outfits.find((entry) => entry.id === outfit.id), "edited outfit");
  const plan = await createEntity(ctx, session, "outfit-plans", outfitPlanPayload(latestOutfit.id, date));
  const worn = await postAction(ctx, session, `/api/workspace/outfits/${latestOutfit.id}/mark-worn`, {
    clientMutationId: randomUUID(),
    expectedRevision: latestOutfit.revision,
    wornAt: `${date}T12:00:00.000Z`,
  });
  assert(worn.entity, "mark-worn did not return outfit entity");

  const afterWorn = await waitForOverview(ctx, session, (overview) => {
    const outfitEntry = overview.outfits.find((entry) => entry.id === latestOutfit.id);
    const planEntry = overview.outfitPlans.find((entry) => entry.id === plan.id);
    return includesDate(outfitEntry?.payload.wornDates, date)
      && planEntry?.payload.status === "worn"
      && overview.wearEvents.length === 3
      && overview.garments
        .filter((entry) => [topLegacyId, bottomLegacyId].includes(Number(entry.payload.legacyItemId)))
        .every((entry) => includesDate(entry.payload.wornDates, date));
  }, "mark-worn did not update outfit, plan, garments and wearEvents");
  const wornOutfit = requiredEntity(afterWorn.outfits.find((entry) => entry.id === latestOutfit.id), "worn outfit");

  await postAction(ctx, session, `/api/workspace/outfits/${wornOutfit.id}/cancel-worn`, {
    clientMutationId: randomUUID(),
    expectedRevision: wornOutfit.revision,
    date,
    payload: {},
  });

  await waitForOverview(ctx, session, (overview) => {
    const outfitEntry = overview.outfits.find((entry) => entry.id === latestOutfit.id);
    const planEntry = overview.outfitPlans.find((entry) => entry.id === plan.id);
    return !includesDate(outfitEntry?.payload.wornDates, date)
      && planEntry?.payload.status === "planned"
      && overview.wearEvents.length === 0
      && overview.garments
        .filter((entry) => [topLegacyId, bottomLegacyId].includes(Number(entry.payload.legacyItemId)))
        .every((entry) => !includesDate(entry.payload.wornDates, date));
  }, "cancel-worn did not restore outfit, plan, garments and wearEvents");
}

export async function criticalAccountIsolationFlow(ctx: AndroidCriticalContext): Promise<void> {
  const accountA = await ensureAccount(ctx);
  const sessionA = await ctx.api.login(accountA);
  const accountB = await ensureAccount(ctx);
  const sessionB = await ctx.api.login(accountB);
  const name = uniqueName("critical账号A");
  await createEntity(ctx, sessionA, "garments", garmentPayload(name));

  const overviewA = await getOverview(ctx, sessionA);
  assert(overviewA.garments.some((entry) => entry.payload.name === name), "account A setup garment missing");
  const page = await loginFreshApp(ctx, accountB);
  await navigateToTab(page, "衣橱");
  await expectHidden(page.getByRole("button", { name: textMatcher(name) }), "account A garment in account B UI");

  const overviewB = await getOverview(ctx, sessionB);
  assert(!overviewB.garments.some((entry) => entry.payload.name === name), "account B can read account A garment through API");
}

export async function criticalLogoutReloginForceStopRestoreFlow(ctx: AndroidCriticalContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("critical恢复");
  await createEntity(ctx, session, "garments", garmentPayload(name));
  let page = await loginFreshApp(ctx, account);
  await navigateToTab(page, "衣橱");
  await expectCard(page, name);

  await logoutByUi(page);
  await loginByUi(page, account);
  await waitForMainApp(page);
  await navigateToTab(page, "衣橱");
  await expectCard(page, name);

  assert(ctx.device.forceStop, "device.forceStop is required for force-stop restore case");
  await ctx.device.forceStop(ctx.packageName ?? DEFAULT_PACKAGE);
  page = await startApp(ctx);
  await waitForMainApp(page);
  await navigateToTab(page, "衣橱");
  await expectCard(page, name);

  const overview = await getOverview(ctx, session);
  assert(overview.garments.some((entry) => entry.payload.name === name), "server data missing after force-stop restore");
}

async function ensureAccount(ctx: AndroidCriticalContext): Promise<AndroidCriticalAccount> {
  const account = await ctx.freshAccount();
  if (ctx.api.register) {
    try {
      await ctx.api.register(account);
    } catch (error) {
      if (!/already|exists|duplicate|已存在|已注册/i.test(message(error))) throw error;
    }
  }
  return account;
}

async function loginFreshApp(ctx: AndroidCriticalContext, account: AndroidCriticalAccount): Promise<Page> {
  const page = await resetApp(ctx);
  await loginByUi(page, account);
  await waitForMainApp(page);
  return page;
}

async function resetApp(ctx: AndroidCriticalContext): Promise<Page> {
  if (ctx.device.clearAppData) {
    await ctx.device.clearAppData(ctx.packageName ?? DEFAULT_PACKAGE);
    return startApp(ctx);
  }
  const page = await startApp(ctx);
  await logoutIfAuthenticated(page);
  return page;
}

async function startApp(ctx: AndroidCriticalContext): Promise<Page> {
  const nextPage = await ctx.device.startApp?.(ctx.packageName ?? DEFAULT_PACKAGE);
  const page = isPage(nextPage) ? nextPage : ctx.page;
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  return page;
}

function isPage(value: unknown): value is Page {
  return Boolean(value && typeof (value as Page).waitForLoadState === "function");
}

async function loginByUi(page: Page, account: AndroidCriticalAccount): Promise<void> {
  if (await page.getByTestId("global-create").isVisible({ timeout: 1_500 }).catch(() => false)) return;
  await fillLabeled(page, "邮箱或手机号", account.phone);
  await fillLabeled(page, "密码", account.password);
  const terms = page.locator("#auth-login-terms-accepted");
  if (await terms.isVisible({ timeout: 2_000 }).catch(() => false)) {
    if (!(await terms.isChecked())) await page.locator('label[for="auth-login-terms-accepted"]').click();
  }
  await clickButton(page, /^登录$/);
}

async function logoutIfAuthenticated(page: Page): Promise<void> {
  if (!(await page.getByTestId("global-create").isVisible({ timeout: 2_000 }).catch(() => false))) return;
  await logoutByUi(page);
}

async function logoutByUi(page: Page): Promise<void> {
  await navigateToTab(page, "设置");
  await clickButton(page, /^管理$/);
  await clickButton(page, /^退出登录$/);
  await clickButton(page, /^退出登录$/);
  await page.getByRole("button", { name: /^登录$/ }).waitFor({ state: "visible", timeout: 15_000 });
}

async function waitForMainApp(page: Page): Promise<void> {
  await page.getByTestId("global-create").waitFor({ state: "visible", timeout: 60_000 });
}

async function navigateToTab(page: Page, tab: "衣橱" | "套装" | "种草" | "设置"): Promise<void> {
  const tabButton = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(tab)}$`) }).first();
  for (let depth = 0; depth < 3 && !(await tabButton.isVisible().catch(() => false)); depth += 1) {
    const back = page.getByRole("button", { name: "返回", exact: true }).first();
    if (!(await back.isVisible().catch(() => false))) break;
    await back.click();
    await page.waitForTimeout(300);
  }
  await clickButton(page, new RegExp(`^${escapeRegExp(tab)}$`));
  await page.waitForTimeout(300);
}

async function openCard(page: Page, name: string): Promise<void> {
  const card = page.getByRole("button", { name: textMatcher(name) }).first();
  await card.waitFor({ state: "visible", timeout: 20_000 });
  await card.click();
  await expectText(page, name);
}

async function expectCard(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: textMatcher(name) }).first().waitFor({ state: "visible", timeout: 20_000 });
}

async function expectText(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 20_000 });
}

async function expectHidden(locator: Locator, label: string): Promise<void> {
  await locator.first().waitFor({ state: "hidden", timeout: 10_000 }).catch(async () => {
    assert(!(await locator.first().isVisible().catch(() => false)), `${label} should be hidden`);
  });
}

async function clickButton(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole("button", { name }).first();
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  await button.click({ timeout: 5_000 }).catch(async () => button.evaluate((element) => (element as HTMLButtonElement).click()));
}

async function clickLastButton(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole("button", { name }).last();
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  await button.click({ timeout: 5_000 }).catch(async () => button.evaluate((element) => (element as HTMLButtonElement).click()));
}

async function fillLabeled(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true }).first();
  await field.waitFor({ state: "visible", timeout: 20_000 });
  await field.fill(value);
}

async function fillFirstTextControl(page: Page, value: string): Promise<void> {
  const controls = page.locator('input:not([type="hidden"]), textarea');
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible().catch(() => false))) continue;
    await control.scrollIntoViewIfNeeded().catch(() => undefined);
    await control.fill(value);
    return;
  }
  throw new Error("no visible text input found");
}

async function createEntity(
  ctx: AndroidCriticalContext,
  session: AndroidCriticalApiSession,
  resource: "garments" | "wishlist" | "outfits" | "outfit-plans",
  payload: Record<string, unknown>,
): Promise<WorkspaceEntity> {
  const response = await request<CommandResponse>(ctx, session, `/api/workspace/${resource}`, {
    method: "POST",
    body: { clientMutationId: randomUUID(), payload, assetMutations: [] },
  });
  assert(response.status === "committed" && response.entity, `create ${resource} did not commit`);
  return response.entity;
}

async function postAction(
  ctx: AndroidCriticalContext,
  session: AndroidCriticalApiSession,
  path: string,
  body: Record<string, unknown>,
): Promise<CommandResponse> {
  const response = await request<CommandResponse>(ctx, session, path, { method: "POST", body });
  assert(response.status === "committed", `${path} did not commit`);
  return response;
}

async function getOverview(ctx: AndroidCriticalContext, session: AndroidCriticalApiSession): Promise<WorkspaceOverview> {
  if (ctx.api.overview) return ctx.api.overview(session);
  return request<WorkspaceOverview>(ctx, session, "/api/workspace/overview");
}

async function request<T>(
  ctx: AndroidCriticalContext,
  session: AndroidCriticalApiSession,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const requester = ctx.api.workspace ?? ctx.api.request;
  assert(requester, "api.workspace or api.request is required");
  return requester.call(ctx.api, session, path, options) as Promise<T>;
}

async function waitForOverview(
  ctx: AndroidCriticalContext,
  session: AndroidCriticalApiSession,
  predicate: (overview: WorkspaceOverview) => boolean,
  errorMessage: string,
): Promise<WorkspaceOverview> {
  const deadline = Date.now() + 30_000;
  let last: WorkspaceOverview | undefined;
  while (Date.now() < deadline) {
    last = await getOverview(ctx, session);
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${errorMessage}: ${JSON.stringify(last)}`);
}

function garmentPayload(name: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    legacyItemId: uniqueNumericId(),
    name,
    locationId: "home",
    status: "active",
    category: "tops",
    colors: { mode: "single", primary: "白" },
    seasons: ["all"],
    styles: ["casual"],
    wornDates: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function wishlistPayload(name: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    legacyWishlistId: `wishlist-${randomUUID()}`,
    name,
    status: "interested",
    category: "tops",
    colors: { mode: "single", primary: "蓝" },
    seasons: ["all"],
    styles: ["casual"],
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function outfitPayload(name: string, itemIds: number[]): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    name,
    legacyItemIds: itemIds,
    itemIds,
    favorite: false,
    source: "manual",
    seasons: ["all"],
    sceneTags: ["通勤"],
    styleTags: ["casual"],
    pairingTags: [],
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function outfitPlanPayload(outfitId: string, date: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    date,
    outfitId,
    status: "planned",
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
  };
}

function includesDate(value: unknown, date: string): boolean {
  return Array.isArray(value) && value.includes(date);
}

function requiredEntity<T>(value: T | undefined, label: string): T {
  assert(value, `${label} missing`);
  return value;
}

function assert(condition: unknown, messageText: string): asserts condition {
  if (!condition) throw new Error(messageText);
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function uniqueNumericId(): number {
  return Date.now() + Math.floor(Math.random() * 100_000);
}

function localDateKey(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function textMatcher(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeArtifactName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
}
