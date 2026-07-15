import assert from "node:assert/strict";
import {
  getBackupOutfitPlanEntries,
  getDisplayOutfitId,
  getOutfitPlanDateRelation,
  hasDuplicatePlannedOutfit,
  resolvePrimaryOutfitPlanEntry,
  getRecommendationPlanAvailabilityMessage,
  getRecommendationPlanSnapshotNames,
  isSnapshotRecommendationPlan,
} from "../utils/outfit-plan-state";
import type { MiniOutfitPlanEntry } from "../services/workspace";

function entry(overrides: Partial<MiniOutfitPlanEntry>): MiniOutfitPlanEntry {
  return {
    id: "entry",
    revision: 1,
    date: "2026-07-10",
    outfitId: "outfit-primary",
    sourceType: "saved_outfit",
    garmentIds: [],
    itemIds: [],
    garmentSnapshots: [],
    actualGarmentIds: [],
    actualGarmentSnapshots: [],
    unavailableGarmentIds: [],
    availability: "available",
    actualOutfitId: "",
    calendarPlanId: "",
    status: "planned",
    title: "主计划",
    scene: "",
    weatherNote: "",
    notes: "",
    isPrimary: false,
    isPrimaryActual: false,
    role: "other",
    sortOrder: 9999,
    rawPayload: {},
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

assert.equal(getOutfitPlanDateRelation("2026-07-09", "2026-07-10"), "past");
assert.equal(getOutfitPlanDateRelation("2026-07-10", "2026-07-10"), "today");
assert.equal(getOutfitPlanDateRelation("2026-07-11", "2026-07-10"), "future");

const primary = entry({ id: "primary", isPrimary: true, role: "primary", sortOrder: 1 });
const backup = entry({ id: "backup", outfitId: "outfit-backup", role: "backup", sortOrder: 2 });
const worn = entry({ id: "worn", status: "worn", outfitId: "outfit-primary", actualOutfitId: "outfit-actual", isPrimaryActual: true });

assert.equal(resolvePrimaryOutfitPlanEntry([backup, primary])?.id, "primary");
assert.equal(resolvePrimaryOutfitPlanEntry([backup, primary, worn])?.id, "worn");
assert.equal(getDisplayOutfitId(worn), "outfit-actual");
assert.deepEqual(getBackupOutfitPlanEntries([primary, backup, worn], worn).map((item) => item.id), ["backup"]);
assert.equal(hasDuplicatePlannedOutfit([primary, backup], "2026-07-10", "outfit-primary", "backup", primary), true);
assert.equal(hasDuplicatePlannedOutfit([primary, backup], "2026-07-10", "outfit-backup", "replace", primary), true);
assert.equal(hasDuplicatePlannedOutfit([primary, backup], "2026-07-10", "outfit-primary", "replace", primary), false);
assert.equal(hasDuplicatePlannedOutfit([primary, backup], "2026-07-10", "outfit-primary", "worn", primary), false);

const recommendation = entry({ outfitId: "", sourceType: "daily_recommendation", garmentIds: ["garment-a"], garmentSnapshots: [{ garmentId: "garment-a", name: "白衬衫", role: "tops", imageAssetId: "asset-a" }] });
assert.equal(isSnapshotRecommendationPlan(recommendation), true);
assert.deepEqual(getRecommendationPlanSnapshotNames(recommendation), ["白衬衫"]);
assert.equal(getRecommendationPlanAvailabilityMessage({ ...recommendation, availability: "blocked" }, "2026-07-10"), "部分衣物当前不可用，请替换后再穿");
assert.equal(getRecommendationPlanAvailabilityMessage({ ...recommendation, date: "2026-07-09", availability: "blocked" }, "2026-07-10"), "");
const wornRecommendation = { ...recommendation, status: "worn" as const, actualGarmentSnapshots: [{ garmentId: "garment-a", name: "当时白衬衫" }] };
assert.deepEqual(getRecommendationPlanSnapshotNames(wornRecommendation), ["当时白衬衫"]);

console.log("wechat outfit plan state: 16 assertions passed");
