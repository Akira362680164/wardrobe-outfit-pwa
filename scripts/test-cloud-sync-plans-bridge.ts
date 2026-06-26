import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";
import { createAccountWorkspaceDb, createWorkspaceUuidV7 } from "../src/lib/account-workspace-db";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import {
  deleteOutfitPlan,
  deleteTripPlan,
  deleteWearEvent,
  writeOutfitPlan,
  writeTripPlan,
  writeWearEvent,
} from "../src/lib/cloud-sync/sync-engine";
import { toCloudOutfitPlanPayload, toCloudTripPlanPayload } from "../src/lib/cloud-sync/plan-bridge";
import type { OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem } from "../src/lib/types";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function main() {
  const now = "2026-06-26T14:00:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000003";
  const dbName = `wardrobe_account_b5d_${Date.now()}`;
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "test",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now,
    lastOpenedAt: now,
    deviceId: "device-b5d",
  };

  const tripPlan: OutfitCalendarPlan = {
    id: "calendar-plan-local-1",
    type: "travel",
    title: "上海周末",
    startDate: "2026-07-01",
    endDate: "2026-07-03",
    tone: "clay",
    packingEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
  const checklist: PlanPackingChecklistItem = {
    id: "packing-1",
    calendarPlanId: tripPlan.id,
    source: "manual",
    label: "充电器",
    checked: false,
    createdAt: now,
    updatedAt: now,
  };
  const tripPayload = toCloudTripPlanPayload(tripPlan, [checklist]);
  check("tripPlan payload 保留旧计划 id", tripPayload["legacyCalendarPlanId"] === tripPlan.id);
  check("tripPlan payload 携带打包清单", Array.isArray(tripPayload["packingChecklistItems"]));

  const tripId = createWorkspaceUuidV7(new Date("2026-06-26T14:00:01.000Z"));
  const createdTrip = await writeTripPlan(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { startDate: tripPlan.startDate, endDate: tripPlan.endDate, payload: tripPayload } },
    { id: tripId, legacyCalendarPlanId: tripPlan.id, title: tripPlan.title, startDate: tripPlan.startDate, endDate: tripPlan.endDate, payload: tripPayload },
    "create",
  );
  check("writeTripPlan 写入 tripPlans", (await db.tripPlans.get(tripId))?.legacyCalendarPlanId === tripPlan.id);

  const outfitEntry: OutfitPlanEntry = {
    id: "plan-entry-local-1",
    date: "2026-07-02",
    calendarPlanId: tripPlan.id,
    outfitId: "outfit-local-1",
    status: "planned",
    createdAt: now,
    updatedAt: now,
  };
  const outfitPlanPayload = toCloudOutfitPlanPayload(outfitEntry);
  check("outfitPlan payload 保留旧 entry id", outfitPlanPayload["legacyPlanEntryId"] === outfitEntry.id);

  const outfitPlanId = createWorkspaceUuidV7(new Date("2026-06-26T14:00:02.000Z"));
  const createdOutfitPlan = await writeOutfitPlan(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { tripPlanId: tripId, planDate: outfitEntry.date, payload: outfitPlanPayload } },
    { id: outfitPlanId, legacyPlanEntryId: outfitEntry.id, tripPlanId: tripId, date: outfitEntry.date, payload: outfitPlanPayload },
    "create",
  );
  check("writeOutfitPlan 写入 outfitPlans", (await db.outfitPlans.get(outfitPlanId))?.legacyPlanEntryId === outfitEntry.id);

  const wearEventId = createWorkspaceUuidV7(new Date("2026-06-26T14:00:03.000Z"));
  const createdWearEvent = await writeWearEvent(
    db,
    { workspace, originDeviceId: workspace.deviceId, baseRevision: 0, payload: { wornAt: "2026-07-02T00:00:00.000Z", payload: { legacyWearEventKey: "outfit:outfit-local-1:2026-07-02" } } },
    { id: wearEventId, legacyWearEventKey: "outfit:outfit-local-1:2026-07-02", wornAt: "2026-07-02T00:00:00.000Z", payload: { legacyWearEventKey: "outfit:outfit-local-1:2026-07-02" } },
    "create",
  );
  check("writeWearEvent 写入 wearEvents", (await db.wearEvents.get(wearEventId))?.legacyWearEventKey === "outfit:outfit-local-1:2026-07-02");

  await deleteWearEvent(db, { workspace, originDeviceId: workspace.deviceId, baseRevision: createdWearEvent.revision, payload: {} }, createdWearEvent);
  await deleteOutfitPlan(db, { workspace, originDeviceId: workspace.deviceId, baseRevision: createdOutfitPlan.revision, payload: {} }, createdOutfitPlan);
  await deleteTripPlan(db, { workspace, originDeviceId: workspace.deviceId, baseRevision: createdTrip.revision, payload: {} }, createdTrip);
  const outbox = await db.syncOutbox.toArray();
  check("B5d 三类实体均入队 create/delete", outbox.length === 6);
  check("outfitPlan outbox 使用 planDate", Boolean((outbox.find((m) => m.entityType === "outfitPlan" && m.operation === "create")?.payload as Record<string, unknown>)?.["planDate"]));
  check("wearEvent outbox 使用 wornAt", Boolean((outbox.find((m) => m.entityType === "wearEvent" && m.operation === "create")?.payload as Record<string, unknown>)?.["wornAt"]));

  db.close();
  await Dexie.delete(dbName);

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
