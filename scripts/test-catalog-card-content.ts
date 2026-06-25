import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildColorInfo,
  getAccentColors,
  getPrimaryColor,
  getPrimaryColors,
} from "../src/lib/color-fields";
import {
  getWishlistCardSubtitle,
  getWishlistDisplayState,
} from "../src/lib/wishlist-display-state";
import type { WardrobeItem, WishlistAssessment, WishlistItem, WishlistRuleAssessment } from "../src/lib/types";
import {
  formatGarmentCategoryColorLine,
  formatGarmentWearLine,
  formatLocalMonthDay,
  getGarmentCardColors,
} from "../src/lib/catalog-card-format";

const root = join(__dirname, "..");

// Category label tests
const wItem = {
  category: "pants",
  subcategory: "cargo_shorts",
  colors: buildColorInfo("single", ["棕"], []),
} as WardrobeItem;
const line = formatGarmentCategoryColorLine(wItem);
assert.equal(line.categoryLabel, "裤子");

// Color extraction
const colors = getGarmentCardColors(wItem);
assert.ok(colors.includes("棕"));

// Wear line: no records
const neverWorn: WardrobeItem = {
  ...wItem,
  wornDates: [],
} as WardrobeItem;
assert.equal(formatGarmentWearLine(neverWorn), "未穿过");

// Wear line: with records (ascending order: oldest first, newest last)
const worn: WardrobeItem = {
  ...wItem,
  wornDates: ["2026-06-10T10:00:00Z", "2026-06-15T10:00:00Z", "2026-06-20T10:00:00Z"],
} as WardrobeItem;
const wearLine = formatGarmentWearLine(worn);
assert.ok(wearLine.includes("6/20"), `wear line should include 6/20: ${wearLine}`);
assert.ok(wearLine.includes("3 次"), `wear line should include 3次: ${wearLine}`);

// Wishlist subtitle: pending
const pendingItem: WishlistItem = {
  id: "w1",
  name: "test",
  imageDataUrl: "",
  category: "shoes",
  colors: buildColorInfo("single", ["黑"], []),
  seasons: [],
  styles: [],
  status: "interested",
  createdAt: "",
  updatedAt: "",
} as WishlistItem;
const displayState = getWishlistDisplayState(pendingItem);
assert.equal(displayState, "pending_assessment");

const pendingSubtitle = getWishlistCardSubtitle(pendingItem);
assert.ok(
  pendingSubtitle.includes("待评估") || pendingSubtitle === "点击查看",
);

// Wishlist subtitle: worth_buying with matches
const withAssessment: WishlistItem = {
  ...pendingItem,
  aiAssessment: {
    verdict: "worth_buying",
    score: 85,
    summary: "",
    matchReasons: [],
    conflictReasons: [],
    similarOwnedItemIds: [1, 2],
    suggestedOutfits: [{ title: "", itemIds: [], reason: "" }, { title: "", itemIds: [], reason: "" }, { title: "", itemIds: [], reason: "" }, { title: "", itemIds: [], reason: "" }],
    generatedAt: new Date().toISOString(),
  } as WishlistAssessment,
};
const waSubtitle = getWishlistCardSubtitle(withAssessment);
assert.ok(
  waSubtitle.includes("可搭") || waSubtitle.includes("相似"),
);

// Wishlist subtitle: not_recommended with similar
const notRec: WishlistItem = {
  ...pendingItem,
  aiAssessment: {
    verdict: "not_recommended",
    score: 20,
    summary: "",
    matchReasons: [],
    conflictReasons: [],
    similarOwnedItemIds: [3, 4],
    suggestedOutfits: [],
    generatedAt: new Date().toISOString(),
  } as WishlistAssessment,
};
const nrSubtitle = getWishlistCardSubtitle(notRec);
assert.ok(nrSubtitle.includes("相似") || nrSubtitle.includes("适配风险"));

// Format month day
assert.equal(formatLocalMonthDay("2026-06-20"), "6/20");
assert.equal(formatLocalMonthDay(""), "");

console.log("✅ test-catalog-card-content: all passed");
