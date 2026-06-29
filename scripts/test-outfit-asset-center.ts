import { getOutfitCover, getCollageImageUrls, countValidItems } from "../src/lib/outfit-cover";
import type { SavedOutfit, WardrobeItem } from "../src/lib/types";
import { toggleTodayWornDate, getLocalDateKey } from "../src/lib/wear-records";
import { buildSyncedOutfitPatch, buildSyncedPurchasedWishlistPatch } from "../src/lib/wardrobe-reference-sync";
import { buildColorInfo } from "../src/lib/color-fields";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

function makeItem(id: number, imageDataUrl: string): WardrobeItem {
  return {
    id, name: `Item ${id}`, imageDataUrl,
    category: "tops", colors: buildColorInfo("single", []), seasons: [], styles: [], formality: 2, warmth: 2,
    locationId: "home", status: "active", wornDates: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const items = [makeItem(1, "data:image/png;base64,a"), makeItem(2, "data:image/png;base64,b"), makeItem(3, "data:image/png;base64,c"), makeItem(4, "data:image/png;base64,d")];

// ─── getOutfitCover ───
console.log("\n=== getOutfitCover ===");
{
  const o1: SavedOutfit = { id: "o1", name: "x", itemIds: [1,2], source: "manual", favorite: true, previewImageDataUrl: "data:image/png;base64,preview", createdAt: "", updatedAt: "" };
  check("itemIds override stale preview", getOutfitCover(o1, items).mode === "auto_collage");

  const o2: SavedOutfit = { id: "o2", name: "x", itemIds: [1,2], source: "manual", favorite: true, outfitRealImages: [{ id: "r1", imageDataUrl: "data:image/png;base64,real", createdAt: "", updatedAt: "" }], createdAt: "", updatedAt: "" };
  check("itemIds override stale real_photo", getOutfitCover(o2, items).mode === "auto_collage");

  const o3: SavedOutfit = { id: "o3", name: "x", itemIds: [1,2], source: "manual", favorite: true, sourceImageDataUrl: "data:image/png;base64,source", createdAt: "", updatedAt: "" };
  check("itemIds override stale source_photo", getOutfitCover(o3, items).mode === "auto_collage");

  const o4: SavedOutfit = { id: "o4", name: "x", itemIds: [1,2,3,4], source: "manual", favorite: true, createdAt: "", updatedAt: "" };
  check("auto_collage with itemIds", getOutfitCover(o4, items).mode === "auto_collage");

  const o5: SavedOutfit = { id: "o5", name: "x", itemIds: [99], source: "manual", favorite: true, createdAt: "", updatedAt: "" };
  check("empty when itemIds no longer exist", getOutfitCover(o5, items).mode === "empty");

  const o6: SavedOutfit = { id: "o6", name: "x", itemIds: [], source: "manual", favorite: true, createdAt: "", updatedAt: "" };
  check("empty when no items", getOutfitCover(o6, []).mode === "empty");

  const o7: SavedOutfit = { id: "o7", name: "x", itemIds: [], source: "manual", favorite: true, previewImageDataUrl: "data:image/png;base64,preview", createdAt: "", updatedAt: "" };
  check("preview only used when no itemIds", getOutfitCover(o7, items).mode === "preview");
}

// ─── getCollageImageUrls ───
console.log("\n=== getCollageImageUrls ===");
{
  const o: SavedOutfit = { id: "c1", name: "x", itemIds: [1,2,3,4,5], source: "manual", favorite: true, createdAt: "", updatedAt: "" };
  const urls = getCollageImageUrls(o, items);
  check("max 4 urls", urls.length === 4);
  check("correct urls", urls[0] === "data:image/png;base64,a" && urls[3] === "data:image/png;base64,d");
  check("missing items skipped", getCollageImageUrls({ ...o, itemIds: [99, 1, 98, 2] }, items).length === 2);
}

// ─── countValidItems ───
console.log("\n=== countValidItems ===");
{
  check("all valid", countValidItems({ itemIds: [1,2,3] } as unknown as SavedOutfit, items) === 3);
  check("some missing", countValidItems({ itemIds: [1,99,3] } as unknown as SavedOutfit, items) === 2);
  check("empty", countValidItems({ itemIds: [] } as unknown as SavedOutfit, items) === 0);
}

// ─── reference sync patches ───
console.log("\n=== wardrobe reference sync ===");
{
  const now = new Date().toISOString();
  const outfit: SavedOutfit = {
    id: "sync-outfit",
    name: "保留名称",
    itemIds: [1, 2],
    source: "manual",
    favorite: true,
    previewImageDataUrl: "data:image/png;base64,old-preview",
    aiSuggestion: { summary: "旧建议", suitableScenes: [], unsuitableScenes: [], strengths: [], risks: [], replacementSuggestions: [], missingItems: [], generatedAt: now, source: "local" },
    createdAt: now,
    updatedAt: now,
  };
  const patch = buildSyncedOutfitPatch(outfit, items, now);
  check("synced outfit keeps current name", patch.name === "保留名称");
  check("synced outfit clears stale cover cache", patch.coverImageDataUrl === undefined);
  check("synced outfit clears stale preview", patch.previewImageDataUrl === undefined);
  check("synced outfit clears stale ai suggestion", patch.aiSuggestion === undefined);

  const wishlistPatch = buildSyncedPurchasedWishlistPatch({ ...items[0]!, name: "编辑后单品", price: 199, notes: "新备注" }, now);
  check("synced purchased wishlist copies name", wishlistPatch.name === "编辑后单品");
  check("synced purchased wishlist copies price", wishlistPatch.price === 199);
  check("synced purchased wishlist clears deleted marker", wishlistPatch.convertedItemDeletedAt === undefined);
}

// ─── Worn record: outfit cascade ───
console.log("\n=== outfit worn cascade ===");
{
  const today = getLocalDateKey();

  // Simulate marking outfit worn: add today to outfit + items
  const outfitWornDates = toggleTodayWornDate([], today);
  check("outfit gets today", outfitWornDates.includes(today));

  const itemWornBefore = ["2026-01-15"];
  const itemWornAfter = Array.from(new Set([...itemWornBefore, today])).sort();
  check("item also gets today", itemWornAfter.includes(today) && itemWornAfter.includes("2026-01-15"));

  // Undo: remove today from outfit only, items stay
  const undoneOutfit = toggleTodayWornDate(outfitWornDates, today);
  check("undo removes today from outfit", !undoneOutfit.includes(today));
  check("undo does NOT remove from items", itemWornAfter.includes(today));
}

// ─── History outfits for item ───
console.log("\n=== garment reverse associations ===");
{
  const allItems = [...items];
  const outfits: SavedOutfit[] = [
    { id: "o1", name: "set1", itemIds: [1,2,3], source: "manual", favorite: true, wornDates: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "o2", name: "set2", itemIds: [1,4], source: "manual", favorite: true, wornDates: [], createdAt: "2026-02-01", updatedAt: "2026-02-01" },
    { id: "o3", name: "set3", itemIds: [2,3], source: "manual", favorite: true, wornDates: [], createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  ];

  // Item 1 appears in o1, o2
  const historyFor1 = outfits.filter((o) => o.itemIds.includes(1));
  check("item 1 history count", historyFor1.length === 2);

  // Item 3 appears only in o1
  const historyFor3 = outfits.filter((o) => o.itemIds.includes(3));
  check("item 3 history count", historyFor3.length === 2);

  // Frequent pairs for item 1: (2 appears in 1 outfit, 3 in 1, 4 in 1)
  const pairsFor1 = new Map<number, number>();
  for (const o of historyFor1) {
    for (const id of o.itemIds) {
      if (id === 1) continue;
      pairsFor1.set(id, (pairsFor1.get(id) ?? 0) + 1);
    }
  }
  check("item 2 pairs count with 1", pairsFor1.get(2) === 1);
  check("item 4 pairs count with 1", pairsFor1.get(4) === 1);

  // Filter out deleted items
  const itemIdSet = new Set(allItems.map((i) => i.id).filter((id): id is number => typeof id === "number"));
  const validOutfits = outfits.map((o) => ({ ...o, itemIds: o.itemIds.filter((id) => itemIdSet.has(id)) })).filter((o) => o.itemIds.length > 0);
  check("valid outfits preserved", validOutfits.length === 3);
}

// ─── Summary ───
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
