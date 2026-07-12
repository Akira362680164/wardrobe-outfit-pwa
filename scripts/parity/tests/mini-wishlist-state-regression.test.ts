import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("apps/wechat-miniprogram/services/workspace.ts", "utf8");
const indexTs = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/index/index.ts", "utf8");
const indexWxml = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/index/index.wxml", "utf8");
const detailTs = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/detail/index.ts", "utf8");
const detailWxml = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/detail/index.wxml", "utf8");
const editTs = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/edit/index.ts", "utf8");
const editWxml = fs.readFileSync("apps/wechat-miniprogram/pages/wishlist/edit/index.wxml", "utf8");

assert.match(workspace, /convertedGarmentMissing/);
assert.match(workspace, /statusCode\?: number/);
assert.match(detailWxml, /已转换的衣橱单品已被删除/);
assert.match(detailWxml, /convertedGarmentMissing/);
assert.match(detailTs, /toggleArchived/);
assert.match(detailTs, /openConvertedGarment/);
assert.match(detailWxml, /搭配与相似内容/);
assert.match(indexTs, /activeEvaluation/);
assert.match(indexWxml, /evaluationFilters/);
assert.match(editTs, /requestBack/);
assert.match(editWxml, /继续编辑/);
assert.match(editTs, /HttpError && error\.statusCode === 409/);
assert.match(editTs, /draftMutationId/);
assert.match(editTs, /clientMutationId: this\.data\.draftMutationId/);
assert.match(editWxml, /你的全部字段仍保留/);
console.log("mini wishlist state regression passed");
