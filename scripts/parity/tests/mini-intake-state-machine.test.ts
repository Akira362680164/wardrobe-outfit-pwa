import assert from "node:assert/strict";
import fs from "node:fs";

const cameraTs = fs.readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.ts", "utf8");
const cameraWxml = fs.readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.wxml", "utf8");
const reviewTs = fs.readFileSync("apps/wechat-miniprogram/pages/intake/review/index.ts", "utf8");
const app = JSON.parse(fs.readFileSync("apps/wechat-miniprogram/app.json", "utf8"));

assert.doesNotMatch(cameraTs, /await this\.prepareAssets\(items\)/, "selection must remain local");
assert.match(cameraTs, /await this\.prepareAssets\(selected\)/);
assert.match(cameraTs, /await this\.recognizeBeforeReview\(\)/);
const reviewFlow = cameraTs.slice(cameraTs.indexOf("async goReview"), cameraTs.indexOf("async recognizeBeforeReview"));
assert.ok(reviewFlow.includes("await this.recognizeBeforeReview()"));
assert.ok(reviewFlow.indexOf("recognizeBeforeReview") < reviewFlow.indexOf("wx.navigateTo"));
for (const action of ["editCurrent", "removeCurrent", "clearSelected", "chooseFromCamera", "chooseFromAlbum"]) assert.match(cameraWxml, new RegExp(`bindtap="${action}"`));
assert.match(cameraWxml, /class="hero-image"/);
assert.match(cameraWxml, /class="thumb-strip"/);
assert.match(cameraWxml, /title="退出本次录入？"/);
assert.match(cameraWxml, /cancel-text="继续录入"/);
assert.match(reviewTs, /toggleCurrentSelection/);
assert.match(reviewTs, /clearSavedIntakeQueueItems/);
assert.match(reviewTs, /wx\.switchTab/);
assert.doesNotMatch(reviewTs, /pages\/intake\/result/);
assert.ok(!app.pages.includes("pages/intake/result/index"));
console.log("mini intake state machine passed");
