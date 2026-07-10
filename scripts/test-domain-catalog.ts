import { strict as assert } from "node:assert";

import {
  COLOR_ALIAS_MAP,
  COLOR_CATALOG,
  COLOR_OPTIONS,
  COLOR_SWATCHES,
  GARMENT_CATEGORY_CATALOG,
  GARMENT_CATEGORY_IDS,
  SEASON_VALUES,
  STYLE_VALUES,
  mapLegacyCategoryToCatalogGroup,
  normalizeGarmentCategory,
  normalizeSeasonList,
  normalizeStyleList,
  normalizeSubcategoryForCategory,
  normalizeSystemColorValue,
} from "../packages/domain-catalog/src/index";

assert.equal(COLOR_CATALOG.length, COLOR_OPTIONS.length, "color options must derive from the catalog");
assert.equal(new Set(COLOR_OPTIONS).size, COLOR_OPTIONS.length, "color options must be unique");
assert.equal(new Set(Object.keys(COLOR_ALIAS_MAP)).size, Object.keys(COLOR_ALIAS_MAP).length, "color aliases must be unique");
assert.ok(COLOR_OPTIONS.every((color) => COLOR_SWATCHES[color]?.bg), "every color must have a swatch");

assert.equal(new Set(GARMENT_CATEGORY_IDS).size, GARMENT_CATEGORY_IDS.length, "category ids must be unique");
assert.deepEqual(
  GARMENT_CATEGORY_CATALOG.map((group) => group.id),
  [...GARMENT_CATEGORY_IDS],
  "category ids and catalog order must match",
);

const globalSubcategoryIds = GARMENT_CATEGORY_CATALOG.flatMap((group) => {
  const ids = group.subcategories.map((subcategory) => subcategory.id);
  assert.equal(new Set(ids).size, ids.length, `${group.id} subcategory ids must be unique`);
  return ids;
});
assert.equal(new Set(globalSubcategoryIds).size, globalSubcategoryIds.length, "subcategory ids must be globally unique");

assert.deepEqual(SEASON_VALUES, ["spring", "summer", "autumn", "winter", "all"]);
assert.deepEqual(STYLE_VALUES, ["casual", "sweet", "elegant", "commute", "outdoor", "dinner", "vacation"]);
assert.equal(mapLegacyCategoryToCatalogGroup("top"), "tops");
assert.equal(mapLegacyCategoryToCatalogGroup("bottom"), "pants");
assert.equal(normalizeGarmentCategory("outerwear"), "tops");
assert.equal(normalizeGarmentCategory("unknown"), null);
assert.equal(normalizeSubcategoryForCategory("tops", "shirt"), "shirt");
assert.equal(normalizeSubcategoryForCategory("pants", "shirt"), undefined);
assert.deepEqual(normalizeSeasonList(["summer", "invalid", "summer"]), ["summer"]);
assert.deepEqual(normalizeStyleList(["casual", "invalid", "casual"]), ["casual"]);
assert.equal(normalizeSystemColorValue("黑色"), "黑");
assert.equal(normalizeSystemColorValue("丹宁蓝"), "牛仔蓝");
assert.equal(normalizeSystemColorValue("不存在颜色"), null);

console.log("domain catalog tests passed");
