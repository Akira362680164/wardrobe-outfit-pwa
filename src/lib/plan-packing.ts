// v1.1.0-dev 穿搭计划: 打包清单自动生成

import type { OutfitCalendarPlan, OutfitPlanEntry, PlanPackingChecklistItem, SavedOutfit, WardrobeItem } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { enumerateDateRange } from "@/lib/outfit-calendar";

export interface PackingCategoryGroup {
  category: string;
  items: PlanPackingChecklistItem[];
}

const PACKING_CATEGORY_ORDER: Record<string, number> = {
  "上装": 1,
  "下装": 2,
  "连衣裙": 3,
  "外套": 4,
  "鞋": 5,
  "包": 6,
  "帽子": 7,
  "配饰": 8,
  "建议携带": 9,
  "手动新增": 10,
  "其他": 11,
};

export function buildPackingItemsFromPlan(input: {
  calendarPlan: OutfitCalendarPlan;
  entries: OutfitPlanEntry[];
  outfits: SavedOutfit[];
  items: WardrobeItem[];
  existingChecklistItems?: PlanPackingChecklistItem[];
  now?: string;
}): PlanPackingChecklistItem[] {
  const { calendarPlan, entries, outfits, items, existingChecklistItems, now } = input;
  const nowISO = now ?? new Date().toISOString();

  // Preserve manual items and existing checked state when packing is disabled
  const existingManual = (existingChecklistItems ?? []).filter((ci) => ci.source === "manual");

  if (!calendarPlan.packingEnabled) {
    return existingManual;
  }

  const dateRange = enumerateDateRange(calendarPlan.startDate, calendarPlan.endDate);
  const outfitMap = new Map(outfits.map((o) => [o.id, o]));
  const itemMap = new Map<number, WardrobeItem>();
  for (const item of items) {
    if (typeof item.id === "number") itemMap.set(item.id, item);
  }

  // Collect wardrobe items across all dates.
  // v1.1 review fix:
  // - 一天可能有多套 planned/worn/changed entry，按全部 entry 收集（不再只读单条）。
  // - changed entry 默认只纳入 actualOutfitId 对应的实际穿搭，避免原计划 + 实际穿搭重复纳入。
  // - 物品按 itemId 去重，同 item 跨多天共用同一 checklist 条目，dateKeys 收集所有使用日期。
  const itemDateMap = new Map<number, string[]>();
  for (const date of dateRange) {
    const dayEntries = entries.filter((e) => e.date === date && (e.calendarPlanId === calendarPlan.id || !e.calendarPlanId));
    for (const entry of dayEntries) {
      // 决定本 entry 用于打包清单的目标 outfitId
      let targetOutfitId: string | undefined;
      if (entry.status === "changed") {
        targetOutfitId = entry.actualOutfitId;
      } else {
        targetOutfitId = entry.outfitId;
      }
      if (!targetOutfitId) continue;
      const outfit = outfitMap.get(targetOutfitId);
      if (!outfit) continue;
      for (const itemId of outfit.itemIds) {
        const existing = itemDateMap.get(itemId);
        if (existing) {
          if (!existing.includes(date)) existing.push(date);
        } else {
          itemDateMap.set(itemId, [date]);
        }
      }
    }
  }

  // Build existing lookup
  const existingRule = (existingChecklistItems ?? []).filter((ci) => ci.source === "rule" || ci.source === "ai");
  const existingChecked = new Map<string, boolean>();
  for (const ci of (existingChecklistItems ?? [])) {
    if (ci.itemId != null) existingChecked.set(`wardrobe-${ci.itemId}`, ci.checked);
  }

  // Build wardrobe items
  const result: PlanPackingChecklistItem[] = [];

  for (const [itemId, dateKeys] of itemDateMap) {
    const item = itemMap.get(itemId);
    if (!item) continue;
    const id = `packing-${calendarPlan.id}-wardrobe-${itemId}`;
    result.push({
      id,
      calendarPlanId: calendarPlan.id,
      source: "wardrobe",
      itemId,
      label: item.name,
      category: CATEGORY_LABELS[item.category] ?? "其他",
      quantity: 1,
      dateKeys,
      checked: existingChecked.get(`wardrobe-${itemId}`) ?? false,
      sortOrder: 0,
      createdAt: nowISO,
      updatedAt: nowISO,
    });
  }

  // Add rule items for travel/business (only if no existing rule items)
  if ((calendarPlan.type === "travel" || calendarPlan.type === "business") && existingRule.length === 0) {
    const days = dateRange.length;
    if (days >= 2) {
      result.push({
        id: `packing-${calendarPlan.id}-rule-charger`,
        calendarPlanId: calendarPlan.id,
        source: "rule",
        label: "充电器",
        category: "建议携带",
        quantity: 1,
        checked: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
      result.push({
        id: `packing-${calendarPlan.id}-rule-toiletry`,
        calendarPlanId: calendarPlan.id,
        source: "rule",
        label: "洗漱包",
        category: "建议携带",
        quantity: 1,
        checked: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
      result.push({
        id: `packing-${calendarPlan.id}-rule-umbrella`,
        calendarPlanId: calendarPlan.id,
        source: "rule",
        label: "雨伞",
        category: "建议携带",
        quantity: 1,
        checked: false,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
    }
  } else {
    result.push(...existingRule);
  }

  // Add manual items
  result.push(...existingManual);

  return result;
}

export function groupPackingItemsByCategory(items: PlanPackingChecklistItem[], _wardrobeItems: WardrobeItem[]): PackingCategoryGroup[] {
  const groups = new Map<string, PlanPackingChecklistItem[]>();
  for (const item of items) {
    const cat = item.category ?? "其他";
    const list = groups.get(cat) ?? [];
    list.push(item);
    groups.set(cat, list);
  }

  // Sort within each group: unchecked first, then checked
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      if (a.source === "manual" && b.source !== "manual") return 1;
      if (b.source === "manual" && a.source !== "manual") return -1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }

  return Array.from(groups.entries())
    .sort((a, b) => (PACKING_CATEGORY_ORDER[a[0]] ?? 11) - (PACKING_CATEGORY_ORDER[b[0]] ?? 11))
    .map(([category, catItems]) => ({ category, items: catItems }));
}

export function formatPackingDateUsage(dateKeys?: string[]): string {
  if (!dateKeys || dateKeys.length === 0) return "";
  return dateKeys.map((d) => {
    const parts = d.split("-");
    return `${parseInt(parts[1]!, 10)}/${parseInt(parts[2]!, 10)}`;
  }).join(", ");
}
