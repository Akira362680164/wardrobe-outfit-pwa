import { recommendOutfits } from "../src/lib/recommendations";
import { normalizeGarmentTag } from "../src/lib/device-minimax";
import { buildColorInfo, getAccentColors, getPrimaryColors } from "../src/lib/color-fields";
import type { OutfitRequest, WardrobeItem } from "../src/lib/types";

const now = new Date().toISOString();

const items: WardrobeItem[] = [
  {
    id: 1,
    name: "白色衬衫",
    imageDataUrl: "",
    category: "tops",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["spring", "autumn", "all"],
    styles: ["commute", "dinner", "elegant"],
    formality: 4,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 2,
    name: "牛仔半裙",
    imageDataUrl: "",
    category: "skirts",
    colors: buildColorInfo("single", ["牛仔蓝"]),
    seasons: ["spring", "summer", "autumn"],
    styles: ["casual", "dinner"],
    formality: 2,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 3,
    name: "黑色乐福鞋",
    imageDataUrl: "",
    category: "shoes",
    colors: buildColorInfo("single", ["黑"]),
    seasons: ["all"],
    styles: ["commute", "dinner"],
    formality: 4,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 4,
    name: "珍珠项链",
    imageDataUrl: "",
    category: "jewelry",
    colors: buildColorInfo("single", ["白"]),
    seasons: ["all"],
    styles: ["elegant", "dinner"],
    formality: 3,
    warmth: 1,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  },
];

const request: OutfitRequest = {
  destination: "新餐厅",
  date: "2026-05-20",
  activity: "dinner",
  weather: "sunny",
  temperatureC: 23,
  stylePreference: "elegant",
  availableLocationIds: ["home"],
};

const result = recommendOutfits(items, request);

if (result.length === 0 || result[0].slots.length < 2) {
  throw new Error("Expected at least one usable recommendation with multiple slots");
}

if (result[0].packingReminders.some((reminder) => reminder.includes("不在可用地点"))) {
  throw new Error("Unexpected pickup reminder for available location");
}

if (!result[0].slots.some((slot) => slot.item.category === "jewelry")) {
  throw new Error("Expected dinner recommendation to include available jewelry accessory");
}

if (result[0].missingItems.some((missing) => missing.includes("帽子"))) {
  throw new Error("Unexpected missing hat warning when another accessory is available");
}

const legacyColorResult = normalizeGarmentTag(
  {
    candidateNames: ["拼色旅行箱"],
    category: "bags",
    colors: ["绿", "金", "黑"] as unknown as any,
    seasons: ["all"],
    styles: ["vacation"],
    formality: 2,
    warmth: 1,
    confidence: 0.82,
    needsReview: false,
  },
  "bag.png",
);

if (getPrimaryColors(legacyColorResult.colors)[0] !== "绿" || !getAccentColors(legacyColorResult.colors).includes("金")) {
  throw new Error("Expected legacy colors to split into primary and secondary colors");
}

const overfilledPrimaryResult = normalizeGarmentTag(
  {
    candidateNames: ["撞色外套"],
    category: "tops",
    primaryColors: ["蓝", "白", "红"],
    secondaryColors: [],
    seasons: ["spring"],
    styles: ["casual"],
    formality: 2,
    warmth: 3,
    confidence: 0.8,
    needsReview: false,
  },
  "coat.png",
);

if (getPrimaryColors(overfilledPrimaryResult.colors).length !== 1 || getAccentColors(overfilledPrimaryResult.colors).length < 2) {
  throw new Error("Expected overfilled primaryColors to be split when secondaryColors is empty");
}

const stringAccentColorResult = normalizeGarmentTag(
  {
    candidateNames: ["拼色衬衫"],
    category: "tops",
    main_colors: ["蓝"],
    accent_colors: "白色、金色",
    seasons: ["spring"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    confidence: 0.8,
    needsReview: false,
  },
  "shirt.png",
);

if (!getAccentColors(stringAccentColorResult.colors).includes("白") || !getAccentColors(stringAccentColorResult.colors).includes("金")) {
  throw new Error("Expected string accent colors to be normalized into secondary colors");
}

// === 分支覆盖 (v0.9.15 补) ===

// 1. 空衣橱路径 → 返回单条 emptyRecommendation
const emptyResult = recommendOutfits([], { ...request, destination: "测试空" });
if (emptyResult.length !== 1 || emptyResult[0].id !== "empty" || emptyResult[0].slots.length !== 0) {
  throw new Error("Expected empty wardrobe to return single emptyRecommendation");
}
if (emptyResult[0].missingItems.length === 0) {
  throw new Error("Expected emptyRecommendation to surface missingItems hint");
}

// 2. availableLocationIds 过滤: 把全部 item.locationId = "other" 后应只剩 emptyRecommendation
const offLocationItems: WardrobeItem[] = items.map((item) => ({ ...item, id: item.id, locationId: "other" }));
const filteredResult = recommendOutfits(offLocationItems, { ...request, availableLocationIds: ["home"] });
if (filteredResult.length !== 1 || filteredResult[0].id !== "empty") {
  throw new Error("Expected items in unavailable location to be filtered out and yield emptyRecommendation");
}

// 3. weather=rainy 触发"今天有雨" 提示
const rainyShellItem: WardrobeItem = {
  id: 99,
  name: "黑色冲锋衣",
  imageDataUrl: "",
  category: "tops",
  colors: buildColorInfo("single", ["黑"]),
  seasons: ["all"],
  styles: ["commute", "outdoor"],
  formality: 2,
  warmth: 4,
  locationId: "home",
  status: "active",
  wornDates: [],
  createdAt: now,
  updatedAt: now,
};
const rainyResult = recommendOutfits([...items, rainyShellItem], { ...request, weather: "rainy" });
if (!rainyResult[0].packingReminders.some((reminder) => reminder.includes("今天有雨"))) {
  throw new Error("Expected rainy weather to surface rain reminder");
}

// 4. temperatureC=10 应仍能生成可穿套装并避开不存在的旧 outerwear 槽
const coldResult = recommendOutfits([...items, rainyShellItem], { ...request, temperatureC: 10 });
if (coldResult[0].slots.length === 0) {
  throw new Error("Expected cold weather (10C) to still produce outfit slots");
}

// 6. item.status="laundry" 应被过滤
const laundryItem: WardrobeItem = { ...items[0], id: 100, status: "laundry" };
const laundryResult = recommendOutfits([laundryItem, ...items.slice(1)], request);
if (laundryResult[0].slots.some((slot) => slot.item.id === 100)) {
  throw new Error("Expected laundry status item to be filtered out of recommendation");
}

console.log(`recommendation logic ok: ${result[0].title}`);
