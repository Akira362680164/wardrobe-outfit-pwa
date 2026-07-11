import assert from "node:assert/strict";
import fs from "node:fs";

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
assert.match(composeWxml, /步骤 \{\{step\+1\}\} \/ 3/);
assert.match(composeWxml, /逐件确认/);
assert.match(composeWxml, /保存 \{\{selectedCount\}\} 件套装/);
assert.match(compose, /await fetchOutfitDetail\(created\.id\)/);
assert.match(compose, /draftMutationId/);
console.log("mini outfit and trip flow passed");
