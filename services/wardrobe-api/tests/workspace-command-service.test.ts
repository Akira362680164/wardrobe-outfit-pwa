import { describe, expect, it } from "vitest";

import { removeGarmentReferences } from "../src/workspace/command-service.js";

const garmentId = "018f6f02-7b7a-7a20-8d1d-000000000401";
const otherGarmentId = "018f6f02-7b7a-7a20-8d1d-000000000402";
const legacyItemId = 401;
const deletedAt = "2026-07-11T08:00:00.000Z";

describe("garment reference cascade payload cleanup", () => {
  it("removes only the deleted garment from an outfit and preserves remaining items", () => {
    const result = removeGarmentReferences("outfits", {
      name: "通勤套装",
      itemIds: [legacyItemId, 402],
      legacyItemIds: [legacyItemId, 402],
      garmentIds: [garmentId, otherGarmentId],
      favorite: true,
    }, garmentId, legacyItemId, deletedAt);

    expect(result).toEqual({
      changed: true,
      deleteEntity: false,
      payload: {
        name: "通勤套装",
        itemIds: [402],
        legacyItemIds: [402],
        garmentIds: [otherGarmentId],
        favorite: true,
      },
    });
  });

  it("clears direct outfit-plan references while preserving its schedule data", () => {
    const result = removeGarmentReferences("outfit-plans", {
      date: "2026-07-11",
      garmentId,
      itemIds: [legacyItemId, 402],
      status: "planned",
    }, garmentId, legacyItemId, deletedAt);

    expect(result.payload).toEqual({
      date: "2026-07-11",
      garmentId: null,
      itemIds: [402],
      status: "planned",
    });
    expect(result.changed).toBe(true);
    expect(result.deleteEntity).toBe(false);
  });

  it("preserves recommendation UUIDs and snapshots and marks the accepted plan blocked", () => {
    const snapshot = { garmentId, name: "白衬衫", role: "tops", category: "tops" };
    const result = removeGarmentReferences("outfit-plans", {
      sourceType: "daily_recommendation", date: "2026-07-20", garmentIds: [garmentId, otherGarmentId], itemIds: [legacyItemId, 402],
      garmentSnapshots: [snapshot], status: "planned",
    }, garmentId, legacyItemId, deletedAt);
    expect(result.payload).toMatchObject({ garmentIds: [garmentId, otherGarmentId], itemIds: [legacyItemId, 402], garmentSnapshots: [snapshot], unavailableGarmentIds: [garmentId], availability: "blocked", unavailableSince: deletedAt });
  });

  it("preserves purchased wishlist history without retaining converted garment identifiers", () => {
    const result = removeGarmentReferences("wishlist", {
      name: "已买上衣",
      purchased: true,
      convertedGarmentId: garmentId,
      convertedItemId: legacyItemId,
      convertedAt: "2026-07-10T08:00:00.000Z",
    }, garmentId, legacyItemId, deletedAt);

    expect(result.payload).toEqual({
      name: "已买上衣",
      purchased: true,
      convertedGarmentId: null,
      convertedItemId: null,
      convertedAt: null,
      convertedItemDeletedAt: deletedAt,
    });
  });

  it("soft-deletes matching wear events and leaves unrelated events unchanged", () => {
    expect(removeGarmentReferences("wear-events", {
      garmentId,
      sourceOutfitId: "outfit-1",
      wornAt: "2026-07-11T12:00:00.000Z",
    }, garmentId, legacyItemId, deletedAt)).toMatchObject({ changed: true, deleteEntity: true });

    expect(removeGarmentReferences("wear-events", {
      garmentId: otherGarmentId,
      wornAt: "2026-07-11T12:00:00.000Z",
    }, garmentId, legacyItemId, deletedAt)).toMatchObject({ changed: false, deleteEntity: false });
  });

  it("does not mutate or revise an entity with no deleted-garment reference", () => {
    const payload = { itemIds: [402], convertedGarmentId: otherGarmentId };
    const result = removeGarmentReferences("outfits", payload, garmentId, legacyItemId, deletedAt);
    expect(result).toEqual({ changed: false, deleteEntity: false, payload });
  });
});
