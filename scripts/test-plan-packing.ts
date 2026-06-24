// v1.1.0-dev: 打包清单逻辑单元测试
import type { OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem } from "../src/lib/types";
import { createOutfitCalendarPlan } from "../src/lib/outfit-planning";
import { buildPackingItemsFromPlan, groupPackingItemsByCategory, formatPackingDateUsage } from "../src/lib/plan-packing";
import { buildColorInfo } from "../src/lib/color-fields";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(`${name}${detail ? `: ${detail}` : ""}`); console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

const now = "2026-06-12T12:00:00.000Z";

// Sample data
const plan: OutfitCalendarPlan = createOutfitCalendarPlan({ type: "travel", title: "旅行", startDate: "2026-06-15", endDate: "2026-06-17", now });

const entries: OutfitPlanEntry[] = [
  { id: "e1", date: "2026-06-15", outfitId: "o1", status: "planned", createdAt: now, updatedAt: now },
  { id: "e2", date: "2026-06-16", outfitId: "o2", status: "planned", createdAt: now, updatedAt: now },
  { id: "e3", date: "2026-06-17", outfitId: "o1", status: "planned", createdAt: now, updatedAt: now }, // same outfit as day 1
];

const outfits: SavedOutfit[] = [
  { id: "o1", name: "通勤套装", itemIds: [1, 2], source: "manual", favorite: true, wornDates: [], createdAt: now, updatedAt: now },
  { id: "o2", name: "户外套装", itemIds: [2, 3], source: "manual", favorite: true, wornDates: [], createdAt: now, updatedAt: now },
];

const items: WardrobeItem[] = [
  { id: 1, name: "白衬衫", imageDataUrl: "data:1", category: "tops", colors: buildColorInfo("single", ["白"]), seasons: [], styles: [], formality: 3, warmth: 2, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
  { id: 2, name: "牛仔裤", imageDataUrl: "data:2", category: "pants", colors: buildColorInfo("single", ["蓝"]), seasons: [], styles: [], formality: 2, warmth: 2, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
  { id: 3, name: "冲锋衣", imageDataUrl: "data:3", category: "tops", colors: buildColorInfo("single", ["蓝"]), seasons: [], styles: [], formality: 1, warmth: 4, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
];

// --- buildPackingItemsFromPlan ---
console.log("\n=== buildPackingItemsFromPlan ===");
{
  const result = buildPackingItemsFromPlan({ calendarPlan: plan, entries, outfits, items, now });

  // Should have: item 1 (o1 day1+3), item 2 (o1 day1+3 + o2 day2), item 3 (o2 day2) + 3 rule items
  const wardrobeItems = result.filter((r) => r.source === "wardrobe");
  check("3 unique wardrobe items", wardrobeItems.length === 3, `got ${wardrobeItems.length}: ${wardrobeItems.map((r) => r.label).join(",")}`);

  const item1 = result.find((r) => r.itemId === 1);
  check("item 1 has dateKeys", item1?.dateKeys?.length === 2, `got ${item1?.dateKeys?.length}`);
  check("item 1 label = 白衬衫", item1?.label === "白衬衫");

  const item2 = result.find((r) => r.itemId === 2);
  check("item 2 appears in all 3 days", item2?.dateKeys?.length === 3, `got ${item2?.dateKeys?.length}`);

  const item3 = result.find((r) => r.itemId === 3);
  check("item 3 appears in 1 day", item3?.dateKeys?.length === 1);

  const ruleItems = result.filter((r) => r.source === "rule");
  check("3 rule items for travel", ruleItems.length === 3, `got ${ruleItems.length}`);
}

// --- buildPackingItemsFromPlan: empty entries ---
console.log("\n=== buildPackingItemsFromPlan: empty ===");
{
  const result = buildPackingItemsFromPlan({ calendarPlan: plan, entries: [], outfits, items, now });
  const wardrobeItems = result.filter((r) => r.source === "wardrobe");
  check("no wardrobe items with empty entries", wardrobeItems.length === 0);
  const ruleItems = result.filter((r) => r.source === "rule");
  check("still has rule items", ruleItems.length === 3);
}

// --- buildPackingItemsFromPlan: manual items preserved ---
console.log("\n=== buildPackingItemsFromPlan: manual preservation ===");
{
  const manualItems: PlanPackingChecklistItem[] = [
    { id: "m1", calendarPlanId: plan.id, source: "manual", label: "充电器", checked: true, createdAt: now, updatedAt: now },
  ];
  const result = buildPackingItemsFromPlan({ calendarPlan: plan, entries, outfits, items, existingChecklistItems: manualItems, now });
  const manuals = result.filter((r) => r.source === "manual");
  check("manual item preserved", manuals.length === 1);
  check("manual item checked state preserved", manuals[0]!.checked === true);
}

// --- buildPackingItemsFromPlan: checked state preserved ---
console.log("\n=== buildPackingItemsFromPlan: checked preservation ===");
{
  const existingChecked: PlanPackingChecklistItem[] = [
    { id: `packing-${plan.id}-wardrobe-1`, calendarPlanId: plan.id, source: "wardrobe", itemId: 1, label: "白衬衫", checked: true, createdAt: now, updatedAt: now },
  ];
  const result = buildPackingItemsFromPlan({ calendarPlan: plan, entries, outfits, items, existingChecklistItems: existingChecked, now });
  const item1 = result.find((r) => r.itemId === 1);
  check("item 1 checked preserved from existing", item1?.checked === true);
}

// --- buildPackingItemsFromPlan: custom plan no rule items ---
console.log("\n=== buildPackingItemsFromPlan: custom plan ===");
{
  const customPlan = createOutfitCalendarPlan({ type: "custom", title: "自定义", startDate: "2026-06-15", endDate: "2026-06-17", now });
  const result = buildPackingItemsFromPlan({ calendarPlan: customPlan, entries, outfits, items, now });
  const ruleItems = result.filter((r) => r.source === "rule");
  check("custom plan no rule items", ruleItems.length === 0);
}

// --- buildPackingItemsFromPlan: deleted outfit handling ---
console.log("\n=== buildPackingItemsFromPlan: deleted outfit ===");
{
  const entryWithDeletedOutfit: OutfitPlanEntry[] = [
    { id: "e4", date: "2026-06-15", outfitId: "deleted-outfit", status: "planned", createdAt: now, updatedAt: now },
  ];
  const result = buildPackingItemsFromPlan({ calendarPlan: plan, entries: entryWithDeletedOutfit, outfits, items, now });
  const wardrobeItems = result.filter((r) => r.source === "wardrobe");
  check("deleted outfit yields no wardrobe items", wardrobeItems.length === 0);
}

// --- groupPackingItemsByCategory ---
console.log("\n=== groupPackingItemsByCategory ===");
{
  const checklist: PlanPackingChecklistItem[] = [
    { id: "c1", calendarPlanId: plan.id, source: "wardrobe", itemId: 1, label: "白衬衫", category: "上装", checked: false, createdAt: now, updatedAt: now },
    { id: "c2", calendarPlanId: plan.id, source: "wardrobe", itemId: 2, label: "牛仔裤", category: "下装", checked: true, createdAt: now, updatedAt: now },
    { id: "c3", calendarPlanId: plan.id, source: "wardrobe", itemId: 3, label: "冲锋衣", category: "外套", checked: false, createdAt: now, updatedAt: now },
    { id: "c4", calendarPlanId: plan.id, source: "manual", label: "充电器", category: "手动新增", checked: false, createdAt: now, updatedAt: now },
  ];
  const groups = groupPackingItemsByCategory(checklist, items);
  check("4 groups", groups.length === 4);
  check("upper first", groups[0]!.category === "上装");
  // Within group: unchecked first
  const tops = groups[0]!.items;
  check("top group unchecked first", !tops[0]!.checked);
}

// --- formatPackingDateUsage ---
console.log("\n=== formatPackingDateUsage ===");
{
  check("3 dates", formatPackingDateUsage(["2026-06-15", "2026-06-16", "2026-06-17"]) === "6/15, 6/16, 6/17");
  check("single date", formatPackingDateUsage(["2026-06-12"]) === "6/12");
  check("empty", formatPackingDateUsage([]) === "");
  check("undefined", formatPackingDateUsage() === "");
}

// --- buildPackingItemsFromPlan: WornDates not written ---
console.log("\n=== wornDates not written ===");
{
  check("entry status=planned", entries[0]!.status === "planned");
  check("wardrobe item wornDates untouched", items[0]!.wornDates.length === 0);
}

// --- buildPackingItemsFromPlan: changed entry uses actualOutfitId ---
// v1.1 review fix: changed entry 默认只纳入 actualOutfitId（实际穿搭），
// 原 outfitId 不进入自动打包清单，避免同一日期重复。
console.log("\n=== buildPackingItemsFromPlan: changed entry ===");
{
  const changedEntries: OutfitPlanEntry[] = [
    // 6/15 原计划 o1（白衬衫+牛仔裤），实际穿了 o3（T恤+牛仔裤）
    { id: "ec1", date: "2026-06-15", outfitId: "o1", actualOutfitId: "o3", status: "changed", createdAt: now, updatedAt: now },
    { id: "ec2", date: "2026-06-15", outfitId: "o3", status: "worn", createdAt: now, updatedAt: now },
  ];
  const changedOutfits: SavedOutfit[] = [
    ...outfits,
    { id: "o3", name: "日常T恤", itemIds: [4, 2], source: "manual", favorite: false, wornDates: ["2026-06-15"], createdAt: now, updatedAt: now },
  ];
  const changedItems: WardrobeItem[] = [
    ...items,
    { id: 4, name: "白T恤", imageDataUrl: "data:4", category: "tops", colors: buildColorInfo("single", ["白"]), seasons: [], styles: [], formality: 2, warmth: 1, locationId: "home", status: "active", wornDates: ["2026-06-15"], createdAt: now, updatedAt: now },
  ];
  const result = buildPackingItemsFromPlan({
    calendarPlan: { ...plan, startDate: "2026-06-15", endDate: "2026-06-15" },
    entries: changedEntries,
    outfits: changedOutfits,
    items: changedItems,
    now,
  });
  const wardrobeItems = result.filter((r) => r.source === "wardrobe");
  // 应该只有 item 2 (牛仔裤) 和 item 4 (白T恤)。item 1 (白衬衫，原计划) 不应被纳入。
  const itemIds = wardrobeItems.map((r) => r.itemId).sort();
  check("changed entry 不纳入原计划单品", !itemIds.includes(1), `got itemIds=${itemIds.join(",")}`);
  check("changed entry 纳入 actual outfit 单品", itemIds.includes(2) && itemIds.includes(4), `got itemIds=${itemIds.join(",")}`);
  check("changed entry wardrobe 数量 = 2", wardrobeItems.length === 2, `got ${wardrobeItems.length}`);
}

// --- buildPackingItemsFromPlan: 一天多套 planned 不重复 ---
// v1.1 review fix: 同一天多套 planned/worn，按 itemId 去重，dateKeys 不重复添加同日。
console.log("\n=== buildPackingItemsFromPlan: dedupe ===");
{
  const dupEntries: OutfitPlanEntry[] = [
    { id: "ed1", date: "2026-06-15", outfitId: "o1", status: "planned", createdAt: now, updatedAt: now },
    { id: "ed2", date: "2026-06-15", outfitId: "o2", status: "planned", createdAt: now, updatedAt: now }, // 同一日期多套
  ];
  const result = buildPackingItemsFromPlan({
    calendarPlan: { ...plan, startDate: "2026-06-15", endDate: "2026-06-15" },
    entries: dupEntries,
    outfits,
    items,
    now,
  });
  const wardrobeItems = result.filter((r) => r.source === "wardrobe");
  // item 2 在两套里都用，应该只出现一次
  const item2 = wardrobeItems.find((r) => r.itemId === 2);
  check("同 item 多套不重复", wardrobeItems.length === 3, `got ${wardrobeItems.length}: ${wardrobeItems.map((r) => r.label).join(",")}`);
  check("item 2 dateKeys 只 1 天", item2?.dateKeys?.length === 1, `got ${item2?.dateKeys?.length}`);
}

// --- v1.1.4-dev: 模拟 syncPackingChecklistForPlan 的纯函数行为 ---
// syncPackingChecklistForPlan 内部就是: buildPackingItemsFromPlan(existing=当前清单)
// 再 db.transaction { delete + bulkPut }. 这里只测 buildPackingItemsFromPlan
// 在"反复同步"场景下的语义, 即二次同步后 manual/checked 都被保留, 同时
// 已经不在计划套装内的 wardrobe item 被移除。
console.log("\n=== syncPackingChecklistForPlan 语义模拟 ===");
{
  // 场景: 6/15 安排 o1 (item 1+2), 6/16 安排 o2 (item 2+3)
  // 6/15 替换成 o3 (item 2+4) → 同步后 item 1 应消失, item 4 应出现
  const baseEntries: OutfitPlanEntry[] = [
    { id: "es1", date: "2026-06-15", outfitId: "o1", status: "planned", createdAt: now, updatedAt: now },
    { id: "es2", date: "2026-06-16", outfitId: "o2", status: "planned", createdAt: now, updatedAt: now },
  ];
  const baseOutfits: SavedOutfit[] = [
    { id: "o1", name: "A", itemIds: [1, 2], source: "manual", favorite: false, wornDates: [], createdAt: now, updatedAt: now },
    { id: "o2", name: "B", itemIds: [2, 3], source: "manual", favorite: false, wornDates: [], createdAt: now, updatedAt: now },
    { id: "o3", name: "C", itemIds: [2, 4], source: "manual", favorite: false, wornDates: [], createdAt: now, updatedAt: now },
  ];
  const baseItems: WardrobeItem[] = [
    { id: 1, name: "白衬衫", imageDataUrl: "d:1", category: "tops", colors: buildColorInfo("single", ["白"]), seasons: [], styles: [], formality: 3, warmth: 2, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
    { id: 2, name: "牛仔裤", imageDataUrl: "d:2", category: "pants", colors: buildColorInfo("single", ["蓝"]), seasons: [], styles: [], formality: 2, warmth: 2, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
    { id: 3, name: "冲锋衣", imageDataUrl: "d:3", category: "tops", colors: buildColorInfo("single", ["蓝"]), seasons: [], styles: [], formality: 1, warmth: 4, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
    { id: 4, name: "皮鞋", imageDataUrl: "d:4", category: "shoes", colors: buildColorInfo("single", ["棕"]), seasons: [], styles: [], formality: 4, warmth: 1, locationId: "home", status: "active", wornDates: [], createdAt: now, updatedAt: now },
  ];

  // 第一次同步 (6/15 = o1, 6/16 = o2)
  const firstSync = buildPackingItemsFromPlan({
    calendarPlan: plan,
    entries: baseEntries,
    outfits: baseOutfits,
    items: baseItems,
    now,
  });
  const firstItemIds = new Set(firstSync.filter((ci) => ci.source === "wardrobe").map((ci) => ci.itemId));
  check("首次同步含 item 1 (白衬衫)", firstItemIds.has(1));
  check("首次同步含 item 2 (牛仔裤)", firstItemIds.has(2));
  check("首次同步含 item 3 (冲锋衣)", firstItemIds.has(3));
  check("首次同步不含 item 4 (皮鞋)", !firstItemIds.has(4));

  // 用户把 6/15 换成 o3
  const updatedEntries: OutfitPlanEntry[] = [
    { id: "es1b", date: "2026-06-15", outfitId: "o3", status: "planned", createdAt: now, updatedAt: now },
    { id: "es2", date: "2026-06-16", outfitId: "o2", status: "planned", createdAt: now, updatedAt: now },
  ];
  // 用户给 item 1 (白衬衫) 打了勾
  const existingWithChecked: PlanPackingChecklistItem[] = firstSync.map((ci) =>
    ci.itemId === 1 ? { ...ci, checked: true } : ci,
  );
  // 用户添加了 manual 物品
  const manualItem: PlanPackingChecklistItem = {
    id: `packing-${plan.id}-manual-charger`,
    calendarPlanId: plan.id,
    source: "manual",
    label: "充电器",
    category: "手动新增",
    quantity: 1,
    checked: false,
    createdAt: now,
    updatedAt: now,
  };

  // 第二次同步 (6/15 = o3, 6/16 = o2)
  const secondSync = buildPackingItemsFromPlan({
    calendarPlan: plan,
    entries: updatedEntries,
    outfits: baseOutfits,
    items: baseItems,
    existingChecklistItems: [...existingWithChecked, manualItem],
    now,
  });
  const secondItemIds = new Set(secondSync.filter((ci) => ci.source === "wardrobe").map((ci) => ci.itemId));
  check("二次同步不含已移除 item 1 (白衬衫)", !secondItemIds.has(1), `still in: ${Array.from(secondItemIds).join(",")}`);
  check("二次同步含新增 item 4 (皮鞋)", secondItemIds.has(4));
  check("二次同步保留 item 2 (牛仔裤)", secondItemIds.has(2));
  check("二次同步保留 item 3 (冲锋衣)", secondItemIds.has(3));

  // 勾选状态保留
  const item1After = secondSync.find((ci) => ci.itemId === 1);
  // item 1 已不在套装, 应该被移除 (不保留)
  check("item 1 不在结果中, 勾选状态随同消失", !item1After);

  // manual 物品保留
  const manuals = secondSync.filter((ci) => ci.source === "manual");
  check("manual 物品保留", manuals.length === 1 && manuals[0]!.label === "充电器");

  // 二次同步后, 重新添加 item 1 到某个 outfit, 验证 checked 状态被重置为 false
  // (因为 itemId 1 在上次清单中被打勾, 但已经被移除, 重新出现时按默认 false)
  const thirdEntries: OutfitPlanEntry[] = [
    { id: "es1c", date: "2026-06-15", outfitId: "o1", status: "planned", createdAt: now, updatedAt: now },
    { id: "es2", date: "2026-06-16", outfitId: "o2", status: "planned", createdAt: now, updatedAt: now },
  ];
  const thirdSync = buildPackingItemsFromPlan({
    calendarPlan: plan,
    entries: thirdEntries,
    outfits: baseOutfits,
    items: baseItems,
    existingChecklistItems: secondSync,
    now,
  });
  const item1Re = thirdSync.find((ci) => ci.itemId === 1);
  check("item 1 重新加入后, checked 默认 false", item1Re?.checked === false);
  check("item 1 重新加入后, dateKeys 重新收集", item1Re?.dateKeys?.includes("2026-06-15") ?? false);

  // 连续三次同步, manual 物品仍保留
  const manuals2 = thirdSync.filter((ci) => ci.source === "manual");
  check("三次同步后 manual 物品仍保留", manuals2.length === 1);
}

// --- SUMMARY ---
console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
