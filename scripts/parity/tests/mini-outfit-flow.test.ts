import assert from "node:assert/strict";
import fs from "node:fs";
import {
  activeSelectableGarments,
  analyzeComposition,
  buildLocalOutfitDraft,
  filterGarments,
} from "../../../apps/wechat-miniprogram/pages/outfits/compose/logic";
import type { MiniGarment } from "../../../apps/wechat-miniprogram/services/workspace";

const trips = fs.readFileSync("apps/wechat-miniprogram/pages/trips/index/index.ts", "utf8");
const tripsWxml = fs.readFileSync("apps/wechat-miniprogram/pages/trips/index/index.wxml", "utf8");
const detail = fs.readFileSync("apps/wechat-miniprogram/pages/outfits/detail/index.ts", "utf8");
const detailWxml = fs.readFileSync("apps/wechat-miniprogram/pages/outfits/detail/index.wxml", "utf8");
const compose = fs.readFileSync("apps/wechat-miniprogram/pages/outfits/compose/index.ts", "utf8");
const composeWxml = fs.readFileSync("apps/wechat-miniprogram/pages/outfits/compose/index.wxml", "utf8");
const workspace = fs.readFileSync("apps/wechat-miniprogram/services/workspace.ts", "utf8");

assert.match(trips, /fetchPlanningSnapshot/);
assert.match(trips, /deleteCalendarPlan/);
for (const action of ["createPlan", "openPlan", "editPlan", "deletePlan"]) assert.match(tripsWxml, new RegExp(action));
assert.doesNotMatch(tripsWxml, /页面骨架|后续批次/);
assert.match(detailWxml, /信息/); assert.match(detailWxml, /单品/); assert.match(detailWxml, /实穿/); assert.match(detailWxml, /建议/);
assert.match(detail, /uploadPreparedImageAssets/); assert.match(detail, /kind: "remove"/); assert.match(detail, /updateOutfit/);
assert.match(workspace, /actualWornPhotos/);
assert.match(composeWxml, /步骤 \{\{step \+ 1\}\} \/ 2/);
assert.doesNotMatch(composeWxml, /\/ 3|图片 \/ AI|套装图片|拍照或从图库选择/);
assert.doesNotMatch(compose, /chooseImages|uploadPreparedImageAssets|请先在设置中填写 MiniMax Key/);
for (const text of ["选择衣物组成套装", "搜索名称、颜色或分类", "校对套装草稿", "组成完整度", "套装名称", "季节", "场景标签", "风格标签", "搭配标签", "备注"]) {
  assert.match(composeWxml, new RegExp(text));
}
assert.match(composeWxml, /保存 \{\{selectedCount\}\} 件套装/);
assert.match(compose, /await fetchOutfitDetail\(created\.id\)/);
assert.match(compose, /draftMutationId/);
assert.match(composeWxml, /ui-confirm-sheet/);
for (const field of ["styleTags", "pairingTags", "temperatureRange"]) {
  assert.match(workspace, new RegExp(field), `workspace createOutfit should persist ${field}`);
}

const activeTop = garment({ legacyItemId: 1, name: "蓝衬衫", category: "tops", categoryLabel: "上衣", styles: ["commute"], styleLabels: ["通勤"], seasons: ["spring"], locationId: "home" });
const activeShoes = garment({ legacyItemId: 2, name: "白鞋", category: "shoes", categoryLabel: "鞋", colorText: "白色", styles: ["casual"], styleLabels: ["休闲"], seasons: ["spring", "summer"], locationId: "travel" });
const archived = garment({ legacyItemId: 3, name: "归档外套", status: "archived" });
const selectable = activeSelectableGarments([activeTop, activeShoes, archived]);
assert.deepEqual(selectable.map((item) => item.legacyItemId), [1, 2], "only active garments enter outfit selection");
assert.deepEqual(filterGarments(selectable, "home", "all", "蓝").map((item) => item.legacyItemId), [1], "location and search filters keep matching garments");

const draft = buildLocalOutfitDraft(selectable);
assert.equal(draft.name, "蓝衬衫等2件");
assert.deepEqual(draft.seasons, ["spring", "summer"]);
assert.deepEqual(draft.styleTags, ["通勤", "休闲"]);
const composition = analyzeComposition(selectable);
assert.equal(composition.slots.find((slot) => slot.key === "top")?.present, true);
assert.equal(composition.slots.find((slot) => slot.key === "shoes")?.present, true);
console.log("mini outfit and trip flow passed");

function garment(overrides: Partial<MiniGarment>): MiniGarment {
  return {
    id: String(overrides.legacyItemId ?? 1),
    revision: 1,
    legacyItemId: 1,
    name: "测试衣物",
    category: "tops",
    categoryLabel: "上衣",
    subcategory: "",
    subcategoryLabel: "",
    locationId: "home",
    status: "active",
    statusText: "在用",
    colorsRaw: undefined,
    colorText: "蓝色",
    colorNames: ["蓝色"],
    cardColors: [],
    seasonsRaw: [],
    seasons: [],
    seasonLabels: [],
    wearSummary: "未穿过",
    seasonText: "未标注",
    stylesRaw: [],
    styles: [],
    styleLabels: [],
    temperatureRangeRaw: undefined,
    temperatureRange: {},
    material: "",
    fitRaw: undefined,
    fitGender: "unknown",
    fitGenderText: "未标注",
    fitNotes: "",
    imageUrl: "",
    updatedAt: "2026-07-12T00:00:00.000Z",
    createdAt: "2026-07-12T00:00:00.000Z",
    wornDates: [],
    ...overrides,
  };
}
