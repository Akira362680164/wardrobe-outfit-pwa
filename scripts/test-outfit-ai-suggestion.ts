import { strict as assert } from "node:assert";
import {
  buildLocalOutfitAiSuggestion,
  getReplacementCandidatesForOutfitItem,
  sanitizeOutfitAiSuggestion,
} from "../src/lib/outfit-ai-suggestion";
import {
  buildOutfitAiSuggestionPrompt,
  buildOutfitAiSuggestionSystemPrompt,
  parseOutfitAiSuggestionJson,
} from "../src/lib/outfit-ai-prompt";
import { buildColorInfo } from "../src/lib/color-fields";
import type { SavedOutfit, WardrobeItem } from "../src/lib/types";

const now = "2026-06-11T08:00:00.000Z";

function item(id: number, name: string, category: WardrobeItem["category"], color: string): WardrobeItem {
  return {
    id,
    name,
    imageDataUrl: `data:image/png;base64,${id}`,
    thumbnailDataUrl: `data:image/png;base64,t${id}`,
    category,
    colors: buildColorInfo("single", [color]),
    seasons: ["spring", "autumn"],
    styles: ["commute"],
    formality: 4,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: now,
    updatedAt: now,
  };
}

const shirt = item(1, "白衬衫", "tops", "白");
const pants = item(2, "黑西裤", "pants", "黑");
const altShirt = item(3, "蓝衬衫", "tops", "蓝");
const altPants = item(4, "灰西裤", "pants", "灰");
const archived = { ...item(5, "旧衬衫", "tops", "白"), status: "archived" as const };
const allItems = [shirt, pants, altShirt, altPants, archived];

const outfit: SavedOutfit = {
  id: "outfit-1",
  name: "通勤套装",
  itemIds: [1, 2],
  source: "manual",
  favorite: true,
  seasons: ["spring", "autumn"],
  sceneTags: ["通勤"],
  styleTags: ["简约"],
  temperatureRange: { minC: 16, maxC: 24 },
  wornDates: [],
  createdAt: now,
  updatedAt: now,
};

const local = buildLocalOutfitAiSuggestion({ outfit, outfitItems: [shirt, pants], allItems, generatedAt: now });
assert.equal(local.source, "local", "本地兜底应标注 source=local");
assert.ok(local.summary.includes("通勤"), "本地摘要应包含场景");
assert.ok(local.replacementSuggestions.length > 0, "本地兜底应给出可用替换候选");
assert.ok(local.replacementSuggestions.every((entry) => entry.suggestedItemIds.every((id) => !outfit.itemIds.includes(id))), "替换候选不能包含套装内已有衣物");

const candidates = getReplacementCandidatesForOutfitItem({ originalItem: shirt, outfit, allItems });
assert.ok(candidates.some((candidate) => candidate.item.id === altShirt.id), "同类替换候选应保留");
assert.ok(!candidates.some((candidate) => candidate.item.id === archived.id), "归档衣物不能作为替换候选");

const sanitized = sanitizeOutfitAiSuggestion({
  raw: {
    summary: "适合 16-24℃ 通勤。",
    suitableScenes: ["通勤", "轻正式"],
    unsuitableScenes: ["户外长走"],
    strengths: ["色系统一"],
    risks: ["缺少亮点"],
    replacementSuggestions: [
      { originalItemId: 1, suggestedItemIds: [2, 3, 999, 3], reason: "换蓝衬衫更轻松" },
      { originalItemId: 999, suggestedItemIds: [4], reason: "非法 original" },
      { originalItemId: 2, suggestedItemIds: [1], reason: "不能建议套装内衣物" },
    ],
    missingItems: ["浅色包"],
  },
  validItemIds: new Set(allItems.map((i) => i.id!)),
  outfitItemIds: new Set(outfit.itemIds),
  allowedReplacementItemIdsByOriginal: new Map([
    [1, new Set([3])],
    [2, new Set([4])],
  ]),
  source: "ai",
  generatedAt: now,
});
assert.equal(sanitized.source, "ai", "AI 清洗保留 source");
assert.deepEqual(sanitized.replacementSuggestions[0]?.suggestedItemIds, [3], "非法 ID、重复 ID、套装内 ID 都要过滤");
assert.equal(sanitized.replacementSuggestions.length, 1, "非法 replacement 要丢弃");

const prompt = buildOutfitAiSuggestionPrompt({
  outfit,
  outfitItems: [shirt, pants],
  replacementCandidatesByItem: [{ originalItem: shirt, candidates }],
});
assert.ok(prompt.includes("白名单"), "prompt 必须包含 itemId 白名单");
assert.ok(prompt.includes("不要返回套装内已有 itemId"), "prompt 必须约束替换建议");
assert.ok(buildOutfitAiSuggestionSystemPrompt().includes("不要编造"), "system prompt 必须禁止编造");
assert.deepEqual(parseOutfitAiSuggestionJson("```json\n{\"summary\":\"ok\"}\n```"), { summary: "ok" }, "解析应支持 markdown 包裹 JSON");

console.log("outfit ai suggestion tests passed");
