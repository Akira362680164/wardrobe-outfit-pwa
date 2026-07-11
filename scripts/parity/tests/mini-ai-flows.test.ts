import assert from "node:assert/strict";
import fs from "node:fs";

const recommendations = fs.readFileSync(
  "apps/wechat-miniprogram/pages/recommendations/index/index.ts",
  "utf8",
);
const recommendationsWxml = fs.readFileSync(
  "apps/wechat-miniprogram/pages/recommendations/index/index.wxml",
  "utf8",
);
const tryon = fs.readFileSync(
  "apps/wechat-miniprogram/pages/try-on/index/index.ts",
  "utf8",
);
const tryonWxml = fs.readFileSync(
  "apps/wechat-miniprogram/pages/try-on/index/index.wxml",
  "utf8",
);
const ai = fs.readFileSync("apps/wechat-miniprogram/services/ai.ts", "utf8");
const service = fs.readFileSync(
  "services/wardrobe-api/src/ai/minimax-intake-service.ts",
  "utf8",
);
const manifest = fs.readFileSync(
  "scripts/parity/manifests/recommendations.yaml",
  "utf8",
);

assert.match(recommendations, /outfit-recommendation/);
assert.doesNotMatch(
  recommendations.match(/const items = [\s\S]*?const \[outfits/)?.[0] ?? "",
  /imageUrl/,
);
for (const field of [
  "destination",
  "activity",
  "weather",
  "temperature",
  "timeOfDay",
  "formality",
  "style",
])
  assert.match(recommendations, new RegExp(field));
for (const state of ["loading", "error", "results", "refresh"])
  assert.match(recommendations + recommendationsWxml, new RegExp(state));
assert.match(manifest, /sendsGarmentImages: false/);
assert.match(tryon, /chooseReference/);
assert.match(tryon, /cropImageWithNativeEditor/);
assert.match(tryon, /generateTryOnPreview/);
assert.match(tryon, /savePreview/);
assert.match(tryon, /deletePreview/);
assert.match(tryonWxml, /确认并生成/);
assert.match(ai, /referenceImageDataUrl/);
assert.match(ai, /garmentImageDataUrls/);
assert.match(service, /\/v1\/image_generation/);
assert.match(service, /response_format: "base64"/);
assert.match(service, /describeTryOnGarments/);
assert.match(service, /garmentImageDataUrls\.map/);
assert.doesNotMatch(service, /type: "style"/);
assert.match(recommendationsWxml + tryonWxml, /前往设置/);
assert.doesNotMatch(recommendationsWxml + tryonWxml, /页面骨架|后续批次/);
console.log("mini AI flows passed");
