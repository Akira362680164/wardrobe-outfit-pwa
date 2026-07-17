import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CATEGORY_LABELS,
  COLOR_OPTIONS,
  COLOR_SWATCHES,
  GARMENT_CATEGORY_CATALOG,
  QWEATHER_VISUAL_CODES,
  QWEATHER_VISUAL_DICTIONARY,
  QWEATHER_VISUAL_SOURCE_SHA256,
} from "../packages/domain-catalog/src/index";
import {
  MINI_CATEGORY_CATALOG,
  MINI_CATEGORY_LABELS,
  MINI_COLOR_SWATCHES,
  MINI_SUBCATEGORY_LABELS,
  MINI_QWEATHER_VISUAL_CODES,
  MINI_QWEATHER_VISUAL_DICTIONARY,
  MINI_QWEATHER_VISUAL_SOURCE_SHA256,
} from "../apps/wechat-miniprogram/generated/catalogs";

const root = process.cwd();
const check = spawnSync("npm", ["run", "catalog:miniprogram:check"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);

assert.deepEqual(MINI_CATEGORY_CATALOG, GARMENT_CATEGORY_CATALOG);
assert.equal(MINI_CATEGORY_LABELS.hats, CATEGORY_LABELS.hats);
assert.equal(MINI_CATEGORY_LABELS.jewelry, CATEGORY_LABELS.jewelry);
assert.equal(MINI_CATEGORY_LABELS.tops, CATEGORY_LABELS.tops);
assert.equal(MINI_CATEGORY_LABELS.one_piece, CATEGORY_LABELS.one_piece);
assert.ok(COLOR_OPTIONS.every((color) => MINI_COLOR_SWATCHES[color]?.bg === COLOR_SWATCHES[color].bg));
assert.deepEqual(MINI_QWEATHER_VISUAL_CODES, QWEATHER_VISUAL_CODES);
assert.deepEqual(MINI_QWEATHER_VISUAL_DICTIONARY, QWEATHER_VISUAL_DICTIONARY);
assert.equal(MINI_QWEATHER_VISUAL_SOURCE_SHA256, QWEATHER_VISUAL_SOURCE_SHA256);

for (const group of GARMENT_CATEGORY_CATALOG) {
  for (const subcategory of group.subcategories) {
    assert.equal(MINI_SUBCATEGORY_LABELS[subcategory.id], subcategory.label);
  }
}

const miniprogramSources = [
  "apps/wechat-miniprogram/services/workspace.ts",
  "apps/wechat-miniprogram/pages/intake/review/index.ts",
  "apps/wechat-miniprogram/pages/wardrobe/index/index.ts",
  "apps/wechat-miniprogram/pages/wardrobe/edit/index.ts",
  "apps/wechat-miniprogram/pages/wishlist/edit/index.ts",
  "apps/wechat-miniprogram/services/category-catalog.ts",
].map((path) => readFileSync(join(root, path), "utf8")).join("\n");

assert.doesNotMatch(miniprogramSources, /上装|连衣装|鞋履/);
assert.doesNotMatch(miniprogramSources, /const\s+(?:CATEGORY_LABELS|COLOR_SWATCHES|SEASON_LABELS)\b/);
assert.doesNotMatch(miniprogramSources, /const\s+(?:SEASONS|STYLES|STATUSES)\s*=\s*\[/);
assert.doesNotMatch(miniprogramSources, /#1D2228|#F8FAFC/);
assert.match(miniprogramSources, /MINI_CATEGORY_CATALOG/);
assert.match(miniprogramSources, /MINI_COLOR_SWATCHES/);
assert.match(miniprogramSources, /subcategory/);

console.log("miniprogram catalog consistency tests passed");
