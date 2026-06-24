// scripts/test-cropper-math.ts
// 裁切器坐标纯函数单元测试 (v0.9.1.1: contain 模型, 已删 9 个 QQ dead 函数 + 65 个 dead tests)
import {
  getContainedImageRect,
  getInitialCropFrameInImage,
  clampCropFrameToImage,
  applyCropFrameDrag,
  screenFrameToCropBox,
} from "../src/lib/cropper-math";

const VP = { width: 390, height: 700 };

let pass = 0, fail = 0;
function approx(actual: number, expected: number, eps = 0.5) {
  return Math.abs(actual - expected) < eps;
}
function checkApprox(name: string, actual: number, expected: number, eps = 0.5) {
  if (approx(actual, expected, eps)) { pass++; console.log(`  ✅ ${name} (~${actual.toFixed(3)})`); }
  else { fail++; console.log(`  ❌ ${name} got=${actual} want=${expected} (eps=${eps})`); }
}
function checkObj(name: string, actual: any, expected: Record<string, number>, eps = 0.5) {
  for (const key of Object.keys(expected)) {
    if (!approx(actual[key], expected[key], eps)) {
      fail++;
      console.log(`  ❌ ${name} .${key} got=${actual[key]} want=${expected[key]}`);
      return;
    }
  }
  pass++; console.log(`  ✅ ${name}`);
}
function checkInRange(name: string, value: number, min: number, max: number) {
  if (value >= min && value <= max) { pass++; console.log(`  ✅ ${name} (${value.toFixed(2)} ∈ [${min}, ${max}])`); }
  else { fail++; console.log(`  ❌ ${name} got=${value} want ∈ [${min}, ${max}]`); }
}

console.log("\n=== getContainedImageRect (contain 居中) ===");
{
  const r = getContainedImageRect(800, 1600, 390, 700);
  checkObj("竖图 contain 居中", r, { x: 20, y: 0, width: 350, height: 700 });
}
{
  const r = getContainedImageRect(1600, 800, 390, 700);
  checkObj("横图 contain 居中", r, { x: 0, y: 252.5, width: 390, height: 195 });
}
{
  const r = getContainedImageRect(1000, 1000, 390, 700);
  checkObj("方图 contain 居中", r, { x: 0, y: 155, width: 390, height: 390 });
}

console.log("\n=== getInitialCropFrameInImage (比例初始框, v0.9.5 加 80% 安全距) ===");
{
  const fit = { x: 0, y: 56, width: 390, height: 556 };
  const f = getInitialCropFrameInImage(fit, 0.75);
  checkApprox("0.75 竖框 width=312 (390 * 0.8)", f.width, 312, 0.5);
  checkApprox("0.75 竖框 height=416 (520 * 0.8)", f.height, 416, 0.5);
  checkApprox("0.75 竖框 y 居中", f.y, 56 + (556 - 416) / 2, 0.5);
}
{
  const fit = { x: 0, y: 0, width: 200, height: 200 };
  const f = getInitialCropFrameInImage(fit, 1);
  checkApprox("1:1 方图 width=160 (200 * 0.8)", f.width, 160, 0.5);
  checkApprox("1:1 方图 height=160 (200 * 0.8)", f.height, 160, 0.5);
}

console.log("\n=== applyCropFrameDrag (普通裁切框拖拽) ===");
{
  const frame = { x: 10, y: 10, width: 50, height: 50 };
  const imgRect = { x: 0, y: 0, width: 100, height: 100 };
  const moved = applyCropFrameDrag("MOVE", 1000, 1000, frame, imgRect, 1);
  checkApprox("MOVE 越界 x 钳到 50", moved.x, 50, 0.5);
  checkApprox("MOVE 越界 y 钳到 50", moved.y, 50, 0.5);
  checkApprox("MOVE 越界 width 不变", moved.width, 50, 0.5);
}
{
  const frame = { x: 50, y: 50, width: 30, height: 30 };
  const imgRect = { x: 0, y: 0, width: 100, height: 100 };
  const moved = applyCropFrameDrag("CENTER", -1000, -1000, frame, imgRect, 1);
  checkApprox("CENTER 反向越界 x 钳到 0", moved.x, 0, 0.5);
  checkApprox("CENTER 反向越界 y 钳到 0", moved.y, 0, 0.5);
}
{
  const frame = { x: 0, y: 0, width: 50, height: 50 };
  const imgRect = { x: 0, y: 0, width: 100, height: 100 };
  const dragged = applyCropFrameDrag("R", 200, 0, frame, imgRect, 1);
  checkApprox("R 越界 1:1 width=100", dragged.width, 100, 0.5);
  checkApprox("R 越界 1:1 height=100", dragged.height, 100, 0.5);
}
{
  const frame = { x: 0, y: 0, width: 50, height: 50 };
  const imgRect = { x: 0, y: 0, width: 100, height: 100 };
  const dragged = applyCropFrameDrag("BR", 200, 200, frame, imgRect, 1);
  checkApprox("BR 越界 1:1 width=100", dragged.width, 100, 0.5);
  checkApprox("BR 越界 1:1 height=100", dragged.height, 100, 0.5);
}
{
  const frame = { x: 0, y: 0, width: 50, height: 50 };
  const imgRect = { x: 0, y: 0, width: 200, height: 200 };
  const dragged = applyCropFrameDrag("R", 100, 0, frame, imgRect, "free");
  checkApprox("free R width=150", dragged.width, 150, 0.5);
  checkApprox("free R height=50", dragged.height, 50, 0.5);
  if (dragged.width !== dragged.height) { pass++; console.log("  ✅ free R 后 width != height"); }
  else { fail++; console.log("  ❌ free R 后 width == height (应该不同)"); }
}

console.log("\n=== screenFrameToCropBox (screen → normalized 0..1) ===");
{
  const box = screenFrameToCropBox(
    { x: 25, y: 50, width: 50, height: 50 },
    { x: 0, y: 0, width: 100, height: 100 },
  );
  checkObj("screenFrameToCropBox 0.25/0.5", box, { x: 0.25, y: 0.5, width: 0.5, height: 0.5 });
}
{
  const box = screenFrameToCropBox(
    { x: 100, y: 400, width: 200, height: 400 },
    { x: 0, y: 0, width: 400, height: 800 },
  );
  checkObj("screenFrameToCropBox 400x800 0.25/0.5", box, { x: 0.25, y: 0.5, width: 0.5, height: 0.5 });
}

console.log("\n=== clampCropFrameToImage (无效 imageRect 不 NaN + 钳 0) ===");
{
  const badRect = { x: 0, y: 0, width: 0, height: 0 };
  const result = clampCropFrameToImage({ x: 50, y: 50, width: 100, height: 100 }, badRect, 1);
  checkApprox("width=0 imageRect → result.width=0", result.width, 0, 0.5);
  checkApprox("width=0 imageRect → result.height=0", result.height, 0, 0.5);
  checkInRange("width=0 imageRect x finite", result.x, -1e6, 1e6);
  checkInRange("width=0 imageRect y finite", result.y, -1e6, 1e6);
}
{
  const badRect = { x: NaN, y: 0, width: 200, height: 200 };
  const result = clampCropFrameToImage({ x: 10, y: 10, width: 50, height: 50 }, badRect, 1);
  checkInRange("NaN imageRect result.x finite", result.x, -1e6, 1e6);
  checkInRange("NaN imageRect result.y finite", result.y, -1e6, 1e6);
  checkInRange("NaN imageRect result.width finite", result.width, -1e6, 1e6);
  checkInRange("NaN imageRect result.height finite", result.height, -1e6, 1e6);
}
{
  const badRect = { x: 0, y: 0, width: -10, height: -10 };
  const result = clampCropFrameToImage({ x: 50, y: 50, width: 100, height: 100 }, badRect, 1);
  checkApprox("负 width imageRect → result.width=0", result.width, 0, 0.5);
  checkApprox("负 width imageRect → result.height=0", result.height, 0, 0.5);
}

console.log("\n=== I4 v0.9.1.1 单测: 极长/极宽/极小 viewport/极小原图 (contain 模型) ===");
{
  // 极长图 (100x5000) + contain 模式:
  //   scale = min(390/100, 700/5000) = min(3.9, 0.14) = 0.14
  //   短边 100 缩到 14, 1:1 框 = 短边 fit 后 80% = 11.2 (v0.9.5 安全距)
  const rect = getContainedImageRect(100, 5000, 390, 700);
  checkApprox("极长 100x5000 contain 短边限制 (14)", rect.width, 14, 0.5);
  checkApprox("极长图 imageRect.height=700 (撑满高)", rect.height, 700, 0.5);
  const f = getInitialCropFrameInImage(rect, 1);
  checkApprox("极长图 1:1 框=11.2 (imageRect 短边 80% 安全距)", f.width, 11.2, 0.5);
}
{
  // 极宽图 (5000x100) + contain 模式:
  //   scale = min(390/5000, 700/100) = min(0.078, 7) = 0.078
  const rect = getContainedImageRect(5000, 100, 390, 700);
  checkApprox("极宽 5000x100 contain imageRect.width=390", rect.width, 390, 0.5);
  checkApprox("极宽图 imageRect.height=7.8 (短边限制)", rect.height, 7.8, 0.5);
  const f = getInitialCropFrameInImage(rect, 1);
  checkApprox("极宽图 1:1 框=6.24 (imageRect 短边 80%)", f.width, 6.24, 0.5);
}
{
  // 极小 viewport (30x30) + 方图 (100x100)
  //   scale = min(30/100, 30/100) = 0.3 → imageRect 30x30
  const rect = getContainedImageRect(100, 100, 30, 30);
  checkApprox("极小 viewport imageRect 30x30", rect.width, 30, 0.5);
  // 1:1 框 = imageRect 短边 80% = 24
  const f = getInitialCropFrameInImage(rect, 1);
  checkApprox("极小 viewport 1:1 框=24 (imageRect 短边 80%)", f.width, 24, 0.5);
  // clamp 后 width/height 不应超过 imageRect
  const c = clampCropFrameToImage(f, rect, 1);
  checkInRange("极小 viewport clamp 后 width ≤ imageRect.width", c.width, 0, 30);
  checkInRange("极小 viewport clamp 后 height ≤ imageRect.height", c.height, 0, 30);
}
{
  // 极小原图 (100x100) + 普通 viewport (390x700)
  //   scale = min(390/100, 700/100) = min(3.9, 7) = 3.9 → imageRect 390x390 (放大填宽)
  const rect = getContainedImageRect(100, 100, 390, 700);
  checkApprox("极小原图 100x100 contain 放大 3.9x", rect.width, 390, 0.5);
  checkApprox("极小原图 imageRect.height=390 (短边对齐)", rect.height, 390, 0.5);
  const f = getInitialCropFrameInImage(rect, 1);
  checkApprox("极小原图 1:1 框=312 (imageRect 短边 80% = 390*0.8)", f.width, 312, 0.5);
}
{
  // 旋转后 (canvas 重导出, 90°) 短边对调
  //   5000x100 → 100x5000, contain 模式应直接 fit 100 边
  const rotatedRect = getContainedImageRect(100, 5000, 390, 700);
  checkApprox("旋转 90° 后 (100x5000) 短边 = 14", rotatedRect.width, 14, 0.5);
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
if (fail > 0) process.exit(1);
