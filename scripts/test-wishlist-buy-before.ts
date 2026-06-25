// scripts/test-wishlist-buy-before.ts
// v0.9.49-dev 种草 2.0: 买前评估全链路逻辑测试

import {
  getWishlistDisplayState, getWishlistDisplayLabel, getWishlistStatusCapsuleColor,
  getWishlistCardSubtitle, isMainWishlistItem, filterMainWishlistItems,
  countPurchasedWishlistItems, countRejectedWishlistItems, countArchivedWishlistItems,
  type WishlistDisplayState, type WishlistMainFilter,
} from "../src/lib/wishlist-display-state";

import {
  wishlistToVirtualWardrobeItem,
  wishlistToWardrobeItem,
  getUndoPurchaseRisk,
} from "../src/lib/wishlist-conversion";

import {
  getRecommendedPairingsForWishlistItem,
  findSimilarWardrobeItemsForWishlistItem,
  assessWishlistItemByRules,
} from "../src/lib/wishlist-assessment";

import {
  buildWishlistAssessmentSystemPrompt,
  buildWishlistAssessmentPrompt,
  parseWishlistAssessmentJson,
  sanitizeWishlistAssessment,
  buildFallbackWishlistAssessment,
} from "../src/lib/wishlist-ai-prompt";

import { buildColorInfo, emptyColorInfo, getAllColors, getPrimaryColor, getPrimaryColors } from "../src/lib/color-fields";
import type {
  WishlistItem, WardrobeItem, SavedOutfit,
  WishlistRuleAssessment, WishlistAssessment,
} from "../src/lib/types";

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
const today = now.slice(0, 10);

function makeWishlistItem(overrides: Partial<WishlistItem> & { id: string }): WishlistItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `wish-${overrides.id}`,
    imageDataUrl: overrides.imageDataUrl ?? "",
    category: overrides.category ?? "tops",
    colors: overrides.colors ?? buildColorInfo("single", ["白"]),
    seasons: overrides.seasons ?? ["spring", "summer"],
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
    productUrl: overrides.productUrl,
    aiAssessment: overrides.aiAssessment,
    convertedItemId: overrides.convertedItemId,
    convertedAt: overrides.convertedAt,
  };
}

function makeWardrobeItem(overrides: Partial<WardrobeItem> & { id: number }): WardrobeItem {
  return {
    id: overrides.id,
    name: overrides.name ?? `item-${overrides.id}`,
    imageDataUrl: overrides.imageDataUrl ?? `data:image/png;base64,test${overrides.id}`,
    category: overrides.category ?? "tops",
    colors: overrides.colors ?? buildColorInfo("single", ["白"]),
    seasons: overrides.seasons ?? ["spring", "summer", "autumn", "winter"],
    styles: overrides.styles ?? ["casual"],
    formality: overrides.formality ?? 3,
    warmth: overrides.warmth ?? 3,
    locationId: overrides.locationId ?? "home",
    status: overrides.status ?? "active",
    wornDates: overrides.wornDates ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    temperatureRange: overrides.temperatureRange,
    material: overrides.material,
    fitGender: overrides.fitGender ?? "unknown",
    fitNotes: overrides.fitNotes,
    notes: overrides.notes,
    price: overrides.price,
    purchaseDate: overrides.purchaseDate,
    sourceImageDataUrl: overrides.sourceImageDataUrl,
    thumbnailDataUrl: overrides.thumbnailDataUrl,
    subcategory: overrides.subcategory,
  };
}

function makeOutfit(overrides: Partial<SavedOutfit> & { id: string; itemIds: number[] }): SavedOutfit {
  return {
    id: overrides.id,
    name: overrides.name ?? `outfit-${overrides.id}`,
    itemIds: overrides.itemIds,
    source: overrides.source ?? "manual",
    favorite: overrides.favorite ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// ===================================================================
// 1. wishlist-display-state
// ===================================================================

console.log("\n=== 1. WishlistDisplayState ===");

{
  const pending = makeWishlistItem({ id: "w1", status: "interested" });
  assertEq("interested + no assessment → pending_assessment", getWishlistDisplayState(pending), "pending_assessment");

  const worth = makeWishlistItem({ id: "w2", status: "interested", aiAssessment: { verdict: "worth_buying" } as any });
  assertEq("worth_buying verdict", getWishlistDisplayState(worth), "worth_buying");

  const consider = makeWishlistItem({ id: "w3", status: "interested", aiAssessment: { verdict: "consider" } as any });
  assertEq("consider verdict", getWishlistDisplayState(consider), "consider");

  const notRec = makeWishlistItem({ id: "w4", status: "interested", aiAssessment: { verdict: "not_recommended" } as any });
  assertEq("not_recommended verdict", getWishlistDisplayState(notRec), "not_recommended");

  const rejected = makeWishlistItem({ id: "w5", status: "rejected" });
  assertEq("rejected status", getWishlistDisplayState(rejected), "rejected");

  const purchased = makeWishlistItem({ id: "w6", status: "interested", convertedItemId: 42 });
  assertEq("purchased (convertedItemId)", getWishlistDisplayState(purchased), "purchased");

  const purchased2 = makeWishlistItem({ id: "w7", status: "interested", convertedAt: now });
  assertEq("purchased (convertedAt)", getWishlistDisplayState(purchased2), "purchased");

  const archived = makeWishlistItem({ id: "w8", status: "archived" });
  assertEq("archived status", getWishlistDisplayState(archived), "archived");

  // purchased takes priority over other statuses
  const purchasedArchived = makeWishlistItem({ id: "w9", status: "archived", convertedItemId: 99 });
  assertEq("purchased > archived", getWishlistDisplayState(purchasedArchived), "purchased");
}

console.log("\n=== 1b. Status Capsule Colors ===");

{
  const states: WishlistDisplayState[] = [
    "pending_assessment", "worth_buying", "consider", "not_recommended",
    "rejected", "purchased", "archived",
  ];
  for (const s of states) {
    const c = getWishlistStatusCapsuleColor(s);
    check(`${s} has bg`, typeof c.bg === "string" && c.bg.length > 0);
    check(`${s} has text`, typeof c.text === "string" && c.text.length > 0);
  }
  const labels = states.map((s) => getWishlistDisplayLabel(s));
  check("7 unique labels", new Set(labels).size === 7, String(labels));
}

console.log("\n=== 1c. Card Subtitle ===");

{
  const purchased = makeWishlistItem({ id: "s1", convertedItemId: 1 });
  assertEq("purchased subtitle", getWishlistCardSubtitle(purchased), "已加入衣橱");

  const rejected = makeWishlistItem({ id: "s2", status: "rejected" });
  assertEq("rejected subtitle", getWishlistCardSubtitle(rejected), "不感兴趣");

  const archived = makeWishlistItem({ id: "s3", status: "archived" });
  assertEq("archived subtitle", getWishlistCardSubtitle(archived), "已归档");

  const pending = makeWishlistItem({ id: "s4", status: "interested" });
  assertEq("pending no assessment → pending", getWishlistCardSubtitle(pending), "待评估");

  const withAssessment = makeWishlistItem({ id: "s5", status: "interested", aiAssessment: { verdict: "worth_buying", suggestedOutfits: [{ title: "", itemIds: [1, 2], reason: "" }] } as any });
  check("has suggested outfits subtitle", getWishlistCardSubtitle(withAssessment).includes("可搭"));

  const withNotRec = makeWishlistItem({ id: "s6", status: "interested", aiAssessment: { verdict: "not_recommended", similarOwnedItemIds: [1, 2] } as any });
  check("not recommended with similar subtitle", getWishlistCardSubtitle(withNotRec).includes("相似"));
}

console.log("\n=== 1d. Main Filter ===");

{
  const items: WishlistItem[] = [
    makeWishlistItem({ id: "f1", status: "interested" }),
    makeWishlistItem({ id: "f2", status: "interested", aiAssessment: { verdict: "worth_buying" } as any }),
    makeWishlistItem({ id: "f3", status: "interested", aiAssessment: { verdict: "not_recommended" } as any }),
    makeWishlistItem({ id: "f4", status: "rejected" }),
    makeWishlistItem({ id: "f5", status: "archived" }),
    makeWishlistItem({ id: "f6", convertedItemId: 10 }),
  ];

  check("isMainWishlistItem filters correctly", isMainWishlistItem(items[0]) && isMainWishlistItem(items[1]) && !isMainWishlistItem(items[3]) && !isMainWishlistItem(items[4]) && !isMainWishlistItem(items[5]));

  const all = filterMainWishlistItems(items, "all");
  check("filter all → 3 main items", all.length === 3, String(all.length));

  const worth = filterMainWishlistItems(items, "worth_buying");
  check("filter worth_buying → 1", worth.length === 1, String(worth.length));

  const pending = filterMainWishlistItems(items, "pending");
  check("filter pending → 1", pending.length === 1, String(pending.length));

  check("countPurchased", countPurchasedWishlistItems(items) === 1);
  check("countRejected", countRejectedWishlistItems(items) === 1);
  check("countArchived", countArchivedWishlistItems(items) === 1, String(countArchivedWishlistItems(items)));
}

// ===================================================================
// 2. wishlist-conversion
// ===================================================================

console.log("\n=== 2. Wishlist Conversion ===");

{
  const wishItem = makeWishlistItem({
    id: "c1",
    name: "Nike Air Max",
    category: "shoes",
    colors: buildColorInfo("main_with_accent", ["白"], ["灰", "黑"]),
    seasons: ["spring", "autumn"],
    styles: ["casual", "outdoor"],
    formality: 2,
    warmth: 2,
    price: 899,
    notes: "经典款",
    imageDataUrl: "data:image/png;base64,abc",
    material: "网面",
    fitGender: "unisex",
  });

  const virtual = wishlistToVirtualWardrobeItem(wishItem, "home");
  check("virtual has name", virtual.name === "Nike Air Max");
  check("virtual category", virtual.category === "shoes");
  check("virtual colors", getAllColors(virtual.colors).length === 3);
  check("virtual has primary color", getPrimaryColor(virtual.colors) === "白");
  check("virtual has notes", virtual.notes === "经典款");
  check("virtual has tempRange", (virtual as any).temperatureRange === undefined);

  const full = wishlistToWardrobeItem({ wishlistItem: wishItem, locationId: "home", now });
  check("full has price", full.price === 899);
  check("full does not inherit wishlist brand", (full as Record<string, unknown>).brand == null);
  check("full has purchaseDate YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(full.purchaseDate ?? ""), full.purchaseDate);
  check("full has locationId", full.locationId === "home");
  check("full has wornDates empty", Array.isArray(full.wornDates) && full.wornDates.length === 0);

  // Test colors normalization via wishlistToVirtualWardrobeItem
  const noColors = makeWishlistItem({ id: "c2", name: "Test", colors: buildColorInfo("single", ["蓝"]) });
  const virtNo = wishlistToVirtualWardrobeItem(noColors, "home");
  assertEq("primary color preserved", getPrimaryColors(virtNo.colors), ["蓝"]);

  // Test empty name trimming
  const emptyName = makeWishlistItem({ id: "c3", name: "  " });
  const virtEmpty = wishlistToVirtualWardrobeItem(emptyName, "home");
  check("empty name → fallback", virtEmpty.name === "未命名种草单品");
}

console.log("\n=== 2b. Undo Purchase Risk ===");

{
  const wishItem = makeWishlistItem({
    id: "u1",
    convertedItemId: 100,
    convertedAt: "2025-01-01T00:00:00.000Z",
  });
  const wardrobeItems = [
    makeWardrobeItem({ id: 100, wornDates: ["2025-03-01", "2025-04-01"], updatedAt: "2025-02-01T00:00:00.000Z" }),
  ];
  const outfits = [
    makeOutfit({ id: "o1", itemIds: [100, 1, 2] }),
    makeOutfit({ id: "o2", itemIds: [100, 3] }),
    makeOutfit({ id: "o3", itemIds: [1, 2] }),
  ];

  const risk = getUndoPurchaseRisk({ convertedItemId: 100, wardrobeItems, outfits, wishlistItem: wishItem });
  check("in outfit count 2", risk.inOutfitCount === 2, String(risk.inOutfitCount));
  check("worn 2 dates", risk.wornDateCount === 2, String(risk.wornDateCount));
  check("item was edited", risk.itemWasEdited === true);
}

// ===================================================================
// 3. wishlist-assessment (rule engine)
// ===================================================================

console.log("\n=== 3. Rule Assessment ===");

{
  // Build a diverse wardrobe
  const wardrobeItems: WardrobeItem[] = [
    makeWardrobeItem({ id: 1, category: "pants", name: "黑色长裤", colors: buildColorInfo("single", ["黑"]), styles: ["casual", "elegant"], formality: 4, warmth: 3 }),
    makeWardrobeItem({ id: 2, category: "tops", name: "牛仔夹克", colors: buildColorInfo("single", ["牛仔蓝"]), styles: ["casual"], formality: 2, warmth: 2 }),
    makeWardrobeItem({ id: 3, category: "shoes", name: "白色运动鞋", colors: buildColorInfo("single", ["白"]), styles: ["casual", "outdoor"], formality: 2, warmth: 2 }),
    makeWardrobeItem({ id: 4, category: "tops", name: "条纹衬衫", colors: buildColorInfo("multicolor", ["白", "蓝"]), styles: ["casual", "elegant"], formality: 3, warmth: 2 }),
    makeWardrobeItem({ id: 5, category: "pants", name: "卡其短裤", colors: buildColorInfo("single", ["棕"]), styles: ["casual"], seasons: ["summer"], formality: 2, warmth: 1 }),
    makeWardrobeItem({ id: 6, category: "tops", name: "风衣", colors: buildColorInfo("single", ["棕"]), styles: ["elegant", "casual"], formality: 4, warmth: 3 }),
    makeWardrobeItem({ id: 7, category: "shoes", name: "乐福鞋", colors: buildColorInfo("single", ["棕"]), styles: ["elegant", "casual"], formality: 4, warmth: 2 }),
    makeWardrobeItem({ id: 8, category: "bags", name: "帆布包", colors: buildColorInfo("single", ["米"]), styles: ["casual"], formality: 2, warmth: 1 }),
    makeWardrobeItem({ id: 9, category: "tops", name: "旧白T恤(archive)", colors: buildColorInfo("single", ["白"]), status: "archived" }),
    makeWardrobeItem({ id: 10, category: "pants", name: "维修中牛仔裤", colors: buildColorInfo("single", ["蓝"]), status: "repair" }),
  ];

  const outfits: SavedOutfit[] = [];

  // Well-matched wishlist item
  const goodItem = makeWishlistItem({
    id: "g1",
    name: "米色针织开衫",
    category: "tops",
    colors: buildColorInfo("single", ["米"]),
    seasons: ["spring", "autumn", "winter"],
    styles: ["casual", "elegant"],
    formality: 3,
    warmth: 3,
    price: 299,
    imageDataUrl: "data:image/png;base64,knit",
  });

  const pairing = getRecommendedPairingsForWishlistItem({
    wishlistItem: goodItem,
    wardrobeItems,
    outfits,
    fallbackLocationId: "home",
    limit: 8,
  });

  check("pairing results exist", pairing.length > 0, String(pairing.length));
  check("pairing items have reasons", pairing.every((p) => p.reasons.length > 0 || p.score >= 18));
  check("pairing sorted by score desc", pairing.every((_, i) => i === 0 || pairing[i - 1].score >= pairing[i].score));

  // Check archived/repair items not in results
  const archivedItems = pairing.filter((p) => p.item.status === "archived");
  check("no archived items in pairing", archivedItems.length === 0);

  // Similar items
  const similar = findSimilarWardrobeItemsForWishlistItem({
    wishlistItem: goodItem,
    wardrobeItems,
    fallbackLocationId: "home",
    limit: 5,
    minSimilarity: 70,
  });
  check("similar returns array", Array.isArray(similar));

  // Full rule assessment
  const rule = assessWishlistItemByRules({
    wishlistItem: goodItem,
    wardrobeItems,
    outfits,
    fallbackLocationId: "home",
  });

  check("rule assessment has score", typeof rule.score === "number" && rule.score >= 0 && rule.score <= 100);
  check("rule assessment has verdict", ["worth_buying", "consider", "not_recommended"].includes(rule.localVerdict));
  check("rule has matchCount", typeof rule.matchCount === "number");
  check("rule has similarCount", typeof rule.similarCount === "number");
  check("rule has pairingCoverage", ["low", "medium", "high"].includes(rule.pairingCoverage));
  check("rule has duplicateRisk", ["low", "medium", "high"].includes(rule.duplicateRisk));
  check("rule has informationCompleteness", ["low", "medium", "high"].includes(rule.informationCompleteness));
  check("rule has priceLevel", ["low", "medium", "high", "unknown"].includes(rule.priceLevel));
  check("rule has summary", typeof rule.summary === "string" && rule.summary.length > 0);

  console.log(`  📊 Rule result: score=${rule.score}, verdict=${rule.localVerdict}, match=${rule.matchCount}, similar=${rule.similarCount}, coverage=${rule.pairingCoverage}, dupRisk=${rule.duplicateRisk}, info=${rule.informationCompleteness}, price=${rule.priceLevel}`);
}

console.log("\n=== 3b. Edge Cases ===");

{
  // Empty wardrobe
  const emptyResult = assessWishlistItemByRules({
    wishlistItem: makeWishlistItem({ id: "e1", name: "Test", imageDataUrl: "dummy" }),
    wardrobeItems: [],
    outfits: [],
    fallbackLocationId: "home",
  });
  check("empty wardrobe → matchCount 0", emptyResult.matchCount === 0);
  check("empty wardrobe → low coverage", emptyResult.pairingCoverage === "low");

  // Low info item — explicitly clear all fields for truly low info
  const lowInfoItem = makeWishlistItem({
    id: "e2", name: "", category: undefined as any, price: undefined,
    colors: emptyColorInfo(), seasons: [] as any,
    styles: [] as any, formality: undefined as any, warmth: undefined as any,
    temperatureRange: undefined,
    subcategory: undefined, imageDataUrl: "",
  });
  const lowInfoResult = assessWishlistItemByRules({
    wishlistItem: lowInfoItem,
    wardrobeItems: [makeWardrobeItem({ id: 1 })],
    outfits: [],
    fallbackLocationId: "home",
  });
  check("low info → has hints", lowInfoResult.missingInfoHints.length > 0, String(lowInfoResult.missingInfoHints));
  check("low info → low completeness", lowInfoResult.informationCompleteness === "low", lowInfoResult.informationCompleteness);

  // High price item
  const expensiveItem = makeWishlistItem({ id: "e3", name: "贵包", category: "bags", price: 5000, imageDataUrl: "dummy" });
  const expResult = assessWishlistItemByRules({
    wishlistItem: expensiveItem,
    wardrobeItems: [makeWardrobeItem({ id: 1, category: "tops" })],
    outfits: [],
    fallbackLocationId: "home",
  });
  check("high price level", expResult.priceLevel === "high", expResult.priceLevel);
}

// ===================================================================
// 4. wishlist-ai-prompt
// ===================================================================

console.log("\n=== 4. AI Prompt ===");

{
  const sysPrompt = buildWishlistAssessmentSystemPrompt();
  check("system prompt not empty", sysPrompt.length > 100);
  check("system prompt mentions JSON", sysPrompt.includes("JSON"));

  const wishItem = makeWishlistItem({
    id: "p1",
    name: "Nike Dunk Low",
    category: "shoes",
    colors: buildColorInfo("multicolor", ["白", "灰"]),
    price: 799,
    seasons: ["spring", "autumn"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    imageDataUrl: "data:image/png;base64,dunk",
  });

  const ruleAssessment: WishlistRuleAssessment = {
    score: 72,
    localVerdict: "consider",
    matchCount: 5,
    similarCount: 2,
    highSimilarityCount: 0,
    duplicateRisk: "medium",
    pairingCoverage: "medium",
    informationCompleteness: "high",
    priceLevel: "medium",
    recommendedPairings: [],
    similarOwnedItems: [],
    missingInfoHints: [],
    summary: "有一定搭配空间",
  };

  const userPrompt = buildWishlistAssessmentPrompt({
    wishlistItem: wishItem,
    ruleAssessment,
    wardrobeItems: [],
  });
  check("user prompt contains item name", userPrompt.includes("Nike Dunk Low"));
  check("user prompt contains price", userPrompt.includes("799"));
  check("user prompt contains rule score", userPrompt.includes("72"));
  check("user prompt contains verdict", userPrompt.includes("再考虑"));
}

console.log("\n=== 4b. JSON Parsing ===");

{
  // Valid JSON
  const valid = parseWishlistAssessmentJson('{"score":80,"verdict":"worth_buying","summary":"值得买"}');
  check("parse valid JSON", (valid as any).score === 80);

  // JSON wrapped in markdown code block
  const inBlock = parseWishlistAssessmentJson('```json\n{"score":50,"verdict":"consider","summary":"还行"}\n```');
  check("strip markdown block", (inBlock as any).score === 50);

  // Extra text around JSON
  const withText = parseWishlistAssessmentJson('here is the result: {"score":30,"verdict":"not_recommended","summary":"不建议"} hope that helps');
  check("extract JSON from text", (withText as any).score === 30);

  // Invalid - should throw
  let threw = false;
  try { parseWishlistAssessmentJson("not json at all"); }
  catch { threw = true; }
  check("throws on non-JSON", threw);
}

console.log("\n=== 4c. Sanitization ===");

{
  const ruleAssessment: WishlistRuleAssessment = {
    score: 65,
    localVerdict: "consider",
    matchCount: 3,
    similarCount: 1,
    highSimilarityCount: 0,
    duplicateRisk: "low",
    pairingCoverage: "medium",
    informationCompleteness: "medium",
    priceLevel: "medium",
    recommendedPairings: [
      { item: makeWardrobeItem({ id: 1, name: "白衬衫" }), score: 88, reasons: ["可搭配"], confidence: "high" },
      { item: makeWardrobeItem({ id: 2, name: "黑西裤" }), score: 82, reasons: ["可搭配"], confidence: "high" },
      { item: makeWardrobeItem({ id: 3, name: "灰外套" }), score: 78, reasons: ["可搭配"], confidence: "medium" },
    ],
    similarOwnedItems: [{ item: makeWardrobeItem({ id: 99, name: "相似白T" }), similarity: 85, reasons: ["颜色接近"] }],
    missingInfoHints: [],
    summary: "局部规则摘要",
  };

  const validIds = new Set([1, 2, 3, 99]);

  // Valid AI response
  const raw = {
    score: 78,
    verdict: "worth_buying",
    summary: "搭配覆盖度高，值得考虑。",
    matchReasons: ["可搭配多件下装", "颜色百搭"],
    conflictReasons: ["已有类似款式"],
    similarOwnedItemIds: [99],
    suggestedOutfits: [
      { title: "通勤搭配", itemIds: [1, 2], reason: "适合日常通勤" },
    ],
    missingItems: ["深色西装裤"],
  };

  const clean = sanitizeWishlistAssessment({ raw, ruleAssessment, validWardrobeItemIds: validIds });

  check("score preserved", clean.score === 78);
  assertEq("verdict preserved", clean.verdict, "worth_buying");
  check("summary not empty", clean.summary.length > 0);
  check("matchReasons count ok", clean.matchReasons.length === 2);
  check("suggestedOutfits count ok", clean.suggestedOutfits.length === 1);

  // Verify invalid item IDs are filtered
  const rawWithBadIds = {
    ...raw,
    similarOwnedItemIds: [99, 1, 999, -1],
    suggestedOutfits: [
      { title: "Mixed outfit", itemIds: [1, 99, 999, 2], reason: "only pairings stay" },
    ],
  };
  const cleanBad = sanitizeWishlistAssessment({ raw: rawWithBadIds, ruleAssessment, validWardrobeItemIds: validIds });
  check("filtered invalid similarOwnedItemIds", cleanBad.similarOwnedItemIds.length === 1, String(cleanBad.similarOwnedItemIds));
  check("filtered outfit IDs outside pairing candidates", cleanBad.suggestedOutfits[0]?.itemIds.join(",") === "1,2", String(cleanBad.suggestedOutfits[0]?.itemIds));

  // Truncation of long strings
  const rawLong = {
    score: 70,
    summary: "a".repeat(200),
    matchReasons: ["a".repeat(100)],
    conflictReasons: ["a".repeat(100)],
    missingItems: ["a".repeat(100)],
    suggestedOutfits: [
      { title: "a".repeat(30), itemIds: [1], reason: "a".repeat(100) },
    ],
  };
  const cleanLong = sanitizeWishlistAssessment({ raw: rawLong, ruleAssessment, validWardrobeItemIds: validIds });
  check("summary truncated to 100", cleanLong.summary.length <= 100, String(cleanLong.summary.length));
  check("matchReason truncated", cleanLong.matchReasons[0]?.length <= 50, String(cleanLong.matchReasons[0]?.length));
  check("outfit title truncated", cleanLong.suggestedOutfits[0]?.title.length <= 16, String(cleanLong.suggestedOutfits[0]?.title.length));

  // Fallback to rule values on bad input
  const cleanBadInput = sanitizeWishlistAssessment({ raw: {}, ruleAssessment, validWardrobeItemIds: validIds });
  check("bad input → falls back to rule score", cleanBadInput.score === ruleAssessment.score, `${cleanBadInput.score} vs ${ruleAssessment.score}`);
  check("bad input → falls back to rule verdict", cleanBadInput.verdict === ruleAssessment.localVerdict);
}

console.log("\n=== 4d. Fallback Assessment ===");

{
  const rule: WishlistRuleAssessment = {
    score: 55,
    localVerdict: "consider",
    matchCount: 4,
    similarCount: 2,
    highSimilarityCount: 1,
    duplicateRisk: "medium",
    pairingCoverage: "medium",
    informationCompleteness: "medium",
    priceLevel: "low",
    recommendedPairings: [],
    similarOwnedItems: [
      { item: makeWardrobeItem({ id: 10, name: "相似品" }), similarity: 82, reasons: ["相似"] },
    ],
    missingInfoHints: ["需要补充材质"],
    summary: "规则摘要",
  };

  const fallback = buildFallbackWishlistAssessment(rule);
  check("fallback preserves score", fallback.score === 55);
  check("fallback preserves verdict", fallback.verdict === "consider");
  check("fallback has similar ids", fallback.similarOwnedItemIds.includes(10));
  check("fallback has missing hints", fallback.missingItems?.[0] === "需要补充材质");
  check("fallback has generatedAt", typeof fallback.generatedAt === "string");

  // Verify high duplicate risk fallback
  const highDupRule = { ...rule, duplicateRisk: "high" as const, pairingCoverage: "low" as const, score: 30, localVerdict: "not_recommended" as const };
  const highDupFallback = buildFallbackWishlistAssessment(highDupRule);
  check("high dup fallback has conflict reasons", highDupFallback.conflictReasons.length > 0, String(highDupFallback.conflictReasons));
}

// ===================================================================
// Summary
// ===================================================================

console.log(`\n${"=".repeat(50)}`);
console.log(`  pass=${pass}  fail=${fail}`);
if (failures.length > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  ❌ ${f}`));
}
console.log(`${"=".repeat(50)}\n`);

if (fail > 0) process.exit(1);
