import { getRecommendedPairingItemsForItem, getRelatedOutfitsForItem, type RecommendedPairingItem } from "../src/lib/garment-detail-pairing";
import { buildColorInfo } from "../src/lib/color-fields";
import type { WardrobeItem, SavedOutfit } from "../src/lib/types";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

// --- 造测试数据 ---
const now = new Date().toISOString();
const today = now.slice(0, 10);

function makeItem(overrides: Partial<WardrobeItem> & { id: number }): WardrobeItem {
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
  };
}

function makeOutfit(overrides: Partial<SavedOutfit> & { id: string; itemIds: number[] }): SavedOutfit {
  return {
    id: overrides.id,
    name: overrides.name ?? `outfit-${overrides.id}`,
    itemIds: overrides.itemIds,
    source: overrides.source ?? "manual",
    favorite: overrides.favorite ?? false,
    wornDates: overrides.wornDates ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// --- 基础场景: 上装找下装配 ---
console.log("\n=== 基础场景: 上装 → 下装 ===");
const top = makeItem({ id: 1, name: "白T恤", category: "tops", colors: buildColorInfo("single", ["白"]), seasons: ["summer"] });
const pants = makeItem({ id: 2, name: "牛仔裤", category: "pants", colors: buildColorInfo("single", ["牛仔蓝"]), seasons: ["summer"] });

const results1 = getRecommendedPairingItemsForItem(top, [top, pants], []);
check("top 推荐包含 bottom", results1.some((r) => r.item.id === 2));
const jeansResult = results1.find((r) => r.item.id === 2);
check("牛仔裤 score > 30 且 category 互补分高", jeansResult ? jeansResult.score >= 30 : false, jeansResult ? `score=${jeansResult.score}` : "");

// --- 空衣橱 / 仅自己 ---
console.log("\n=== 极端场景 ===");
const emptyResults = getRecommendedPairingItemsForItem(top, [top], []);
check("只有自己 → 空结果", emptyResults.length === 0);

// --- 季节冲突 ---
console.log("\n=== 季节冲突 ===");
const winterKnit = makeItem({ id: 3, name: "冬季针织衫", category: "tops", seasons: ["winter"], colors: buildColorInfo("single", ["黑"]) });
const summerSkirt = makeItem({ id: 4, name: "夏季半裙", category: "skirts", seasons: ["summer"], colors: buildColorInfo("single", ["红"]) });
const seasonResults = getRecommendedPairingItemsForItem(winterKnit, [winterKnit, summerSkirt], []);
// 品类互补分(28) > 季节扣分(-5), 仍会推荐; 但理由中不含季节匹配
const summerRec = seasonResults.find((r) => r.item.id === 4);
check("冬装配半裙仍推荐(品类互补)", !!summerRec);
check("冬装配半裙无季节匹配理由", summerRec ? !summerRec.reasons.some((r) => r.includes("适穿")) : true);

// --- 状态 penalty ---
console.log("\n=== 状态 penalty ===");
const dirtyShirt = makeItem({ id: 5, name: "待洗衬衫", category: "tops", status: "laundry", colors: buildColorInfo("single", ["蓝"]) });
const dirtyResults = getRecommendedPairingItemsForItem(pants, [pants, dirtyShirt], []);
const dirtyRec = dirtyResults.find((r) => r.item.id === 5);
check("洗涤中仍推荐但有提示", dirtyRec ? dirtyRec.availabilityHint === "洗涤中" : true);

// --- Archived 不出现 ---
console.log("\n=== Archived 过滤 ===");
const archivedShoes = makeItem({ id: 6, name: "旧鞋", category: "shoes", status: "archived", colors: buildColorInfo("single", ["灰"]) });
const archivedResults = getRecommendedPairingItemsForItem(top, [top, archivedShoes], []);
check("archived 被过滤", !archivedResults.some((r) => r.item.id === 6));

// --- 共现统计 ---
console.log("\n=== 共现统计 ===");
const tee = makeItem({ id: 10, name: "黑T恤", category: "tops", colors: buildColorInfo("single", ["黑"]) });
const jeans = makeItem({ id: 11, name: "蓝牛仔", category: "pants", colors: buildColorInfo("single", ["牛仔蓝"]) });
const sneakers = makeItem({ id: 12, name: "运动鞋", category: "shoes", colors: buildColorInfo("single", ["白"]) });
const hat = makeItem({ id: 13, name: "棒球帽", category: "hats", colors: buildColorInfo("single", ["黑"]) });

const outfit1 = makeOutfit({ id: "o1", itemIds: [10, 11, 12], wornDates: [today] });
const outfit2 = makeOutfit({ id: "o2", itemIds: [10, 11], wornDates: [today] });
const outfit3 = makeOutfit({ id: "o3", itemIds: [10, 12, 13] });
const outfits = [outfit1, outfit2, outfit3];

const coocResults = getRecommendedPairingItemsForItem(tee, [tee, jeans, sneakers, hat], outfits);
check("共现: 推荐列包含 jeans", coocResults.some((r) => r.item.id === 11));
const jeansRec = coocResults.find((r) => r.item.id === 11);
check("jeans 共现统计 outfitCount=2", jeansRec ? jeansRec.outfitCount === 2 : false, jeansRec ? `outfitCount=${jeansRec.outfitCount}` : "");
check("jeans 有共现理由", jeansRec ? jeansRec.reasons.some((r) => r.includes("同套出现")) : false);

// --- 搭配过帽子 ---
const hatRec = coocResults.find((r) => r.item.id === 13);
check("帽子也推荐 (有搭档记录)", !!hatRec);

// --- getRelatedOutfitsForItem ---
console.log("\n=== getRelatedOutfitsForItem ===");
const related = getRelatedOutfitsForItem(10, outfits);
check("item-10 关联 3 个 outfit", related.length === 3);
check("包含 o1", related.some((o) => o.id === "o1"));
check("包含 o2", related.some((o) => o.id === "o2"));
check("包含 o3", related.some((o) => o.id === "o3"));

const unrelated = getRelatedOutfitsForItem(99, outfits);
check("不存在的 item → 空", unrelated.length === 0);

// --- 置信度分级 ---
console.log("\n=== 置信度分级 ===");
for (const r of coocResults) {
  check(`${r.item.name} confidence=${r.confidence} (score=${r.score})`, ["high", "medium", "low"].includes(r.confidence));
}

// --- 排序 ---
console.log("\n=== 排序 ===");
if (coocResults.length >= 2) {
  check("按 score 降序", coocResults[0].score >= coocResults[1]!.score);
}

// --- 结果数上限 ---
console.log("\n=== 结果数上限 ===");
const manyPants = Array.from({ length: 20 }, (_, i) =>
  makeItem({ id: 100 + i, name: `裤${i}`, category: "pants", colors: buildColorInfo("single", ["黑"]), styles: ["casual"] })
);
const manyResults = getRecommendedPairingItemsForItem(top, [top, ...manyPants], []);
check("默认上限 8", manyResults.length <= 8);

// --- Summary ---
console.log(`\n${"=".repeat(40)}`);
console.log(`Pass: ${pass}  Fail: ${fail}`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("All tests passed!");
