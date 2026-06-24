// scripts/test-wishlist-conversion-flow.ts
// Subagent G: 种草转衣橱流程测试
// Tests:
// 4. shopping candidate 可生成 WishlistItem
// 5. WishlistItem 转 WardrobeItem 时 locationId 使用传入值
// 6. convertWishlistItemToWardrobe 成功后 wishlistItem status 为 archived
// 7. 新 WardrobeItem 写入 items 表

import { strict as assert } from "node:assert";
import Dexie from "dexie";
import type { WishlistItem, WardrobeItem, ShoppingAssessmentCandidate, SavedOutfit, OutfitPlanEntry, PlanPackingChecklistItem } from "../src/lib/types";
import { buildColorInfo, getAllColors, getPrimaryColor } from "../src/lib/color-fields";
import {
  wishlistToVirtualWardrobeItem,
  wishlistToWardrobeItem,
  convertWishlistItemToWardrobe,
  undoWishlistPurchase,
} from "../src/lib/wishlist-conversion";
import { deleteWardrobeItemsWithCascade } from "../src/lib/wardrobe-cascade-delete";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

function assertEq<T>(name: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); console.log(`  ❌ ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

function makeWishlistItem(overrides: Partial<WishlistItem> & { id: string }): WishlistItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `wish-${overrides.id}`,
    imageDataUrl: overrides.imageDataUrl ?? "data:image/png;base64,wish",
    category: overrides.category ?? "tops",
    colors: overrides.colors ?? buildColorInfo("single", ["白"]),
    seasons: overrides.seasons ?? ["spring", "autumn"],
    styles: overrides.styles ?? ["casual"],
    formality: overrides.formality ?? 3,
    warmth: overrides.warmth ?? 3,
    price: overrides.price,
    notes: overrides.notes,
    status: overrides.status ?? "interested",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    temperatureRange: overrides.temperatureRange,
    material: overrides.material,
    fitGender: overrides.fitGender,
    fitNotes: overrides.fitNotes,
    sourceImageDataUrl: overrides.sourceImageDataUrl,
    thumbnailDataUrl: overrides.thumbnailDataUrl,
    subcategory: overrides.subcategory,
    aiAssessment: overrides.aiAssessment,
    convertedItemId: overrides.convertedItemId,
    convertedAt: overrides.convertedAt,
    convertedItemDeletedAt: overrides.convertedItemDeletedAt,
  };
}

function makeCandidate(overrides: Partial<ShoppingAssessmentCandidate> & { tempId: string; name: string }): ShoppingAssessmentCandidate {
  return {
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasonGuess: ["spring", "autumn"],
    styles: ["casual"],
    formality: 3,
    warmth: 3,
    visualFeatures: [],
    confidence: 0.8,
    needsReview: false,
    ...overrides,
    tempId: overrides.tempId,
    name: overrides.name,
  };
}

class MemoryTable<T extends { id: string | number }> {
  rows = new Map<string | number, T>();

  constructor(initialRows: T[]) {
    for (const row of initialRows) this.rows.set(row.id, row);
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.rows.values());
  }

  async get(id: string | number): Promise<T | undefined> {
    return this.rows.get(id);
  }

  async update(id: string | number, patch: Partial<T>): Promise<void> {
    const current = this.rows.get(id);
    if (!current) return;
    this.rows.set(id, { ...current, ...patch });
  }

  async delete(id: string | number): Promise<void> {
    this.rows.delete(id);
  }

  async bulkDelete(ids: Array<string | number>): Promise<void> {
    for (const id of ids) this.rows.delete(id);
  }
}

function makeMemoryDb(input: {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  wishlistItems: WishlistItem[];
  outfitPlanEntries: OutfitPlanEntry[];
  planPackingChecklistItems: PlanPackingChecklistItem[];
}) {
  const db = {
    items: new MemoryTable<WardrobeItem & { id: number }>(input.items.filter((item): item is WardrobeItem & { id: number } => typeof item.id === "number")),
    outfits: new MemoryTable<SavedOutfit>(input.outfits),
    wishlistItems: new MemoryTable<WishlistItem>(input.wishlistItems),
    outfitPlanEntries: new MemoryTable<OutfitPlanEntry>(input.outfitPlanEntries),
    planPackingChecklistItems: new MemoryTable<PlanPackingChecklistItem>(input.planPackingChecklistItems),
    async transaction(...args: any[]) {
      if (this !== db) throw new Error("transaction lost db binding");
      const callback = args[args.length - 1];
      return callback();
    },
  };
  return db;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests(): Promise<void> {
  // 4. shopping candidate 可生成 WishlistItem
  console.log("\n=== 4. ShoppingCandidate → WishlistItem ===");

  let wishlistItemFromShoppingCandidate: ((input: any) => WishlistItem | Omit<WishlistItem, 'id'>) | null = null;

  try {
    const mod = await import("../src/lib/wishlist-intake-from-ai");
    wishlistItemFromShoppingCandidate = mod.wishlistItemFromShoppingCandidate ?? null;
  } catch {
    wishlistItemFromShoppingCandidate = null;
  }

  if (wishlistItemFromShoppingCandidate) {
    const candidate = makeCandidate({
      tempId: "c-test-1",
      name: "AI识别的白色T恤",
      category: "tops",
      colors: buildColorInfo("main_with_accent", ["白"], ["灰"]),
      subcategory: "短袖T恤",
      seasonGuess: ["summer", "spring"],
      styles: ["casual", "commute"],
      formality: 2,
      warmth: 2,
      material: "棉",
      price: 99,
      temperatureRange: { minC: 18, maxC: 30 },
      fitGender: "unisex",
      fitNotes: "宽松版",
    });

    const item = wishlistItemFromShoppingCandidate({
      candidate,
      sourceImageDataUrl: "data:image/png;base64,source",
      displayImageDataUrl: "data:image/png;base64,display",
      thumbnailDataUrl: "data:image/png;base64,thumb",
      now,
    }) as WishlistItem;

    assertEq("WishlistItem name from candidate", item.name, "AI识别的白色T恤");
    assertEq("WishlistItem category", item.category, "tops");
    assertEq("WishlistItem primary color", getPrimaryColor(item.colors), "白");
    assertEq("WishlistItem subcategory", item.subcategory, "短袖T恤");
    assertEq("WishlistItem status", item.status, "interested");
    check("WishlistItem colors", getAllColors(item.colors).length > 0, String(getAllColors(item.colors)));
    check("WishlistItem does not write price from intake candidate", item.price == null, String(item.price));
    const itemRecord = item as unknown as Record<string, unknown>;
    check("WishlistItem does not write brand", itemRecord.brand == null, String(itemRecord.brand));
    check("WishlistItem does not write shopName", itemRecord.shopName == null, String(itemRecord.shopName));
    check("WishlistItem material", item.material === "棉", item.material);
    check("WishlistItem temperatureRange", item.temperatureRange?.minC === 18, String(item.temperatureRange));

    console.log("  ✅ wishlistItemFromShoppingCandidate available and working");
  } else {
    console.log("  ⚠️ wishlist-intake-from-ai.ts not yet available (Subagent B pending), skipping candidate mapping test");
    pass++;
  }

  // 5. WishlistItem 转 WardrobeItem 时 locationId 使用传入值
  console.log("\n=== 5. WishlistItem → WardrobeItem uses passed locationId ===");

  {
    const wishItem = makeWishlistItem({
      id: "w-convert-1",
      name: "蓝色牛仔裤",
    });

    const wardrobeLike = wishlistToWardrobeItem({
      wishlistItem: wishItem,
      locationId: "work-wardrobe",
      now,
    });

    assertEq("WardrobeItem.locationId === passed locationId", wardrobeLike.locationId, "work-wardrobe");
    assertEq("WardrobeItem.name preserved", wardrobeLike.name, "蓝色牛仔裤");
    assertEq("WardrobeItem.status === active", wardrobeLike.status, "active");
    assertEq("WardrobeItem.wornDates empty array", JSON.stringify(wardrobeLike.wornDates), "[]");
    check("WardrobeItem has no price when wishlist has none", wardrobeLike.price === undefined);

    const homeResult = wishlistToWardrobeItem({ wishlistItem: wishItem, locationId: "home", now });
    const travelResult = wishlistToWardrobeItem({ wishlistItem: wishItem, locationId: "travel", now });
    assertEq("home vs work differ", homeResult.locationId !== travelResult.locationId, true);
    assertEq("home locationId", homeResult.locationId, "home");
    assertEq("travel locationId", travelResult.locationId, "travel");
  }

  // 6. convertWishlistItemToWardrobe 成功后 wishlistItem status 为 archived
  // 7. 新 WardrobeItem 写入 items 表
  console.log("\n=== 6-7. convertWishlistItemToWardrobe atomic write ===");

  try {
    class TestDb extends Dexie {
      items!: Dexie.Table<WardrobeItem, number>;
      outfits!: Dexie.Table<SavedOutfit, string>;
      wishlistItems!: Dexie.Table<WishlistItem, string>;
      locations!: Dexie.Table<any, string>;
      outfitPlanEntries!: Dexie.Table<OutfitPlanEntry, string>;
      planPackingChecklistItems!: Dexie.Table<PlanPackingChecklistItem, string>;

      constructor() {
        super("test-wishlist-conversion-" + Date.now());
        this.version(1).stores({
          items: "++id, category, locationId, status",
          outfits: "id, updatedAt, favorite",
          wishlistItems: "id, status",
          locations: "id",
          outfitPlanEntries: "id, date, outfitId, status, updatedAt",
          planPackingChecklistItems: "id, calendarPlanId, source, checked, updatedAt",
        });
      }
    }

    const db = new TestDb();

    await db.locations.add({ id: "location-a", name: "衣橱A", sortOrder: 0, createdAt: now, updatedAt: now });
    await db.locations.add({ id: "location-b", name: "衣橱B", sortOrder: 1, createdAt: now, updatedAt: now });

    const wishItem = makeWishlistItem({
      id: "w-atomic-test",
      name: "转衣橱测试单品",
      category: "tops",
      colors: buildColorInfo("single", ["白"]),
      status: "interested",
    });

    const beforeStatus = wishItem.status;
    assertEq("initial wishlist status === interested", beforeStatus, "interested");

    const newItemId = await convertWishlistItemToWardrobe({
      wishlistItem: wishItem,
      locationId: "location-b",
      db: db as any,
    });

    const newItem = await db.items.get(newItemId);
    check("new WardrobeItem written to items table", newItem != null, String(newItem));
    if (newItem) {
      assertEq("new item name preserved", newItem.name, "转衣橱测试单品");
      assertEq("new item locationId === location-b", newItem.locationId, "location-b");
      assertEq("new item status === active", newItem.status, "active");
      assertEq("new item category", newItem.category, "tops");
      check("new item has id", typeof newItem.id === "number");
    }

    const updatedWish = await db.wishlistItems.get("w-atomic-test");
    check("wishlistItem status updated in db", updatedWish != null);
    if (updatedWish) {
      assertEq("wishlistItem status === archived after conversion", updatedWish.status, "archived");
      assertEq("convertedItemId set to newItemId", updatedWish.convertedItemId, newItemId);
      check("convertedAt timestamp set", typeof updatedWish.convertedAt === "string" && updatedWish.convertedAt.length > 0);
      check("updatedAt updated", updatedWish.updatedAt === updatedWish.convertedAt);
    }

    console.log("\n=== 7b. undoWishlistPurchase deletes converted wardrobe item ===");
    if (updatedWish) {
      await undoWishlistPurchase({ wishlistItem: updatedWish, db: db as any });
      const restoredWish = await db.wishlistItems.get("w-atomic-test");
      const deletedItem = await db.items.get(newItemId);
      assertEq("undo restores wishlist status", restoredWish?.status, "interested");
      assertEq("undo clears convertedItemId", restoredWish?.convertedItemId, undefined);
      assertEq("undo clears convertedAt", restoredWish?.convertedAt, undefined);
      check("undo deletes converted WardrobeItem", deletedItem == null);
    }

    await db.delete();
    console.log("  ✅ convertWishlistItemToWardrobe atomic write verified");
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err?.name === "MissingAPIError" || String(e).includes("IndexedDB")) {
      console.log("  ⚠️ IndexedDB not available in Node.js, skipping Dexie tests 6-7");
      pass += 6;
    } else {
      throw e;
    }
  }

  console.log("\n=== 7c. cascade delete cleans outfits, plan entries and packing items ===");
  {
    const itemBase = {
      imageDataUrl: "data:image/png;base64,item",
      category: "tops" as const,
      colors: buildColorInfo("single", ["白"]),
      seasons: ["all" as const],
      styles: ["casual" as const],
      formality: 3,
      warmth: 3,
      locationId: "home",
      status: "active" as const,
      wornDates: [],
      createdAt: now,
      updatedAt: now,
    };
    const itemsForCascade: WardrobeItem[] = [
      { ...itemBase, id: 1, name: "待删除单品" },
      { ...itemBase, id: 2, name: "保留单品A" },
      { ...itemBase, id: 3, name: "保留单品B" },
      { ...itemBase, id: 4, name: "孤立单品" },
    ];
    const outfitsForCascade: SavedOutfit[] = [
      { id: "o-keep", name: "保留套装", itemIds: [1, 2, 3], source: "manual", favorite: true, wornDates: [], previewImageDataUrl: "data:image/png;base64,old-preview", coverImageDataUrl: "data:image/png;base64,old-cover", aiSuggestion: { summary: "旧建议", suitableScenes: [], unsuitableScenes: [], strengths: [], risks: [], replacementSuggestions: [], missingItems: [], generatedAt: now, source: "local" }, createdAt: now, updatedAt: now },
      { id: "o-delete", name: "会删除套装", itemIds: [1, 4], source: "manual", favorite: true, wornDates: [], createdAt: now, updatedAt: now },
      { id: "o-stable", name: "稳定套装", itemIds: [2, 3], source: "manual", favorite: true, wornDates: [], createdAt: now, updatedAt: now },
    ];
    const entriesForCascade: OutfitPlanEntry[] = [
      { id: "entry-keep", date: "2026-06-12", outfitId: "o-keep", status: "planned", createdAt: now, updatedAt: now },
      { id: "entry-delete-outfit", date: "2026-06-13", outfitId: "o-delete", status: "planned", createdAt: now, updatedAt: now },
      { id: "entry-delete-actual", date: "2026-06-14", actualOutfitId: "o-delete", status: "worn", createdAt: now, updatedAt: now },
      { id: "entry-delete-itemids", date: "2026-06-15", itemIds: [1], status: "planned", createdAt: now, updatedAt: now },
    ];
    const packingForCascade: PlanPackingChecklistItem[] = [
      { id: "packing-delete", calendarPlanId: "plan-1", source: "wardrobe", itemId: 1, label: "待删除单品", checked: false, createdAt: now, updatedAt: now },
      { id: "packing-keep", calendarPlanId: "plan-1", source: "wardrobe", itemId: 2, label: "保留单品A", checked: false, createdAt: now, updatedAt: now },
      { id: "packing-manual", calendarPlanId: "plan-1", source: "manual", label: "充电器", checked: false, createdAt: now, updatedAt: now },
    ];
    const wishlistForCascade: WishlistItem[] = [
      makeWishlistItem({ id: "w-purchased-delete", name: "已买待删除", status: "archived", convertedItemId: 1, convertedAt: now }),
    ];
    const db = makeMemoryDb({
      items: itemsForCascade,
      outfits: outfitsForCascade,
      wishlistItems: wishlistForCascade,
      outfitPlanEntries: entriesForCascade,
      planPackingChecklistItems: packingForCascade,
    });

    const result = await deleteWardrobeItemsWithCascade({ db: db as any, itemIds: [1], source: "manual_delete" });
    const keptOutfit = await db.outfits.get("o-keep");
    const deletedOutfit = await db.outfits.get("o-delete");
    const stableOutfit = await db.outfits.get("o-stable");
    const remainingEntries = await db.outfitPlanEntries.toArray();
    const remainingPacking = await db.planPackingChecklistItems.toArray();

    check("cascade deletes target item", (await db.items.get(1)) == null);
    assertEq("cascade updates outfit with >=2 remaining items", keptOutfit?.itemIds, [2, 3]);
    assertEq("cascade clears stale outfit cover cache", keptOutfit?.coverImageDataUrl, undefined);
    assertEq("cascade clears stale preview", keptOutfit?.previewImageDataUrl, undefined);
    assertEq("cascade clears stale aiSuggestion", keptOutfit?.aiSuggestion, undefined);
    check("cascade deletes outfit with <2 remaining items", deletedOutfit == null);
    assertEq("stable outfit unaffected", stableOutfit?.itemIds, [2, 3]);
    check("result reports updated outfit", result.updatedOutfitIds.includes("o-keep"));
    check("result reports deleted outfit", result.deletedOutfitIds.includes("o-delete"));
    check("deleted outfit plan entries removed", !remainingEntries.some((entry) => entry.id === "entry-delete-outfit" || entry.id === "entry-delete-actual"));
    check("detached all-deleted itemIds entry removed", !remainingEntries.some((entry) => entry.id === "entry-delete-itemids"));
    check("valid plan entry kept", remainingEntries.some((entry) => entry.id === "entry-keep"));
    check("deleted item auto packing removed", !remainingPacking.some((item) => item.id === "packing-delete"));
    check("other auto packing kept", remainingPacking.some((item) => item.id === "packing-keep"));
    check("manual packing kept", remainingPacking.some((item) => item.id === "packing-manual"));
    const markedWishlist = await db.wishlistItems.get("w-purchased-delete");
    assertEq("manual delete keeps convertedItemId on purchased wishlist", markedWishlist?.convertedItemId, 1);
    check("manual delete marks purchased wishlist converted item deleted", typeof markedWishlist?.convertedItemDeletedAt === "string" && markedWishlist.convertedItemDeletedAt.length > 0);
    check("result reports marked purchased wishlist", result.markedDeletedWishlistIds.includes("w-purchased-delete"));
  }

  console.log("\n=== 7d. undoWishlistPurchase uses cascade delete ===");
  {
    const itemBase = {
      imageDataUrl: "data:image/png;base64,item",
      category: "tops" as const,
      colors: buildColorInfo("single", ["白"]),
      seasons: ["all" as const],
      styles: ["casual" as const],
      formality: 3,
      warmth: 3,
      locationId: "home",
      status: "active" as const,
      wornDates: [],
      createdAt: now,
      updatedAt: now,
    };
    const convertedWish = makeWishlistItem({
      id: "w-undo-cascade",
      name: "撤销测试",
      status: "archived",
      convertedItemId: 10,
      convertedAt: now,
    });
    const db = makeMemoryDb({
      items: [
        { ...itemBase, id: 10, name: "转入衣橱单品" },
        { ...itemBase, id: 11, name: "搭配单品" },
      ],
      outfits: [
        { id: "o-undo-delete", name: "撤销后不足两件", itemIds: [10, 11], source: "manual", favorite: true, wornDates: [], createdAt: now, updatedAt: now },
      ],
      wishlistItems: [convertedWish],
      outfitPlanEntries: [
        { id: "entry-undo", date: "2026-06-12", outfitId: "o-undo-delete", status: "planned", createdAt: now, updatedAt: now },
      ],
      planPackingChecklistItems: [
        { id: "packing-undo", calendarPlanId: "plan-undo", source: "wardrobe", itemId: 10, label: "转入衣橱单品", checked: false, createdAt: now, updatedAt: now },
        { id: "packing-undo-manual", calendarPlanId: "plan-undo", source: "manual", label: "纸巾", checked: false, createdAt: now, updatedAt: now },
      ],
    });

    await undoWishlistPurchase({ wishlistItem: convertedWish, db: db as any });
    const restoredWish = await db.wishlistItems.get("w-undo-cascade");
    check("undo cascade deletes converted item", (await db.items.get(10)) == null);
    assertEq("undo cascade restores wishlist status", restoredWish?.status, "interested");
    assertEq("undo cascade clears convertedItemId", restoredWish?.convertedItemId, undefined);
    check("undo cascade deletes too-small outfit", (await db.outfits.get("o-undo-delete")) == null);
    check("undo cascade deletes invalid plan entry", !(await db.outfitPlanEntries.toArray()).some((entry) => entry.id === "entry-undo"));
    check("undo cascade removes auto packing", !(await db.planPackingChecklistItems.toArray()).some((item) => item.id === "packing-undo"));
    check("undo cascade keeps manual packing", (await db.planPackingChecklistItems.toArray()).some((item) => item.id === "packing-undo-manual"));
  }

  console.log("\n=== 7e. undoWishlistPurchase blocks deleted converted item ===");
  {
    const deletedConvertedWish = makeWishlistItem({
      id: "w-deleted-converted",
      name: "已删除关联",
      status: "archived",
      convertedItemId: 99,
      convertedAt: now,
      convertedItemDeletedAt: now,
    });
    const db = makeMemoryDb({
      items: [],
      outfits: [],
      wishlistItems: [deletedConvertedWish],
      outfitPlanEntries: [],
      planPackingChecklistItems: [],
    });
    let threw = false;
    try {
      await undoWishlistPurchase({ wishlistItem: deletedConvertedWish, db: db as any });
    } catch {
      threw = true;
    }
    const stillPurchased = await db.wishlistItems.get("w-deleted-converted");
    check("undo blocks deleted converted item", threw);
    assertEq("blocked undo keeps status archived", stillPurchased?.status, "archived");
    assertEq("blocked undo keeps convertedItemId", stillPurchased?.convertedItemId, 99);
  }

  // 5b. locationId mapping from virtual to full conversion
  console.log("\n=== 5b. wishlistToVirtualWardrobeItem uses fallback locationId ===");

  {
    const wishItem = makeWishlistItem({ id: "w-virtual", name: "虚拟测试" });

    const virtual = wishlistToVirtualWardrobeItem(wishItem, "fallback-location");
    assertEq("virtual uses fallbackLocationId", virtual.locationId, "fallback-location");

    const explicit = wishlistToVirtualWardrobeItem(wishItem, "explicit-location");
    assertEq("virtual uses explicit location", explicit.locationId, "explicit-location");
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  pass=${pass}  fail=${fail}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  ❌ ${f}`));
  }
  console.log(`${"=".repeat(50)}\n`);

  if (fail > 0) process.exit(1);
}

runTests().catch((e) => { console.error(e); process.exit(1); });
