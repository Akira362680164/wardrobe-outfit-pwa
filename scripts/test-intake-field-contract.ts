import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeAiColorInfo,
  normalizeSystemColorValue,
  getAccentColors,
  getPrimaryColors,
} from "../src/lib/color-fields";
import { COLOR_OPTIONS, buildColorRecognitionPrompt } from "../src/lib/color-catalog";

const root = process.cwd();
const deviceMiniMax = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");
const garmentFlow = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const colorEditor = readFileSync(join(root, "src/components/item/color-fields.tsx"), "utf8");
const colorCatalog = readFileSync(join(root, "src/lib/color-catalog.ts"), "utf8");

assert.equal(COLOR_OPTIONS.length, 26, "COLOR_OPTIONS 应为 26 色");
// v1.1.27: 26 个标准色由 buildColorRecognitionPrompt() 动态生成。
const promptLines = buildColorRecognitionPrompt().join("\n");
for (const color of COLOR_OPTIONS) {
  assert.ok(promptLines.includes(color), `prompt should include ${color}`);
}
assert.ok(deviceMiniMax.includes("analyzeWishlistIntakeImageOnDevice"));
assert.ok(deviceMiniMax.includes('"notes"'));
assert.ok(deviceMiniMax.includes('"notes": "20到80字中文备注'));
assert.ok(deviceMiniMax.includes("禁止输出以下字段：price、currency、productUrl"));
assert.ok(deviceMiniMax.includes("material: sanitizeOptionalText"), "normalizeGarmentTag should preserve material");
assert.ok(deviceMiniMax.includes("colors: colorResult.colors"), "normalizeGarmentTag should preserve ColorInfo");
assert.ok(!colorEditor.includes("normalizeAiColorPayload"), "color editor should not normalize away manually selected mode");
assert.ok(colorEditor.includes("function switchMode(nextMode: ColorMode)"), "color editor should switch modes inside the shared component");
assert.ok(colorEditor.includes("emit(\"main_with_accent\""), "color editor should emit main_with_accent directly");
assert.ok(colorEditor.includes("emit(\"multicolor\""), "color editor should emit multicolor directly");
assert.equal(normalizeSystemColorValue("白色"), "白");
assert.equal(normalizeSystemColorValue("米白"), "米白");
assert.equal(normalizeSystemColorValue("牛仔蓝色"), "牛仔蓝");
const single = normalizeAiColorInfo({ mode: "single", primary: "白色", accents: ["黑"] });
assert.equal(single.colors.mode, "single");
assert.deepEqual(getPrimaryColors(single.colors), ["白"]);
assert.deepEqual(getAccentColors(single.colors), []);
const multicolor = normalizeAiColorInfo({ mode: "multicolor", primaries: ["黑", "白"] });
assert.equal(multicolor.colors.mode, "multicolor");
assert.deepEqual(getPrimaryColors(multicolor.colors), ["黑", "白"]);
assert.equal(normalizeSystemColorValue("荧光橙"), null);
// v1.1.27: 严格校验非法 AI 颜色必须 needsReview + 标记 reviewReason。
const illegal = normalizeAiColorInfo({ mode: "single", primary: "燕麦拿铁色" });
assert.equal(illegal.needsReview, true);
assert.ok(illegal.reviewReason?.includes("燕麦拿铁色"), `reviewReason 必须包含非法原值，实际: ${illegal.reviewReason}`);
// v1.1.27: color-catalog 是唯一颜色目录，源码应出现 26 色唯一数组。
assert.ok(colorCatalog.includes("COLOR_CATALOG"), "color-catalog 必须导出 COLOR_CATALOG 唯一目录");
assert.match(colorCatalog, /系统标准颜色仅允许以下 \$\{COLOR_OPTIONS\.length\}/, "buildColorRecognitionPrompt 必须动态拼接 26 色数字");
assert.match(deviceMiniMax, /\.\.\.buildColorRecognitionPrompt\(\)/, "device-minimax 必须复用 buildColorRecognitionPrompt");
assert.ok(!garmentFlow.includes("本地"));
console.log("intake field contract passed");
