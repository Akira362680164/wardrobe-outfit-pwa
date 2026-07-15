import assert from "node:assert/strict";
import { isSnapshotRecommendationPlan, recommendationPlanAvailabilityMessage, recommendationPlanSnapshotNames } from "../src/lib/recommendation-plan-presentation";
import type { OutfitPlanEntry } from "../src/lib/types";

const entry = {
  id: "plan", date: "2026-07-16", sourceType: "daily_recommendation", garmentIds: ["garment-a"], itemIds: [],
  garmentSnapshots: [{ garmentId: "garment-a", name: "白衬衫", role: "tops", category: "tops", imageAssetId: "asset-a" }],
  unavailableGarmentIds: [], availability: "available", status: "planned", createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-15T00:00:00Z",
} satisfies OutfitPlanEntry;
assert.equal(isSnapshotRecommendationPlan(entry), true);
assert.deepEqual(recommendationPlanSnapshotNames(entry), ["白衬衫"]);
assert.equal(recommendationPlanAvailabilityMessage({ ...entry, availability: "blocked" }, "2026-07-15"), "部分衣物当前不可用，请替换后再穿");
assert.equal(recommendationPlanAvailabilityMessage({ ...entry, date: "2026-07-14", availability: "blocked" }, "2026-07-15"), null);
assert.deepEqual(recommendationPlanSnapshotNames({ ...entry, status: "worn", actualGarmentSnapshots: [{ garmentId: "garment-a", name: "当时白衬衫", role: "tops", category: "tops" }] }), ["当时白衬衫"]);
console.log("app recommendation plan presentation: 5 assertions passed");
