import assert from "node:assert/strict";
import fs from "node:fs";
import {
  containedImageRect,
  cropBoxToPixels,
  fitCropBox,
  rotateCropBox,
  rotatedSize,
} from "../apps/wechat-miniprogram/utils/crop-math";
import {
  clearCropWorkflow,
  completeCropJob,
  consumeCropResult,
  getCropJob,
  startCropJob,
} from "../apps/wechat-miniprogram/stores/crop-job";

const close = (actual: number, expected: number, tolerance = 0.0001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

const portraitRect = containedImageRect({ width: 1200, height: 1600 }, { width: 315, height: 360 });
close(portraitRect.height, 360);
close(portraitRect.width, 270);
close(portraitRect.x, 22.5);
close(portraitRect.y, 0);

const landscapeRect = containedImageRect({ width: 1600, height: 900 }, { width: 315, height: 360 });
close(landscapeRect.width, 315);
close(landscapeRect.height, 177.1875);
close(landscapeRect.y, 91.40625);

const crop = fitCropBox({ width: 1200, height: 1600 }, 0.75);
close(crop.width * 1200 / (crop.height * 1600), 0.75);
const pixels = cropBoxToPixels(crop, { width: 1200, height: 1600 });
assert.ok(pixels.x >= 0 && pixels.y >= 0);
assert.ok(pixels.x + pixels.width <= 1200.001);
assert.ok(pixels.y + pixels.height <= 1600.001);

const sourceBox = { x: 0.12, y: 0.18, width: 0.52, height: 0.61 };
const right = rotateCropBox(sourceBox, "right");
const roundTrip = rotateCropBox(right, "left");
for (const key of ["x", "y", "width", "height"] as const) close(roundTrip[key], sourceBox[key]);
assert.deepEqual(rotatedSize({ width: 1200, height: 1600 }, 90), { width: 1600, height: 1200 });
assert.deepEqual(rotatedSize({ width: 1200, height: 1600 }, 180), { width: 1200, height: 1600 });

clearCropWorkflow();
const job = startCropJob({ target: "intake", targetId: "image-1", sourcePath: "/tmp/original.jpg", rotationDeg: 0, cropRatio: "3:4", cropBox: crop });
assert.equal(getCropJob(job.id)?.sourcePath, "/tmp/original.jpg");
completeCropJob({ ...job, jobId: job.id, processedPath: "/tmp/cropped.jpg", cropBox: crop });
const result = consumeCropResult("intake");
assert.equal(result?.sourcePath, "/tmp/original.jpg");
assert.equal(result?.processedPath, "/tmp/cropped.jpg");
assert.equal(consumeCropResult("intake"), null);

const cameraTs = fs.readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.ts", "utf8");
const cameraWxml = fs.readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.wxml", "utf8");
const cameraWxss = fs.readFileSync("apps/wechat-miniprogram/pages/intake/camera/index.wxss", "utf8");
const cropTs = fs.readFileSync("apps/wechat-miniprogram/pages/intake/crop/index.ts", "utf8");
const cropWxss = fs.readFileSync("apps/wechat-miniprogram/pages/intake/crop/index.wxss", "utf8");
const reviewTs = fs.readFileSync("apps/wechat-miniprogram/pages/intake/review/index.ts", "utf8");
const confirmSheetWxml = fs.readFileSync("apps/wechat-miniprogram/components/ui/confirm-sheet/index.wxml", "utf8");

assert.match(cameraTs, /activePopoverItemId: ""/);
assert.match(cameraTs, /sourcePath: item\.sourcePath/);
assert.match(cameraTs, /processedPath: item\.processedPath/);
assert.match(cameraWxml, /wx:if="\{\{activePopoverItemId\}\}"/);
assert.doesNotMatch(cameraWxml, /clearSelected|清空已选图片/);
assert.doesNotMatch(cameraWxss, /\.thumb-popover\s*\{[^}]*position:\s*fixed/s);
assert.doesNotMatch(cameraWxss, /padding:\s*112rpx/);
assert.match(cameraWxss, /height:\s*100vh/);
assert.match(cameraWxss, /overflow:\s*hidden/);
assert.match(cameraWxss, /photo-card--empty\s*\{[^}]*flex:\s*0 0 300rpx/s);
assert.match(cameraWxss, /hero-wrap\s*\{[^}]*aspect-ratio:\s*3 \/ 4/s);
assert.match(cameraWxml, /source-button" style="width:100%;min-width:0;"/);
assert.match(cameraWxml, /bottom-action[^>]*style="width:100%;min-width:0;"/);
assert.doesNotMatch(cropTs, /stageWidth\s*=\s*650|stageHeight\s*=\s*720/);
assert.match(cropTs, /boundingClientRect/);
assert.match(cropTs, /job\.sourcePath/);
assert.match(cropWxss, /grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/);
assert.match(reviewTs, /endIntakeSession/);
assert.match(reviewTs, /leaveGuardActive/);
assert.equal((confirmSheetWxml.match(/style="width:100%;min-width:0;"/g) ?? []).length, 2);

console.log("mini crop workflow passed");
