import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeNestedCropBoxes as appCompose, expandCropBoxEachSide as appExpand, rotateNormalizedCropBox as appRotate } from "@wardrobe/cloud-contracts";
import { composeNestedCropBoxes as miniCompose, expandCropBoxEachSide as miniExpand, rotateNormalizedCropBox as miniRotate } from "../apps/wechat-miniprogram/generated/image-crop";

const vectors = JSON.parse(readFileSync("tests/fixtures/image-crop-coordinate-vectors.json", "utf8")) as Vector[];
for (const vector of vectors) {
  if (vector.operation === "compose") { closeBox(appCompose(vector.pre, vector.secondary), vector.expected, `app ${vector.name}`); closeBox(miniCompose(vector.pre, vector.secondary), vector.expected, `mini ${vector.name}`); }
  if (vector.operation === "expand") { closeBox(appExpand(vector.box), vector.expected, `app ${vector.name}`); closeBox(miniExpand(vector.box), vector.expected, `mini ${vector.name}`); }
  if (vector.operation === "rotate") { closeBox(appRotate(vector.box, vector.degrees), vector.expected, `app ${vector.name}`); closeBox(miniRotate(vector.box, vector.degrees), vector.expected, `mini ${vector.name}`); }
}
const appFlow = readFileSync("src/components/garment-intake-flow.tsx", "utf8"); const appRoot = readFileSync("src/components/wardrobe-app.tsx", "utf8"); const wishlist = readFileSync("src/components/wishlist-view-2.0.tsx", "utf8"); const miniPage = readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.ts", "utf8"); const miniWxml = readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.wxml", "utf8"); const miniReview = readFileSync("apps/wechat-miniprogram/pages/intake/review/index.wxml", "utf8");
assert.match(appFlow, /hasMiniMaxKey \? "下一步（AI 识别）" : "下一步（填写属性）"/); assert.match(appFlow, /正在自动裁切，进度/); assert.match(appFlow, /cropProgress=\{!hasMiniMaxKey/); assert.match(appRoot, /hasMiniMaxKey=\{hasDeviceMiniMaxKey\(miniMaxSettings\)\}/); assert.match(wishlist, /hasMiniMaxKey=\{hasDeviceMiniMaxKey\(settings\)\}/);
assert.match(miniPage, /kind === "wishlist" \? "下一步（识别种草）" : "下一步（AI识别）"/); assert.match(miniPage, /nextText: "下一步（填写属性）"/); assert.match(miniWxml, /autoCropEnabled && cropCompleted < cropTotal/); assert.match(miniWxml, /正在自动裁切，进度/); assert.doesNotMatch(miniReview, /自动裁切|ONNX|Sidecar|cropBox/);
console.log(`image crop dual route: passed (${vectors.length} shared coordinate vectors; App + mini garment/wishlist key branches)`);

interface Box { x: number; y: number; width: number; height: number }
type Vector = { name: string; operation: "compose"; pre: Box; secondary: Box; expected: Box } | { name: string; operation: "expand"; box: Box; expected: Box } | { name: string; operation: "rotate"; degrees: 0 | 90 | 180 | 270; box: Box; expected: Box };
function closeBox(actual: Box, expected: Box, label: string) { for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${label}.${key}`); }
