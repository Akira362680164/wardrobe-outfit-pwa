import { strict as assert } from "node:assert";
import { calculateWearStatistics, daysBetweenDateKeys } from "../src/lib/wear-statistics";
import { buildColorInfo } from "../src/lib/color-fields";
import type { SavedOutfit, WardrobeItem, WishlistItem } from "../src/lib/types";

const now = "2026-06-11T08:00:00.000Z";
const todayKey = "2026-06-11";

function item(id: number, name: string, wornDates: string[] = [], createdAt = "2026-01-01T00:00:00.000Z"): WardrobeItem {
  return {
    id,
    name,
    imageDataUrl: `data:image/png;base64,${id}`,
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring"],
    styles: ["commute"],
    formality: 3,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates,
    createdAt,
    updatedAt: now,
  };
}

const whiteShirt = item(1, "白衬衫", ["2026-06-01", "2026-06-10", "2026-06-11"]);
const jeans = item(2, "牛仔裤", ["2026-06-02", "2026-05-20"]);
const idle = item(3, "灰西裤", ["2026-02-01"], "2026-01-01T00:00:00.000Z");
const neverWorn = item(4, "黑包", [], "2026-03-01T00:00:00.000Z");
const purchasedUnused = item(5, "白乐福鞋", [], "2026-06-01T00:00:00.000Z");
const missingWorn = { ...item(6, "旧数据上衣"), wornDates: undefined as unknown as string[] };

const outfits: SavedOutfit[] = [
  {
    id: "o1",
    name: "通勤套装",
    itemIds: [1, 2],
    source: "manual",
    favorite: true,
    seasons: ["spring"],
    sceneTags: ["通勤"],
    wornDates: ["2026-06-11", "2026-06-05"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "o2",
    name: "旧套装",
    itemIds: [3],
    source: "manual",
    favorite: true,
    wornDates: ["2026-04-01"],
    createdAt: now,
    updatedAt: now,
  },
];

const wishlistItems: WishlistItem[] = [
  {
    id: "w1",
    name: "买来的衬衫",
    imageDataUrl: "",
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring"],
    styles: ["commute"],
    status: "archived",
    convertedItemId: 1,
    convertedAt: "2026-06-01T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "w2",
    name: "买来的鞋",
    imageDataUrl: "",
    category: "shoes",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring"],
    styles: ["commute"],
    status: "archived",
    convertedItemId: 5,
    convertedAt: "2026-06-01T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
  },
];

assert.equal(daysBetweenDateKeys("2026-06-01", "2026-06-11"), 10, "日期差");

const stats = calculateWearStatistics({
  items: [whiteShirt, jeans, idle, neverWorn, purchasedUnused, missingWorn],
  outfits,
  wishlistItems,
}, { todayKey, idleThresholdDays: 45, listLimit: 10 });

assert.equal(stats.overview.monthlyItemCount, 2, "本月穿过衣物数");
assert.equal(stats.overview.monthlyItemWearEvents, 4, "本月衣物穿着事件数");
assert.equal(stats.overview.monthlyOutfitCount, 1, "本月穿过套装数");
assert.equal(stats.overview.monthlyOutfitWearEvents, 2, "本月套装穿着事件数");
assert.equal(stats.frequentItems[0]?.item.id, 1, "最近常穿按本月次数排序");
assert.ok(stats.idleItems.some((entry) => entry.item.id === 3 && entry.idleDays >= 100), "很久没穿统计");
assert.ok(stats.idleItems.some((entry) => entry.item.id === 4 && entry.neverWorn), "从未穿过也纳入闲置");
assert.equal(stats.purchaseUsage.length, 2, "购买后使用率关联 convertedItemId");
assert.equal(stats.purchaseUsage.find((entry) => entry.item.id === 1)?.usesAfterPurchase, 3, "购买后使用次数");
assert.equal(stats.purchaseUsage.find((entry) => entry.item.id === 5)?.isZeroUse, true, "购买后 0 使用提醒");
assert.ok(stats.sceneDistribution.some((entry) => entry.label === "通勤"), "场景分布");

console.log("wear statistics tests passed");
