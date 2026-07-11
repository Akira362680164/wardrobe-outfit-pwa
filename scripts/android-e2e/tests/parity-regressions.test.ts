import assert from "node:assert/strict";
import test from "node:test";
import { PARITY_OUTFIT_DEFECTS, assertCancelWornRestored, assertPlanAbsent, parityRegressionCases } from "../suites/parity-regressions";
import type { WorkspaceOverview } from "../suites/types";

test("exports one isolated regression case for every STATIC-OUTFITS P0", () => {
  const cases = parityRegressionCases();
  assert.deepEqual(cases.map((entry) => entry.id), PARITY_OUTFIT_DEFECTS.map((id) => `parity:${id}`));
  assert.equal(new Set(cases.map((entry) => entry.id)).size, 4);
});

test("plan absence assertion rejects a remaining server entity", () => {
  const base = { garments: [], outfits: [], wishlistItems: [], locations: [], outfitPlans: [], wearEvents: [] };
  assert.doesNotThrow(() => assertPlanAbsent({ ...base, tripPlans: [] }, "trip-1"));
  assert.throws(() => assertPlanAbsent({ ...base, tripPlans: [{ id: "trip-1", revision: 1, payload: {} }] }, "trip-1"));
});

test("cancel-worn assertion requires planned status, no date and no wear event", () => {
  const restored: WorkspaceOverview = {
    garments: [], wishlistItems: [], locations: [], tripPlans: [],
    outfits: [{ id: "outfit", revision: 2, payload: { wornDates: [] } }],
    outfitPlans: [{ id: "plan", revision: 2, payload: { status: "planned" } }], wearEvents: [],
  };
  assert.doesNotThrow(() => assertCancelWornRestored(restored, "outfit", "plan", "2026-07-11"));
  assert.throws(() => assertCancelWornRestored({ ...restored, wearEvents: [{ id: "wear", revision: 1, payload: { date: "2026-07-11" } }] }, "outfit", "plan", "2026-07-11"));
});
