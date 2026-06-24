import {
  CATEGORY_LABELS,
  type FitGender,
  type GarmentCategory,
  type GarmentFitGender,
  type OutfitRecommendation,
  type OutfitRequest,
  type Season,
  type TryOnProfile,
  type WardrobeItem,
} from "@/lib/types";
import { getAllColors } from "@/lib/color-fields";

const COLD_TEMP = 14;
const HOT_TEMP = 27;
const COLOR_GROUPS = [
  ["黑", "白", "灰"],
  ["蓝", "牛仔蓝", "白", "灰"],
  ["棕", "米", "白", "绿"],
  ["红", "粉", "白", "黑", "灰"],
  ["紫", "白", "灰", "黑"],
  ["黄", "蓝", "白", "棕"],
];
const ACCESSORY_CATEGORIES: GarmentCategory[] = ["hats", "jewelry", "accessories"];

export interface RecommendOutfitsOptions {
  /** 用户的穿衣画像；用于 fitGender 轻量打分（不影响无 profile 时的旧逻辑）。 */
  tryOnProfile?: TryOnProfile;
}

export function recommendOutfits(
  items: WardrobeItem[],
  request: OutfitRequest,
  options?: RecommendOutfitsOptions,
): OutfitRecommendation[] {
  const activeItems = items.filter(
    (item) => item.status === "active" && request.availableLocationIds.includes(item.locationId),
  );

  const season = seasonFromTemperature(request.temperatureC);
  const profileFitGender = options?.tryOnProfile?.fitGender;
  const scored = activeItems
    .map((item) => ({ item, score: scoreItem(item, request, season) }))
    .map(({ item, score }) => ({ item, score: score + fitGenderScore(item.fitGender, profileFitGender) }))
    .sort((a, b) => b.score - a.score);

  const byCategory = groupByCategory(scored.map(({ item }) => item));
  const outfitSeeds = buildOutfitSeeds(byCategory, request);

  const recommendations = outfitSeeds
    .map((seed, index) => buildRecommendation(seed, byCategory, request, index))
    .filter((recommendation) => recommendation.slots.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return recommendations.length > 0 ? recommendations : [emptyRecommendation(request)];
}

function seasonFromTemperature(temperatureC: number): Season {
  if (temperatureC <= COLD_TEMP) return "winter";
  if (temperatureC >= HOT_TEMP) return "summer";
  if (temperatureC >= 20) return "spring";
  return "autumn";
}

function scoreItem(item: WardrobeItem, request: OutfitRequest, season: Season) {
  let score = 0;
  if (item.seasons.includes("all") || item.seasons.includes(season)) score += 28;
  if (styleMatches(item.styles, request.activity)) score += 24;
  if (styleMatches(item.styles, request.stylePreference)) score += 20;
  const warmth = item.warmth ?? 3;
  const formality = item.formality ?? 3;
  if (Math.abs(warmth - targetWarmth(request.temperatureC)) <= 1) score += 16;
  if (Math.abs(formality - targetFormality(request.activity)) <= 1) score += 12;
  if (request.weather === "rainy" && item.category === "shoes") score += 6;
  return score;
}

function styleMatches(styles: string[], target: string) {
  return styles.includes(target);
}

/**
 * v0.9.22: fitGender 轻量打分。
 *  - 用户为 menswear:   menswear / unisex 衣物 +3, womenswear -2, unknown 不变
 *  - 用户为 womenswear: womenswear / unisex 衣物 +3, menswear -2, unknown 不变
 *  - 用户为 unisex:     unisex +3, 其它 0
 *  - 用户为 unspecified / 缺省: 不做惩罚
 *  - unknown 衣物不惩罚 (老数据)
 */
function fitGenderScore(itemFit: GarmentFitGender | undefined, userFit: FitGender | undefined): number {
  if (!userFit || userFit === "unspecified") return 0;
  const itemKind = itemFit ?? "unknown";
  if (userFit === "menswear") {
    if (itemKind === "menswear") return 3;
    if (itemKind === "unisex") return 3;
    if (itemKind === "womenswear") return -2;
    return 0; // unknown
  }
  if (userFit === "womenswear") {
    if (itemKind === "womenswear") return 3;
    if (itemKind === "unisex") return 3;
    if (itemKind === "menswear") return -2;
    return 0;
  }
  if (userFit === "unisex") {
    if (itemKind === "unisex") return 3;
    return 0;
  }
  return 0;
}

function targetWarmth(temperatureC: number) {
  if (temperatureC <= COLD_TEMP) return 5;
  if (temperatureC >= HOT_TEMP) return 1;
  return 3;
}

function targetFormality(activity: OutfitRequest["activity"]) {
  if (activity === "commute") return 4;
  if (activity === "dinner" || activity === "elegant") return 3;
  if (activity === "outdoor" || activity === "vacation") return 2;
  return 2;
}

function groupByCategory(items: WardrobeItem[]) {
  return items.reduce(
    (result, item) => {
      result[item.category].push(item);
      return result;
    },
    {
      tops: [],
      pants: [],
      skirts: [],
      one_piece: [],
      shoes: [],
      bags: [],
      hats: [],
      jewelry: [],
      accessories: [],
    } as Record<GarmentCategory, WardrobeItem[]>,
  );
}

function buildOutfitSeeds(byCategory: Record<GarmentCategory, WardrobeItem[]>, request: OutfitRequest) {
  const accessories = availableAccessoriesFor(byCategory, request);
  const withAccessories = (seed: Array<GarmentCategory | null>, offset: number) => [
    ...seed,
    ...rotateAccessories(accessories, offset).slice(0, 2),
  ];

  const bottomChoice: GarmentCategory = byCategory.pants.length >= byCategory.skirts.length ? "pants" : "skirts";

  return [
    withAccessories(["tops", bottomChoice, "shoes", "bags"], 0),
    withAccessories(["one_piece", "shoes", "bags"], 1),
    withAccessories(["tops", bottomChoice === "pants" ? "skirts" : "pants", "shoes"], 2),
  ]
    .map((seed) => seed.filter(Boolean) as GarmentCategory[])
    .filter((seed) => seed.some((category) => byCategory[category].length > 0));
}

function availableAccessoriesFor(
  byCategory: Record<GarmentCategory, WardrobeItem[]>,
  request: OutfitRequest,
): GarmentCategory[] {
  const available = new Set(ACCESSORY_CATEGORIES.filter((category) => byCategory[category].length > 0));
  return accessoryPriorityFor(request).filter((category) => available.has(category));
}

function accessoryPriorityFor(request: OutfitRequest): GarmentCategory[] {
  if (request.activity === "outdoor" || request.activity === "vacation") {
    return ["hats", "accessories", "jewelry"];
  }

  if (request.activity === "dinner" || request.activity === "elegant" || request.stylePreference === "elegant") {
    return ["jewelry", "accessories", "hats"];
  }

  if (request.activity === "commute") {
    return ["jewelry", "accessories", "hats"];
  }

  return ["hats", "jewelry", "accessories"];
}

function rotateAccessories(accessories: GarmentCategory[], offset: number) {
  if (accessories.length <= 1) return accessories;
  const normalizedOffset = offset % accessories.length;
  return [...accessories.slice(normalizedOffset), ...accessories.slice(0, normalizedOffset)];
}

function buildRecommendation(
  seed: GarmentCategory[],
  byCategory: Record<GarmentCategory, WardrobeItem[]>,
  request: OutfitRequest,
  index: number,
): OutfitRecommendation {
  const usedIds = new Set<number | undefined>();
  const slots = seed
    .map((category) => {
      const selected = pickCompatibleItem(byCategory[category], usedIds);
      if (!selected) return null;
      usedIds.add(selected.id);
      return { role: CATEGORY_LABELS[category] as OutfitRecommendation["slots"][number]["role"], item: selected };
    })
    .filter(Boolean) as OutfitRecommendation["slots"];

  const missingItems = seed
    .filter((category) => byCategory[category].length === 0)
    .map((category) => `缺少可用的${CATEGORY_LABELS[category]}`);

  const score = slots.reduce(
    (sum, slot) => sum + (slot.item.formality ?? 3) + (slot.item.warmth ?? 3),
    0,
  ) + colorScore(slots);
  const reminders = slots
    .filter((slot) => !request.availableLocationIds.includes(slot.item.locationId))
    .map((slot) => `${slot.item.name} 不在可用地点，需要提前拿`);

  if (request.weather === "rainy") {
    reminders.push("今天有雨，建议带防水鞋或伞");
  }

  return {
    id: `outfit-${index + 1}`,
    title: recommendationTitle(request, index),
    score,
    slots,
    missingItems,
    packingReminders: reminders,
    reasons: [
      `匹配「${request.destination || "目的地"}」和${request.temperatureC}度的温度`,
      `优先选择${request.availableLocationIds.length}个可用地点内的衣服`,
      "已避开待洗、待修和暂不穿的衣服",
    ],
  };
}

function pickCompatibleItem(items: WardrobeItem[], usedIds: Set<number | undefined>) {
  return items.find((item) => !usedIds.has(item.id)) ?? items[0];
}

function colorScore(slots: OutfitRecommendation["slots"]) {
  const colors = slots.flatMap((slot) => getAllColors(slot.item.colors));
  if (colors.length <= 1) return 8;
  return COLOR_GROUPS.some((group) => colors.every((color) => group.includes(color))) ? 12 : 4;
}

function recommendationTitle(request: OutfitRequest, index: number) {
  const prefix = ["稳妥好穿", "更出片", "轻便备选"][index] ?? "备选";
  return `${prefix} · ${request.destination || "今日出门"}`;
}

function emptyRecommendation(request: OutfitRequest): OutfitRecommendation {
  return {
    id: "empty",
    title: "衣橱数据不足",
    score: 0,
    slots: [],
    reasons: [`当前可用地点里没有可穿衣服，无法为「${request.destination || "这次出门"}」生成搭配`],
    missingItems: ["请先录入至少 1 件可穿衣服，并确认地点在本次可用范围内"],
    packingReminders: [],
  };
}
