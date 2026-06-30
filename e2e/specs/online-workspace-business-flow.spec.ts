import { randomUUID } from "node:crypto";

import { expect, test } from "../fixtures/test";
import { createE2ETestAccount } from "../fixtures/accounts";
import { waitForBootstrapReady } from "../fixtures/sync";
import { registerByUi } from "../helpers/auth";
import { getWorkspaceOverview, workspaceRequest } from "../helpers/workspace";

type CommandResponse = { status: "committed" | "in_progress"; entity?: { id: string; revision: number; payload: Record<string, unknown> } };

test("真实 PostgreSQL 完成 CRUD、计划已穿、幂等重试和种草撤销", async ({ page }) => {
  await registerByUi(page, createE2ETestAccount());
  await waitForBootstrapReady(page);

  const create = (resource: string, payload: Record<string, unknown>, mutationId = randomUUID()) =>
    workspaceRequest<CommandResponse>(page, `/api/workspace/${resource}`, "POST", { clientMutationId: mutationId, payload, temporaryAssetIds: [] });

  const garmentA = await create("garments", garmentPayload(81001, "事务白衬衫"));
  const garmentB = await create("garments", garmentPayload(81002, "事务黑裤"));
  expect(garmentA.entity?.revision).toBe(1);
  const updatedGarment = await workspaceRequest<CommandResponse>(page, `/api/workspace/garments/${garmentA.entity!.id}`, "PUT", {
    clientMutationId: randomUUID(), expectedRevision: 1,
    payload: garmentPayload(81001, "事务白衬衫-已编辑"), temporaryAssetIds: [],
  });
  expect(updatedGarment.entity?.payload.name).toBe("事务白衬衫-已编辑");

  const outfit = await create("outfits", {
    legacyOutfitId: "outfit-transaction-e2e", name: "事务通勤套装", legacyItemIds: [81001, 81002], itemIds: [81001, 81002],
    source: "manual", favorite: false, wornDates: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const date = new Date().toISOString().slice(0, 10);
  await create("outfit-plans", {
    legacyPlanEntryId: "plan-transaction-e2e", date, outfitId: "outfit-transaction-e2e", status: "planned", isPrimary: true,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  const wearMutationId = randomUUID();
  const wearCommand = { clientMutationId: wearMutationId, expectedRevision: 1, wornAt: `${date}T12:00:00.000Z` };
  const worn = await workspaceRequest<CommandResponse>(page, `/api/workspace/outfits/${outfit.entity!.id}/mark-worn`, "POST", wearCommand);
  const duplicateRetry = await workspaceRequest<CommandResponse>(page, `/api/workspace/outfits/${outfit.entity!.id}/mark-worn`, "POST", wearCommand);
  expect(duplicateRetry).toEqual(worn);

  let overview = await getWorkspaceOverview(page);
  expect(overview.outfits.find((entry) => entry.id === outfit.entity!.id)?.payload.wornDates).toEqual([date]);
  expect(overview.garments.filter((entry) => [81001, 81002].includes(Number(entry.payload.legacyItemId))).every((entry) => (entry.payload.wornDates as string[]).includes(date))).toBe(true);
  expect(overview.outfitPlans.find((entry) => entry.payload.legacyPlanEntryId === "plan-transaction-e2e")?.payload.status).toBe("worn");
  expect(overview.wearEvents).toHaveLength(3);

  await workspaceRequest(page, `/api/workspace/outfits/${outfit.entity!.id}/cancel-worn`, "POST", {
    clientMutationId: randomUUID(), expectedRevision: worn.entity!.revision, date, payload: {},
  });
  overview = await getWorkspaceOverview(page);
  expect(overview.outfits.find((entry) => entry.id === outfit.entity!.id)?.payload.wornDates).toEqual([]);
  expect(overview.garments.filter((entry) => [81001, 81002].includes(Number(entry.payload.legacyItemId))).every((entry) => !(entry.payload.wornDates as string[]).includes(date))).toBe(true);
  expect(overview.outfitPlans.find((entry) => entry.payload.legacyPlanEntryId === "plan-transaction-e2e")?.payload.status).toBe("planned");
  expect(overview.wearEvents).toHaveLength(0);

  const wishlist = await create("wishlist", { ...garmentPayload(0, "事务种草外套"), status: "interested" });
  await workspaceRequest(page, `/api/workspace/wishlist/${wishlist.entity!.id}/convert`, "POST", {
    clientMutationId: randomUUID(), expectedRevision: 1, locationId: "home", payload: {},
  });
  overview = await getWorkspaceOverview(page);
  const convertedWishlist = overview.wishlistItems.find((entry) => entry.id === wishlist.entity!.id)!;
  expect(convertedWishlist.payload.convertedItemId).toEqual(expect.any(Number));
  expect(overview.garments.some((entry) => entry.payload.sourceWishlistId === wishlist.entity!.id && entry.payload.locationId === "home")).toBe(true);
  await workspaceRequest(page, `/api/workspace/wishlist/${wishlist.entity!.id}/undo-purchase`, "POST", {
    clientMutationId: randomUUID(), expectedRevision: convertedWishlist.revision, payload: {},
  });
  overview = await getWorkspaceOverview(page);
  expect(overview.wishlistItems.find((entry) => entry.id === wishlist.entity!.id)?.payload.convertedItemId).toBeNull();
  expect(overview.garments.some((entry) => entry.payload.sourceWishlistId === wishlist.entity!.id)).toBe(false);

  await workspaceRequest(page, `/api/workspace/garments/${garmentB.entity!.id}`, "DELETE", { clientMutationId: randomUUID(), expectedRevision: 3 });
  overview = await getWorkspaceOverview(page);
  expect(overview.garments.some((entry) => entry.id === garmentB.entity!.id)).toBe(false);
});

function garmentPayload(legacyItemId: number, name: string): Record<string, unknown> {
  return {
    legacyItemId, name, locationId: "home", status: "active", category: "tops", colors: { mode: "single", primary: "白" },
    seasons: [], styles: [], wornDates: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
