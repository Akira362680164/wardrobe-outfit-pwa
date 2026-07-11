import assert from "node:assert/strict";
import fs from "node:fs";

const app = JSON.parse(fs.readFileSync("apps/wechat-miniprogram/app.json", "utf8"));
const indexTs = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/index/index.ts", "utf8");
const indexWxml = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/index/index.wxml", "utf8");
const search = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/search/index.ts", "utf8");
const stats = fs.readFileSync("apps/wechat-miniprogram/pages/wardrobe/statistics/index.ts", "utf8");
const card = fs.readFileSync("apps/wechat-miniprogram/components/domain/catalog-card/index.wxml", "utf8");

for (const page of ["pages/wardrobe/search/index", "pages/wardrobe/statistics/index"]) assert.ok(app.pages.includes(page));
assert.doesNotMatch(indexTs, /搜索暂未开放/);
assert.match(search, /searchHistory/);
assert.match(search, /locationId === this\.data\.scope/);
assert.match(search, /item\.category === this\.data\.category/);
assert.match(stats, /usageRate/);
assert.match(stats, /idle/);
assert.match(card, /bindlongpress="onLongPress"/);
assert.match(indexTs, /confirmBatchDelete/);
assert.match(indexTs, /deleteWorkspaceEntity/);
assert.match(indexTs, /await this\.loadGarments\(\)/);
for (const state of ["diagnosisLoading", "diagnosisExpanded", "diagnosisError", "closeDiagnosis", "runDiagnosis"]) assert.match(indexTs + indexWxml, new RegExp(state));
console.log("mini wardrobe regression passed");
