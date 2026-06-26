import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";
import {
  closeAccountWorkspaceDb,
  createAccountWorkspaceDb,
  type AccountWorkspaceDatabase,
} from "../src/lib/account-workspace-db";
import { getLegacyImportPreview, importLegacyDexieToWorkspace } from "../src/lib/cloud-sync/legacy-import";
import { getWardrobeDb } from "../src/lib/db";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import type { OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem, WishlistItem } from "../src/lib/types";

const LEGACY_DB_NAME = "wardrobe-outfit-pwa";

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
  await Dexie.delete(LEGACY_DB_NAME);
  const now = "2026-06-26T15:00:00.000Z";
  const userId = "00000000-0000-4000-8000-000000000008";
  const dbName = `wardrobe_account_b8_${Date.now()}`;
  await Dexie.delete(dbName);
  const workspaceDb = createAccountWorkspaceDb(dbName);
  await workspaceDb.open();

  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "test-b8",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now,
    lastOpenedAt: now,
    deviceId: "device-b8",
  };

  const legacyDb = getWardrobeDb();
  await seedLegacyWardrobe(legacyDb, now);
  const beforeCounts = await legacyCounts(legacyDb);

  const preview = await getLegacyImportPreview(workspace);
  check("preview 识别本机旧衣橱", preview.hasLegacyData);
  check("preview 未把旧衣橱标为已导入", !preview.imported);
  check("preview 统计结构化数据", preview.counts.garments === 2 && preview.counts.outfits === 1 && preview.counts.tripPlans === 1);

  const result = await importLegacyDexieToWorkspace({ workspace });
  check("import 返回 imported", result.status === "imported");
  await assertWorkspaceImported(workspaceDb);

  const afterCounts = await legacyCounts(legacyDb);
  check("导入不修改旧 Dexie 数据", JSON.stringify(afterCounts) === JSON.stringify(beforeCounts));

  const outboxAfterFirstImport = await workspaceDb.syncOutbox.count();
  const resultAgain = await importLegacyDexieToWorkspace({ workspace });
  check("重复导入按 migrationState 幂等跳过", resultAgain.status === "already_imported");
  check("重复导入不追加 outbox", await workspaceDb.syncOutbox.count() === outboxAfterFirstImport);

  const previewAfter = await getLegacyImportPreview(workspace);
  check("preview 标记当前账号已导入", previewAfter.imported && Boolean(previewAfter.completedAt));

  legacyDb.close();
  workspaceDb.close();
  closeAccountWorkspaceDb(dbName);
  await Dexie.delete(LEGACY_DB_NAME);
  await Dexie.delete(dbName);

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

async function seedLegacyWardrobe(db: ReturnType<typeof getWardrobeDb>, now: string) {
  const itemOne: WardrobeItem = {
    id: 1,
    name: "白衬衫",
    imageDataUrl: "data:image/png;base64,legacy-garment-1",
    sourceImageDataUrl: "data:image/png;base64,legacy-source-1",
    category: "tops",
    colors: { mode: "single", primary: "白色" },
    seasons: ["spring"],
    styles: ["commute"],
    formality: 4,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: ["2026-06-20"],
    createdAt: now,
    updatedAt: now,
  };
  const itemTwo: WardrobeItem = {
    id: 2,
    name: "黑长裤",
    imageDataUrl: "data:image/png;base64,legacy-garment-2",
    category: "pants",
    colors: { mode: "single", primary: "黑色" },
    seasons: ["autumn"],
    styles: ["commute"],
    formality: 4,
    warmth: 3,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
  const outfit: SavedOutfit = {
    id: "legacy-outfit-1",
    name: "通勤套装",
    itemIds: [1, 2],
    coverImageDataUrl: "data:image/png;base64,legacy-outfit-cover",
    source: "manual",
    favorite: true,
    wornDates: ["2026-06-21"],
    createdAt: now,
    updatedAt: now,
  };
  const wishlist: WishlistItem = {
    id: "wishlist-legacy-1",
    name: "棕色皮带",
    imageDataUrl: "data:image/png;base64,legacy-wishlist",
    category: "accessories",
    colors: { mode: "single", primary: "棕色" },
    seasons: ["all"],
    styles: ["casual"],
    status: "interested",
    createdAt: now,
    updatedAt: now,
  };
  const trip: OutfitCalendarPlan = {
    id: "legacy-trip-1",
    type: "travel",
    title: "上海周末",
    startDate: "2026-07-01",
    endDate: "2026-07-03",
    tone: "denim",
    packingEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
  const planEntry: OutfitPlanEntry = {
    id: "legacy-plan-entry-1",
    date: "2026-07-02",
    outfitId: outfit.id,
    calendarPlanId: trip.id,
    status: "planned",
    createdAt: now,
    updatedAt: now,
  };
  const checklist: PlanPackingChecklistItem = {
    id: "legacy-checklist-1",
    calendarPlanId: trip.id,
    source: "wardrobe",
    itemId: 1,
    label: "白衬衫",
    checked: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.items.bulkPut([itemOne, itemTwo]);
  await db.outfits.put(outfit);
  await db.wishlistItems.put(wishlist);
  await db.outfitCalendarPlans.put(trip);
  await db.outfitPlanEntries.put(planEntry);
  await db.planPackingChecklistItems.put(checklist);
}

async function assertWorkspaceImported(db: AccountWorkspaceDatabase) {
  const [garments, outfits, outfitItems, wishlistItems, tripPlans, outfitPlans, wearEvents, outbox, migrationState] = await Promise.all([
    db.garments.toArray(),
    db.outfits.toArray(),
    db.outfitItems.toArray(),
    db.wishlistItems.toArray(),
    db.tripPlans.toArray(),
    db.outfitPlans.toArray(),
    db.wearEvents.toArray(),
    db.syncOutbox.toArray(),
    db.migrationState.toArray(),
  ]);

  check("导入写入 garments", garments.length === 2 && garments.every((item) => typeof item.legacyItemId === "number"));
  check("garment payload 不含 DataURL", !JSON.stringify(garments[0]?.payload ?? {}).includes("data:image"));
  check("导入写入 outfit 与 outfitItems", outfits.length === 1 && outfitItems.length === 2);
  check("outfit payload 不含 DataURL", !JSON.stringify(outfits[0]?.payload ?? {}).includes("data:image"));
  check("导入写入 wishlistItems", wishlistItems.length === 1 && !JSON.stringify(wishlistItems[0]?.payload ?? {}).includes("data:image"));
  check("导入写入 tripPlan / outfitPlan", tripPlans.length === 1 && outfitPlans.length === 1);
  check("导入 wornDates 为 wearEvents", wearEvents.length === 2 && wearEvents.every((event) => event.wornAt.endsWith("T00:00:00.000Z")));
  check(
    "所有导入实体写入 Outbox",
    outbox.length === 10 && outbox.every((mutation) => mutation.status === "pending"),
    JSON.stringify(outbox.map((mutation) => `${mutation.entityType}:${mutation.operation}`)),
  );
  check("migrationState 记录完成状态", migrationState.length === 1 && migrationState[0].status === "completed" && Boolean(migrationState[0].completedAt));
}

async function legacyCounts(db: ReturnType<typeof getWardrobeDb>) {
  return {
    items: await db.items.count(),
    outfits: await db.outfits.count(),
    wishlistItems: await db.wishlistItems.count(),
    outfitCalendarPlans: await db.outfitCalendarPlans.count(),
    outfitPlanEntries: await db.outfitPlanEntries.count(),
    planPackingChecklistItems: await db.planPackingChecklistItems.count(),
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
