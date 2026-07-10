import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

import type { AndroidE2EAccount, AndroidE2EContext, AuthSession, WorkspaceEntity, WorkspaceOverview } from "./types";

export interface CommandResponse {
  status: "committed" | "in_progress";
  entity?: WorkspaceEntity;
  entities?: WorkspaceEntity[];
}

export interface WorkspaceAssetMutation {
  kind: "create_or_replace";
  fieldName: string;
  temporaryAssetIds: string[];
}

interface TemporaryAssetSession {
  sessionId: string;
  assets: TemporaryAssetSlot[];
}

interface TemporaryAssetSessionStatus extends TemporaryAssetSession {
  ready: boolean;
}

interface TemporaryAssetSlot {
  assetId: string;
  fieldName: string;
  variant: "original" | "thumbnail";
  uploadStatus: "pending" | "uploaded" | "failed";
}

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);

export async function ensureAccount(ctx: AndroidE2EContext): Promise<AndroidE2EAccount> {
  const account = await ctx.freshAccount();
  try {
    await ctx.api.register(account);
  } catch (error) {
    if (!/already|exists|duplicate|已存在|已注册/i.test(message(error))) throw error;
  }
  return account;
}

export async function loginFreshApp(ctx: AndroidE2EContext, account: AndroidE2EAccount): Promise<Page> {
  await ctx.device.clearAppData();
  const page = await startApp(ctx);
  await loginByUi(page, account);
  await waitForMainApp(page);
  return page;
}

export async function startApp(ctx: AndroidE2EContext): Promise<Page> {
  const nextPage = await ctx.device.startApp();
  const page = isPage(nextPage) ? nextPage : ctx.page;
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  ctx.page = page;
  return page;
}

export async function loginByUi(page: Page, account: AndroidE2EAccount): Promise<void> {
  if (await page.getByTestId("global-create").isVisible({ timeout: 1_500 }).catch(() => false)) return;
  await fillLabeled(page, "手机号", account.phone);
  await fillLabeled(page, "密码", account.password);
  await clickButton(page, /^登录$/);
}

export async function waitForMainApp(page: Page): Promise<void> {
  await page.getByRole("button", { name: "衣橱", exact: true }).waitFor({ state: "visible", timeout: 60_000 });
  const syncState = page.getByTestId("e2e-sync-state");
  if ((await syncState.count()) > 0) {
    await syncState.waitFor({ state: "attached", timeout: 30_000 });
  }
}

export async function navigateToTab(page: Page, tab: "衣橱" | "套装" | "种草" | "设置"): Promise<void> {
  await clickButton(page, new RegExp(`^${escapeRegExp(tab)}$`));
  await page.waitForTimeout(300);
}

export async function openCard(page: Page, name: string): Promise<void> {
  const card = page.getByRole("button", { name: textMatcher(name) }).first();
  await card.waitFor({ state: "visible", timeout: 20_000 });
  await card.scrollIntoViewIfNeeded().catch(() => undefined);
  await card.click();
  await expectText(page, name);
}

export async function expectCard(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: textMatcher(name) }).first().waitFor({ state: "visible", timeout: 20_000 });
}

export async function expectText(page: Page, text: string | RegExp): Promise<void> {
  await page.getByText(text, { exact: typeof text === "string" ? false : undefined }).first().waitFor({ state: "visible", timeout: 20_000 });
}

export async function expectHidden(locator: Locator, label: string): Promise<void> {
  await locator.first().waitFor({ state: "hidden", timeout: 10_000 }).catch(async () => {
    assert(!(await locator.first().isVisible().catch(() => false)), `${label} should be hidden`);
  });
}

export async function clickButton(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole("button", { name }).first();
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  await button.click();
}

export async function clickLastButton(page: Page, name: string | RegExp): Promise<void> {
  const button = page.getByRole("button", { name }).last();
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  await button.click();
}

export async function fillLabeled(page: Page, label: string, value: string): Promise<void> {
  const field = page.getByLabel(label, { exact: true }).first();
  await field.waitFor({ state: "visible", timeout: 20_000 });
  await field.fill(value);
}

export async function fillFirstTextControl(page: Page, value: string): Promise<void> {
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

export async function createEntity(
  ctx: AndroidE2EContext,
  session: AuthSession,
  resource: "garments" | "wishlist" | "outfits" | "outfit-plans",
  payload: Record<string, unknown>,
  assetMutations: WorkspaceAssetMutation[] = [],
): Promise<WorkspaceEntity> {
  const response = await ctx.api.request<CommandResponse>(session, `/api/workspace/${resource}`, {
    method: "POST",
    body: { clientMutationId: randomUUID(), payload, assetMutations },
  });
  assert(response.status === "committed" && response.entity, `create ${resource} did not commit`);
  return response.entity;
}

export async function postAction(
  ctx: AndroidE2EContext,
  session: AuthSession,
  path: string,
  body: Record<string, unknown>,
): Promise<CommandResponse> {
  const response = await ctx.api.request<CommandResponse>(session, path, { method: "POST", body });
  assert(response.status === "committed", `${path} did not commit`);
  return response;
}

export async function getOverview(ctx: AndroidE2EContext, session: AuthSession): Promise<WorkspaceOverview> {
  return ctx.api.overview(session);
}

export async function waitForOverview(
  ctx: AndroidE2EContext,
  session: AuthSession,
  predicate: (overview: WorkspaceOverview) => boolean,
  errorMessage: string,
): Promise<WorkspaceOverview> {
  const deadline = Date.now() + 30_000;
  let last: WorkspaceOverview | undefined;
  while (Date.now() < deadline) {
    last = await getOverview(ctx, session);
    if (predicate(last)) return last;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`${errorMessage}: ${JSON.stringify(last)}`);
}

export async function uploadMainImage(
  ctx: AndroidE2EContext,
  session: AuthSession,
  entityType: "garment" | "wishlistItem" | "outfit" = "garment",
  imagePath = fixtureImagePath(),
): Promise<WorkspaceAssetMutation[]> {
  const original = readFileSync(imagePath);
  const originalMeta = await sharp(original).metadata();
  const thumbnail = await sharp(original)
    .rotate()
    .resize({ width: 480, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer();
  const thumbnailMeta = await sharp(thumbnail).metadata();
  const clientMutationId = randomUUID();
  const request = {
    clientMutationId,
    entityType,
    slots: [
      {
        fieldName: "imageDataUrl",
        variant: "original",
        sha256: sha256(original),
        mimeType: mimeTypeFor(imagePath),
        sizeBytes: original.length,
        width: originalMeta.width,
        height: originalMeta.height,
      },
      {
        fieldName: "imageDataUrl",
        variant: "thumbnail",
        sha256: sha256(thumbnail),
        mimeType: "image/jpeg",
        sizeBytes: thumbnail.length,
        width: thumbnailMeta.width,
        height: thumbnailMeta.height,
      },
    ],
  };
  const temporary = await ctx.api.request<TemporaryAssetSession>(session, "/api/workspace/assets/sessions", {
    method: "POST",
    body: request,
  });

  await uploadSlot(ctx, session, temporary, "original", original, mimeTypeFor(imagePath));
  await uploadSlot(ctx, session, temporary, "thumbnail", thumbnail, "image/jpeg");

  const status = await ctx.api.request<TemporaryAssetSessionStatus>(
    session,
    `/api/workspace/assets/sessions/${encodeURIComponent(temporary.sessionId)}`,
  );
  assert(status.ready, "temporary asset session is not ready after upload");

  const temporaryAssetIds = status.assets
    .filter((asset) => asset.fieldName === "imageDataUrl")
    .map((asset) => asset.assetId);
  assert(temporaryAssetIds.length === 2, `expected 2 uploaded image assets, got ${temporaryAssetIds.length}`);
  return [{ kind: "create_or_replace", fieldName: "imageDataUrl", temporaryAssetIds }];
}

export async function createImageEntity(
  ctx: AndroidE2EContext,
  session: AuthSession,
  resource: "garments" | "wishlist",
  entityType: "garment" | "wishlistItem",
  payload: Record<string, unknown>,
  imagePath = fixtureImagePath(),
): Promise<WorkspaceEntity> {
  const assetMutations = await uploadMainImage(ctx, session, entityType, imagePath);
  return createEntity(ctx, session, resource, payload, assetMutations);
}

export function garmentPayload(name: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
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

export function wishlistPayload(name: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
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
    ...patch,
  };
}

export function outfitPayload(name: string, itemIds: number[]): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    legacyOutfitId: `outfit-${randomUUID()}`,
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

export function outfitPlanPayload(outfitId: string, date: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    legacyPlanEntryId: `plan-${date}-${randomUUID()}`,
    date,
    outfitId,
    status: "planned",
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function fixtureImagePath(fileName = "red-shirt.jpg"): string {
  const configured = process.env.ANDROID_E2E_IMAGE_PATH;
  if (configured) return resolve(configured);
  const fallback = join(ROOT, "e2e", "assets", fileName);
  if (!existsSync(fallback)) throw new Error(`missing fixture image: ${fallback}`);
  return fallback;
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function uniqueNumericId(): number {
  return Date.now() + Math.floor(Math.random() * 100_000);
}

export function localDateKey(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function textMatcher(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}

export function assert(condition: unknown, messageText: string): asserts condition {
  if (!condition) throw new Error(messageText);
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function payloadReferences(value: unknown, needle: string | number): boolean {
  return JSON.stringify(value).includes(String(needle));
}

async function uploadSlot(
  ctx: AndroidE2EContext,
  session: AuthSession,
  temporary: TemporaryAssetSession,
  variant: "original" | "thumbnail",
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const asset = temporary.assets.find((item) => item.fieldName === "imageDataUrl" && item.variant === variant);
  assert(asset, `server did not return upload slot for ${variant}`);
  await ctx.api.upload(
    session,
    `/api/workspace/assets/sessions/${encodeURIComponent(temporary.sessionId)}/assets/${encodeURIComponent(asset.assetId)}`,
    body,
    contentType,
  );
}

function isPage(value: unknown): value is Page {
  return Boolean(value && typeof (value as Page).waitForLoadState === "function");
}

function sha256(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function mimeTypeFor(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
