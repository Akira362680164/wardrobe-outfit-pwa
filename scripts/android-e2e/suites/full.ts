import { randomUUID } from "node:crypto";

import type { AndroidE2ECase, AndroidE2EContext, WorkspaceEntity } from "./types";
import {
  assert,
  clickButton,
  clickLastButton,
  createEntity,
  createImageEntity,
  expectCard,
  expectHidden,
  expectText,
  fillFirstTextControl,
  fixtureImagePath,
  garmentPayload,
  getOverview,
  ensureAccount,
  localDateKey,
  loginByUi,
  loginFreshApp,
  navigateToTab,
  openCard,
  outfitPayload,
  outfitPlanPayload,
  payloadReferences,
  postAction,
  textMatcher,
  uniqueName,
  waitForMainApp,
  waitForOverview,
  wishlistPayload,
} from "./helpers";

export function fullCases(): AndroidE2ECase[] {
  return [
    { id: "full:image-garment-asset-restore", title: "真实图片单品保存、首页展示和重启恢复", run: fullImageGarmentAssetRestore },
    { id: "full:wishlist-image-asset-convert", title: "带图种草转衣橱后图片资产跟随", run: fullWishlistImageAssetConvert },
    { id: "full:cascade-delete-references", title: "删除被引用单品后 UI 和服务端级联一致", run: fullCascadeDeleteReferences },
    { id: "full:network-failure-retry", title: "服务端保存失败停留当前页，恢复后重试不重复创建", run: fullNetworkFailureRetry },
    { id: "full:ai-no-key-fallback-entry", title: "无 MiniMax Key 时录入入口不崩并保留失败兜底边界", run: fullAiNoKeyFallbackEntry },
    { id: "full:native-boundaries", title: "Android 返回键、清数据重登和竖屏截图", run: fullNativeBoundaries },
  ];
}

async function fullImageGarmentAssetRestore(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("full图片单品");
  const garment = await createImageEntity(ctx, session, "garments", "garment", garmentPayload(name, {
    cropBox: { x: 0.08, y: 0.06, width: 0.84, height: 0.88 },
  }));
  assert(garment.assetRefs?.imageDataUrl?.assetId, "created garment is missing image asset reference");

  let page = await loginFreshApp(ctx, account);
  await navigateToTab(page, "衣橱");
  await expectCard(page, name);
  await assertCardImageVisibleAndNotStretched(ctx, name);
  await ctx.artifacts.screenshot("full-image-home-before-restart", page);

  const restartedPage = await ctx.device.restartApp();
  page = restartedPage && "waitForLoadState" in restartedPage ? restartedPage : ctx.page;
  await waitForMainApp(page);
  await navigateToTab(page, "衣橱");
  await expectCard(page, name);
  await assertCardImageVisibleAndNotStretched(ctx, name);
}

async function fullWishlistImageAssetConvert(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("full带图种草");
  const wishlist = await createImageEntity(ctx, session, "wishlist", "wishlistItem", wishlistPayload(name));
  const wishlistAssetId = wishlist.assetRefs?.imageDataUrl?.assetId;
  assert(wishlistAssetId, "created wishlist is missing image asset reference");
  const page = await loginFreshApp(ctx, account);

  await navigateToTab(page, "种草");
  await openCard(page, name);
  await clickButton(page, /^已买$/);
  await clickButton(page, "确认加入衣橱");

  const converted = await waitForOverview(ctx, session, (overview) => {
    const item = overview.wishlistItems.find((entry) => entry.id === wishlist.id);
    return Boolean(item?.payload.convertedGarmentId)
      && overview.garments.some((entry) => entry.payload.sourceWishlistId === wishlist.id && entry.assetRefs?.imageDataUrl?.assetId === wishlistAssetId);
  }, "wishlist image asset did not follow converted garment");
  const convertedGarment = converted.garments.find((entry) => entry.payload.sourceWishlistId === wishlist.id);
  assert(convertedGarment?.assetRefs?.imageDataUrl?.assetId === wishlistAssetId, "converted garment image asset differs from wishlist asset");

  await navigateToTab(page, "衣橱");
  await expectCard(page, name);
  await assertCardImageVisibleAndNotStretched(ctx, name);

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
  }, "undo purchase did not move item back to wishlist or delete converted garment");
  await navigateToTab(page, "种草");
  await expectCard(page, name);
  await navigateToTab(page, "衣橱");
  await expectHidden(page.getByRole("button", { name: textMatcher(name) }), "converted garment after undo");
}

async function fullCascadeDeleteReferences(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const date = localDateKey();
  const topName = uniqueName("full级联上衣");
  const bottomName = uniqueName("full级联下装");
  const outfitName = uniqueName("full级联套装");
  const top = await createEntity(ctx, session, "garments", garmentPayload(topName, { category: "tops" }));
  const bottom = await createEntity(ctx, session, "garments", garmentPayload(bottomName, { category: "pants" }));
  const topLegacyId = Number(top.payload.legacyItemId);
  const bottomLegacyId = Number(bottom.payload.legacyItemId);
  const outfit = await createEntity(ctx, session, "outfits", outfitPayload(outfitName, [topLegacyId, bottomLegacyId]));
  await createEntity(ctx, session, "outfit-plans", outfitPlanPayload(String(outfit.payload.legacyOutfitId), date));
  const worn = await postAction(ctx, session, `/api/workspace/outfits/${outfit.id}/mark-worn`, {
    clientMutationId: randomUUID(),
    expectedRevision: outfit.revision,
    wornAt: `${date}T12:00:00.000Z`,
  });
  assert(worn.entity, "mark-worn did not return outfit entity");
  await createEntity(ctx, session, "wishlist", wishlistPayload(uniqueName("full已买种草"), {
    purchased: true,
    convertedGarmentId: top.id,
    convertedItemId: topLegacyId,
    convertedAt: new Date().toISOString(),
  }));

  const page = await loginFreshApp(ctx, account);
  await navigateToTab(page, "衣橱");
  await openCard(page, topName);
  await clickButton(page, "更多操作");
  await clickButton(page, /删除衣物/);
  await clickButton(page, /^删除$/);

  await waitForOverview(ctx, session, (overview) => {
    const noGarment = !overview.garments.some((entry) => entry.id === top.id);
    const activeCollections = [
      ...overview.outfits,
      ...overview.outfitPlans,
      ...overview.wishlistItems,
      ...overview.wearEvents,
    ];
    return noGarment && activeCollections.every((entry) =>
      !payloadReferences(entry.payload, top.id)
      && !payloadReferences(entry.payload, topLegacyId),
    );
  }, "deleted garment is still referenced by outfit, plan, wishlist or wearEvent");
  await navigateToTab(page, "衣橱");
  await expectHidden(page.getByRole("button", { name: textMatcher(topName) }), "deleted referenced garment");
}

async function fullNetworkFailureRetry(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("full失败重试");
  const editedName = `${name}-重试成功`;
  const garment = await createEntity(ctx, session, "garments", garmentPayload(name));
  const page = await loginFreshApp(ctx, account);

  await navigateToTab(page, "衣橱");
  await openCard(page, name);
  await clickButton(page, "更多操作");
  await clickButton(page, /编辑衣物/);
  await expectText(page, "编辑衣物");
  await fillFirstTextControl(page, editedName);

  await ctx.api.setFault({
    method: "PUT",
    pathIncludes: `/api/workspace/garments/${garment.id}`,
    times: 1,
    statusCode: 503,
    message: "Injected E2E save failure",
  });
  try {
    await clickButton(page, /^保存$/);
    await expectText(page, /Injected E2E save failure|保存失败|服务暂时不可用/);
    await page.getByRole("button", { name: /^保存$/ }).first().waitFor({ state: "visible", timeout: 20_000 });
    const unchanged = await getOverview(ctx, session);
    assert(unchanged.garments.some((entry) => entry.id === garment.id && entry.payload.name === name), "failed save changed server data");
  } finally {
    await ctx.api.clearFaults();
  }

  await clickButton(page, /^保存$/);
  await waitForOverview(ctx, session, (overview) =>
    overview.garments.some((entry) => entry.id === garment.id && entry.payload.name === editedName),
    "retried save did not reach server",
  );

  const duplicateName = uniqueName("full幂等创建");
  const clientMutationId = randomUUID();
  const body = { clientMutationId, payload: garmentPayload(duplicateName), assetMutations: [] };
  await ctx.api.setFault({ method: "POST", pathIncludes: "/api/workspace/garments", times: 1, statusCode: 503 });
  await ctx.api.request(session, "/api/workspace/garments", { method: "POST", body }).catch(() => undefined);
  await ctx.api.clearFaults();
  const first = await ctx.api.request<{ entity?: WorkspaceEntity }>(session, "/api/workspace/garments", { method: "POST", body });
  const second = await ctx.api.request<{ entity?: WorkspaceEntity }>(session, "/api/workspace/garments", { method: "POST", body });
  assert(first.entity?.id && first.entity.id === second.entity?.id, "same clientMutationId created different entities");
  await waitForOverview(ctx, session, (overview) =>
    overview.garments.filter((entry) => entry.payload.name === duplicateName).length === 1,
    "same clientMutationId created duplicate garments",
  );
}

async function fullAiNoKeyFallbackEntry(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const page = await loginFreshApp(ctx, account);
  await page.evaluate(() => {
    window.localStorage.removeItem("wardrobe-minimax-settings");
  });
  await page.reload();
  await waitForMainApp(page);

  await navigateToTab(page, "衣橱");
  await page.getByTestId("global-create").click();
  await clickButton(page, /添加衣物/);
  await expectText(page, /拍照|从图库选择|选择单品照片/);

  const fileInputs = page.locator('input[type="file"][accept*="image"]');
  if ((await fileInputs.count()) > 0) {
    await fileInputs.last().setInputFiles(fixtureImagePath());
    await page.waitForTimeout(2_000);
    const next = page.getByRole("button", { name: /下一步（AI 识别）/ }).first();
    if (await next.isVisible({ timeout: 2_000 }).catch(() => false) && await next.isEnabled()) {
      await next.click();
      await expectText(page, /未配置 MiniMax Key|AI 识别失败/);
    } else {
      await ctx.artifacts.log("AI no-key fallback: native intake kept the AI next step disabled after synthetic file injection; native picker automation remains deferred");
    }
  } else {
    await ctx.artifacts.log("AI no-key fallback: native photo picker path is present; gallery/camera automation is deferred to Appium/ADB-assisted coverage");
  }
}

async function fullNativeBoundaries(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx);
  const session = await ctx.api.login(account);
  const name = uniqueName("full原生恢复");
  await createEntity(ctx, session, "garments", garmentPayload(name));
  let page = await loginFreshApp(ctx, account);

  await navigateToTab(page, "衣橱");
  await openCard(page, name);
  await ctx.device.pressBack();
  await expectCard(page, name);
  await ctx.device.screenshot("full-native-portrait.png");

  await ctx.device.clearAppData();
  const restarted = await ctx.device.startApp();
  page = restarted && "waitForLoadState" in restarted ? restarted : ctx.page;
  await loginByUi(page, account);
  await waitForMainApp(page);
  await navigateToTab(page, "衣橱");
  await expectCard(page, name);
  const overview = await getOverview(ctx, session);
  assert(overview.garments.some((entry) => entry.payload.name === name), "server garment missing after clear-data relogin");
}

async function assertCardImageVisibleAndNotStretched(ctx: AndroidE2EContext, name: string): Promise<void> {
  const image = ctx.page.getByRole("img", { name: textMatcher(name) }).first();
  await image.waitFor({ state: "visible", timeout: 30_000 });
  const objectFit = await image.evaluate((element) => window.getComputedStyle(element).objectFit);
  assert(objectFit === "cover" || objectFit === "contain", `home card image uses unexpected object-fit: ${objectFit}`);
}
