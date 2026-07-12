import assert from "node:assert/strict";
import { buildStatistics } from "../apps/wechat-miniprogram/utils/wear-statistics";
import type { MiniGarment, MiniOutfit, MiniWishlistItem } from "../apps/wechat-miniprogram/services/workspace";

const today = "2026-07-13";

function garment(id: number, wornDates: string[] = [], createdAt = "2026-01-01T00:00:00.000Z"): MiniGarment {
  return { id: `garment-${id}`, name: `衣物${id}`, categoryLabel: "上衣", imageUrl: "", status: "active", wornDates, createdAt } as MiniGarment;
}

function outfit(id: number, wornDates: string[]): MiniOutfit {
  return { id: `outfit-${id}`, name: `套装${id}`, itemCount: 2, imageUrl: "", wornDates } as MiniOutfit;
}

const frequent = garment(1, ["2026-07-13", ...Array.from({ length: 150 }, (_, index) => `2026-01-${String((index % 9) + 1).padStart(2, "0")}`)]);
const recent = garment(2, ["2026-07-13", "2026-07-12"]);
const items = [frequent, recent, garment(3, ["2026-07-10"]), garment(4, ["2026-07-09"]), garment(5), garment(6), garment(7), garment(8), garment(9), garment(10), garment(11), garment(12)];
const outfits = [outfit(1, ["2026-07-13"]), outfit(2, ["2026-07-12"]), outfit(3, ["2026-07-11"])];
const wishlist = [{ convertedGarmentId: "garment-2", convertedAt: "2026-07-01T00:00:00.000Z", id: "wish-1" } as MiniWishlistItem];

const stats = buildStatistics(items, outfits, wishlist, today);

assert.equal(stats.idleCount, 8, "闲置总数不能被六条列表截断");
assert.equal(stats.idleRows.length, 6, "闲置列表最多展示六条");
assert.equal(stats.recentRows.filter((row) => row.badge === "衣物").length, 4, "最近常穿最多展示四条衣物");
assert.equal(stats.recentRows.filter((row) => row.badge === "套装").length, 2, "最近常穿最多展示两条套装");
assert.equal(stats.recentRows[0]?.id, "garment-2", "近90天次数应先于累计次数排序");
assert.match(stats.purchaseRows[0]?.subtitle ?? "", /每30天/);

console.log("miniprogram wear statistics tests passed");
