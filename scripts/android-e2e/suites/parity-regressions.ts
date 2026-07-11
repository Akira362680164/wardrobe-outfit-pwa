import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import type { AndroidE2ECase, AndroidE2EContext, AuthSession, WorkspaceEntity, WorkspaceOverview } from "./types";
import { assert, createEntity, ensureAccount, garmentPayload, getOverview, localDateKey, loginFreshApp, navigateToTab, outfitPayload, outfitPlanPayload, postAction, uniqueName, waitForOverview } from "./helpers";

export const PARITY_OUTFIT_DEFECTS = ["STATIC-OUTFITS-001", "STATIC-OUTFITS-002", "STATIC-OUTFITS-003", "STATIC-OUTFITS-004", "RUNTIME-ANDROID-002"] as const;

async function createTrip(ctx: AndroidE2EContext, session: AuthSession, title: string, date: string, packingChecklist: Record<string, unknown>[] = []): Promise<WorkspaceEntity> {
  const response = await ctx.api.request<{ status: string; entity?: WorkspaceEntity }>(session, "/api/workspace/trip-plans", {
    method: "POST",
    body: { clientMutationId: randomUUID(), payload: { id: `calendar-${randomUUID()}`, type: "travel", title, startDate: date, endDate: date, tone: "clay", destination: "E2E", activities: [], packingEnabled: true, packingChecklist } },
  });
  assert(response.status === "committed" && response.entity, "trip fixture did not commit");
  return response.entity;
}

async function openCalendar(page: Page): Promise<void> {
  await navigateToTab(page, "套装");
  await page.locator('[data-parity-id="parity.app.app.src.components.outfit.list.view.5f851a498b"]').click();
}

async function openPlan(page: Page, _date: string, _trip: WorkspaceEntity): Promise<void> {
  await openCalendar(page);
  await page.locator('[data-parity-id^="parity.app.app.src.components.outfit.planning.calendar.view.36293ba0bc."]').first().click();
}

export function assertPlanAbsent(overview: WorkspaceOverview, tripId: string): void {
  assert(!(overview.tripPlans ?? []).some((entry) => entry.id === tripId), "deleted trip remains in server overview");
}

export function assertCancelWornRestored(overview: WorkspaceOverview, outfitId: string, planId: string, date: string): void {
  const outfit = overview.outfits.find((entry) => entry.id === outfitId);
  const plan = overview.outfitPlans.find((entry) => entry.id === planId);
  assert(!Array.isArray(outfit?.payload.wornDates) || !outfit.payload.wornDates.includes(date), "outfit worn date was not removed");
  assert(plan?.payload.status === "planned", "day plan status was not restored to planned");
  assert(!overview.wearEvents.some((entry) => entry.payload.date === date || String(entry.payload.wornAt ?? "").startsWith(date)), "wear event remains after cancel-worn");
}

export function parityRegressionCases(): AndroidE2ECase[] {
  return [
    { id: "parity:STATIC-OUTFITS-001", title: "旅行计划删除后服务端不存在", run: planDeleteAbsence },
    { id: "parity:STATIC-OUTFITS-002", title: "日计划删除后剩余打包清单一致", run: dayPlanDeleteChecklist },
    { id: "parity:STATIC-OUTFITS-003", title: "打包 toggle/add/all/reset force-stop 恢复", run: packingForceStopReadback },
    { id: "parity:STATIC-OUTFITS-004", title: "取消已穿恢复计划与穿着状态", run: cancelWornRestoration },
    { id: "parity:RUNTIME-ANDROID-002", title: "超长套装名不撑宽首页或挤出固定导航", run: longOutfitNameViewportContainment },
  ];
}

async function planDeleteAbsence(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx); const session = await ctx.api.login(account); const date = localDateKey();
  const trip = await createTrip(ctx, session, uniqueName("parity删除旅行"), date);
  const page = await loginFreshApp(ctx, account); await openPlan(page, date, trip);
  await page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.detail.view.563a0bc152"]').click();
  await page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.detail.view.1d2ed2125a"]').click();
  const overview = await waitForOverview(ctx, session, (value) => !(value.tripPlans ?? []).some((entry) => entry.id === trip.id), "trip deletion not read back");
  assertPlanAbsent(overview, trip.id);
}

async function dayPlanDeleteChecklist(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx); const session = await ctx.api.login(account); const date = futureDateKey();
  const garment = await createEntity(ctx, session, "garments", garmentPayload(uniqueName("parity日计划衣物")));
  const outfit = await createEntity(ctx, session, "outfits", outfitPayload(uniqueName("parity日计划套装"), [Number(garment.payload.legacyItemId)]));
  const trip = await createTrip(ctx, session, uniqueName("parity日计划旅行"), date);
  const keep = { id: "packing-keep", calendarPlanId: trip.id, source: "manual", label: "保留物品", category: "手动新增", quantity: 1, checked: false, sourceItemIds: [] };
  await ctx.api.request(session, `/api/workspace/trip-plans/${trip.id}/checklist`, {
    method: "PUT",
    body: { clientMutationId: randomUUID(), expectedRevision: trip.revision, items: [keep] },
  });
  const plan = await createEntity(ctx, session, "outfit-plans", {
    ...outfitPlanPayload(String(outfit.payload.legacyOutfitId), date),
    calendarPlanId: trip.id,
  });
  const page = await loginFreshApp(ctx, account); await openCalendar(page);
  const changeDelete = page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.day.card.6ccdb3a6e8"]');
  if (!(await changeDelete.isVisible().catch(() => false))) {
    await page.locator(`[data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.1803ec14dd.${date}"]`).click();
  }
  await changeDelete.click();
  await page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.day.card.d54549f3cd"]').click();
  await page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.day.card.52b940dcf6"]').click();
  await waitForOverview(ctx, session, (value) => !value.outfitPlans.some((entry) => entry.id === plan.id), "day plan deletion not read back");
  const refreshed = await ctx.api.request<{ data: WorkspaceEntity }>(session, `/api/workspace/trip-plans/${trip.id}/checklist`);
  const items = (refreshed.data.payload.packingChecklist ?? refreshed.data.payload.packingChecklistItems) as Array<{ label?: string }> | undefined;
  assert(Array.isArray(items) && items.some((entry) => entry.label === "保留物品"), "remaining checklist missing after day plan deletion");
}

function futureDateKey(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const y = date.getFullYear(); const m = `${date.getMonth() + 1}`.padStart(2, "0"); const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function packingForceStopReadback(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx); const session = await ctx.api.login(account); const date = localDateKey();
  const trip = await createTrip(ctx, session, uniqueName("parity打包"), date);
  const item = { id: "packing-e2e", calendarPlanId: trip.id, source: "manual", label: "上衣", category: "衣物", quantity: 1, checked: false, sourceItemIds: [] };
  await ctx.api.request(session, `/api/workspace/trip-plans/${trip.id}/checklist`, {
    method: "PUT",
    body: { clientMutationId: randomUUID(), expectedRevision: trip.revision, items: [item] },
  });
  let page = await loginFreshApp(ctx, account); await openPlan(page, date, trip);
  const openPacking = page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.detail.view.2494d0b8fa"]');
  await openPacking.scrollIntoViewIfNeeded();
  await ctx.artifacts.writeJson("parity-packing-open-bounds.json", await openPacking.boundingBox());
  await ctx.artifacts.screenshot("parity-packing-before-open", page);
  await page.waitForTimeout(1_500);
  await openPacking.evaluate((element) => (element as HTMLButtonElement).click());
  await page.waitForTimeout(1_500);
  const firstPackingItem = page.locator('[data-parity-id^="parity.app.app.src.components.plan.packing.checklist.view.714a3e5eb0."]').first();
  await firstPackingItem.scrollIntoViewIfNeeded();
  await ctx.artifacts.screenshot("parity-packing-before-toggle", page);
  await firstPackingItem.click();
  await page.locator('[data-parity-id="parity.app.app.src.components.plan.packing.checklist.view.a4c8d5520e"]').click();
  await page.locator('[data-parity-id="parity.app.app.src.components.plan.packing.checklist.view.d026691b40"]').fill("充电器");
  await page.locator('[data-parity-id="parity.app.app.src.components.plan.packing.checklist.view.bba5519b83"]').click();
  await page.locator('[data-parity-id="parity.app.app.src.components.plan.packing.checklist.view.67f7abbe88"]').click();
  await page.locator('[data-parity-id="parity.app.app.src.components.plan.packing.checklist.view.40a5d871ca"]').click();
  await page.locator('[data-parity-id="parity.app.app.src.components.plan.packing.checklist.view.32237cea90"]').click();
  await ctx.device.forceStop(); const restarted = await ctx.device.startApp(); page = restarted && "locator" in restarted ? restarted : ctx.page;
  const overview = await getOverview(ctx, session); const saved = (overview.tripPlans ?? []).find((entry) => entry.id === trip.id);
  const items = (saved?.payload.packingChecklist ?? saved?.payload.packingChecklistItems) as Array<{ label?: string; checked?: boolean }> | undefined;
  assert(Array.isArray(items) && items.some((entry) => entry.label === "充电器") && items.every((entry) => !entry.checked), "packing state did not survive force-stop readback");
  await ctx.artifacts.screenshot("parity-packing-force-stop", page);
}

async function cancelWornRestoration(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx); const session = await ctx.api.login(account); const date = localDateKey();
  const garment = await createEntity(ctx, session, "garments", garmentPayload(uniqueName("parity取消已穿")));
  const outfit = await createEntity(ctx, session, "outfits", outfitPayload(uniqueName("parity已穿套装"), [Number(garment.payload.legacyItemId)]));
  const plan = await createEntity(ctx, session, "outfit-plans", outfitPlanPayload(String(outfit.payload.legacyOutfitId), date));
  await postAction(ctx, session, `/api/workspace/outfits/${outfit.id}/mark-worn`, { clientMutationId: randomUUID(), expectedRevision: outfit.revision, wornAt: `${date}T12:00:00.000Z` });
  const page = await loginFreshApp(ctx, account); await openCalendar(page);
  const cancelWorn = page.locator('[data-parity-id="parity.app.app.src.components.outfit.plan.day.card.297ab020da"]');
  const expandedCard = page.locator('[data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.681fe1f11b"]');
  await page.waitForTimeout(1_500);
  for (let attempt = 0; attempt < 2 && await cancelWorn.count() === 0; attempt += 1) {
    await page.locator(`[data-parity-id="parity.app.app.src.components.outfit.planning.calendar.view.1803ec14dd.${date}"]`).evaluate((element) => (element as HTMLElement).click());
    await page.waitForTimeout(1_500);
  }
  const expandedCardState = await expandedCard.count() > 0 ? await expandedCard.first().evaluate((element) => ({
    text: element.textContent,
    inlineStyle: element.getAttribute("style"),
    computedHeight: getComputedStyle(element).height,
    opacity: getComputedStyle(element).opacity,
    parityIds: Array.from(element.querySelectorAll("[data-parity-id]"), (node) => node.getAttribute("data-parity-id")),
  })) : null;
  await ctx.artifacts.writeJson("parity-cancel-worn-dom.json", { expandedCardCount: await expandedCard.count(), cancelWornCount: await cancelWorn.count(), expandedCardState });
  await ctx.artifacts.screenshot("parity-cancel-worn-before", page);
  await cancelWorn.evaluate((element) => (element as HTMLButtonElement).click());
  await page.waitForTimeout(1_500);
  const restored = await waitForOverview(ctx, session, (value) => {
    try { assertCancelWornRestored(value, outfit.id, plan.id, date); return true; } catch { return false; }
  }, "cancel-worn did not restore state");
  assertCancelWornRestored(restored, outfit.id, plan.id, date);
}

async function longOutfitNameViewportContainment(ctx: AndroidE2EContext): Promise<void> {
  const account = await ensureAccount(ctx); const session = await ctx.api.login(account); const date = localDateKey();
  const garment = await createEntity(ctx, session, "garments", garmentPayload(uniqueName("parity长名称衣物")));
  const longName = "超长套装名称用于验证页面绝不横向扩张".repeat(12);
  const outfit = await createEntity(ctx, session, "outfits", outfitPayload(longName, [Number(garment.payload.legacyItemId)]));
  await createEntity(ctx, session, "outfit-plans", outfitPlanPayload(String(outfit.payload.legacyOutfitId), date));
  const page = await loginFreshApp(ctx, account);
  await page.getByRole("button", { name: /^套装$/ }).first().evaluate((element) => (element as HTMLButtonElement).click());
  await page.waitForTimeout(1_500);
  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const value = document.querySelector(selector)?.getBoundingClientRect();
      return value ? { left: value.left, right: value.right, width: value.width } : null;
    };
    return {
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      addPlan: rect('[data-parity-id="parity.app.app.src.components.outfit.list.view.5546e4b500"]'),
      globalCreate: rect('[data-testid="global-create"]'),
      bottomNav: rect(".app-floating-nav"),
      outfitName: rect('[data-parity-id="parity.app.app.src.components.outfit.plan.day.card.82b8eae78e"]'),
    };
  });
  await ctx.artifacts.writeJson("parity-long-outfit-name-layout.json", metrics);
  await ctx.artifacts.screenshot("parity-long-outfit-name-layout", page);
  assert(metrics.documentScrollWidth <= metrics.innerWidth + 1 && metrics.bodyScrollWidth <= metrics.innerWidth + 1, "long outfit name widened the page");
  for (const [label, value] of [["add-plan", metrics.addPlan], ["global-create", metrics.globalCreate], ["bottom-nav", metrics.bottomNav]] as const) {
    assert(value && value.left >= -1 && value.right <= metrics.innerWidth + 1, `${label} left the viewport`);
  }
  assert(metrics.outfitName && metrics.outfitName.width <= metrics.innerWidth, "long outfit name control exceeded the viewport");
}
