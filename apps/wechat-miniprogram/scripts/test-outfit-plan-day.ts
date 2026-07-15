import assert from "node:assert/strict";
import { buildOutfitPlanDayCard } from "../utils/outfit-plan-day";
import type { MiniOutfitPlanEntry } from "../services/workspace";

const base: MiniOutfitPlanEntry = {
  id: "plan", revision: 1, date: "2026-07-16", outfitId: "", sourceType: "daily_recommendation", garmentIds: ["garment-a"], itemIds: [],
  garmentSnapshots: [{ garmentId: "garment-a", name: "白衬衫", role: "tops", imageAssetId: "asset-a" }], actualGarmentIds: [], actualGarmentSnapshots: [], unavailableGarmentIds: [], availability: "available",
  actualOutfitId: "", calendarPlanId: "", status: "planned", title: "", scene: "", weatherNote: "", notes: "", isPrimary: true, isPrimaryActual: false, role: "primary", sortOrder: 0, rawPayload: {}, createdAt: "2026-07-15T00:00:00Z", updatedAt: "2026-07-15T00:00:00Z",
};
const normal = buildOutfitPlanDayCard({ dateKey: base.date, todayKey: "2026-07-15", plans: [], entries: [base], outfits: [] });
assert.equal(normal.primary?.name, "白衬衫");
assert.equal(normal.empty, null);
const blocked = buildOutfitPlanDayCard({ dateKey: base.date, todayKey: "2026-07-15", plans: [], entries: [{ ...base, availability: "blocked", unavailableGarmentIds: ["garment-a"] }], outfits: [] });
assert.equal(blocked.primary?.meta, "部分衣物当前不可用，请替换后再穿");
const historical = buildOutfitPlanDayCard({ dateKey: "2026-07-14", todayKey: "2026-07-15", plans: [], entries: [{ ...base, date: "2026-07-14", availability: "blocked", unavailableGarmentIds: ["garment-a"] }], outfits: [] });
assert.equal(historical.primary?.name, "白衬衫");
const worn = buildOutfitPlanDayCard({ dateKey: "2026-07-15", todayKey: "2026-07-15", plans: [], entries: [{ ...base, date: "2026-07-15", status: "worn", actualGarmentIds: ["garment-a"], actualGarmentSnapshots: [{ garmentId: "garment-a", name: "当时白衬衫" }] }], outfits: [] });
assert.equal(worn.primary?.name, "当时白衬衫");
assert.equal(worn.actions[0]?.key, "delete_worn");
console.log("wechat outfit plan day component state: 5 assertions passed");
