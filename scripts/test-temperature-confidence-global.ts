import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { countStep3VisibleNeedsReviewFields } from "../src/components/garment-intake-flow";
import { calculateDraftConfidenceScore } from "../src/components/item/ai-confidence-pill";
import {
  resolveSliderDragIntent,
  temperatureFromPointer,
} from "../src/components/temperature-range-slider";
import { createIntakeField, type GarmentIntakeDraft } from "../src/lib/intake-draft";
import { garmentDraftToWardrobeItem } from "../src/lib/intake-save-adapters";
import { buildLocalGarmentDraft } from "../src/lib/intake-local-draft";
import {
  TEMPERATURE_RANGE_MAX_C,
  TEMPERATURE_RANGE_MIN_C,
  TEMPERATURE_RANGE_STEP_C,
  isValidTemperatureRange,
  normalizeTemperatureRange,
} from "../src/lib/temperature-range";

assert.equal(TEMPERATURE_RANGE_MIN_C, -20);
assert.equal(TEMPERATURE_RANGE_MAX_C, 40);
assert.equal(TEMPERATURE_RANGE_STEP_C, 1);
assert.deepEqual(normalizeTemperatureRange({ minC: -8, maxC: 5 }), { minC: -8, maxC: 5 });
assert.deepEqual(normalizeTemperatureRange({ minC: -30, maxC: 50 }), { minC: -20, maxC: 40 });
assert.deepEqual(normalizeTemperatureRange({ minC: 15, maxC: -10 }), { minC: -10, maxC: 15 });
assert.equal(isValidTemperatureRange({ minC: -20, maxC: 40 }), true);
assert.equal(isValidTemperatureRange({ minC: 5, maxC: -5 }), false);

assert.equal(resolveSliderDragIntent(7, 1), "pending", "8px 内不抢手势");
assert.equal(resolveSliderDragIntent(12, 2), "horizontal", "横向意图才允许改值");
assert.equal(resolveSliderDragIntent(2, 12), "vertical", "纵向意图保留页面滚动");
assert.equal(resolveSliderDragIntent(10, 10), "vertical", "斜向同幅度优先纵向滚动");
assert.ok(
  Math.abs(temperatureFromPointer({ clientX: 142, grabOffsetX: 12, trackLeft: 0, trackWidth: 390, step: 1 })) === 0,
  "390px 轨道保留 12px grab offset，pointerdown 不把 knob 中心瞬移到手指",
);
assert.equal(
  temperatureFromPointer({ clientX: 337, grabOffsetX: 12, trackLeft: 0, trackWidth: 390, step: 1 }),
  30,
  "拖动继续以 knob 中心而非触点位置换算整数温度",
);

const draft = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,aaa",
  nameGuess: "冬季外套",
  categoryGuess: "tops",
  colors: { mode: "single", primary: "黑色" },
  seasons: ["winter"],
  styles: ["casual"],
  formality: 2,
  warmth: 5,
  temperatureRange: { minC: -8, maxC: 5 },
  locationId: "home",
  aiConfidenceScore: 86,
});
assert.equal(calculateDraftConfidenceScore(draft), 86);
assert.equal(garmentDraftToWardrobeItem(draft).aiConfidence, 0.86);
assert.deepEqual(garmentDraftToWardrobeItem(draft).temperatureRange, { minC: -8, maxC: 5 });
assert.equal(calculateDraftConfidenceScore({ ...draft, aiConfidenceScore: undefined }), null);

const reviewDraft = {
  name: createIntakeField("", "ai", "low", { needsReview: true }),
  category: createIntakeField("tops", "ai", "medium", { needsReview: false }),
  material: createIntakeField("", "ai", "low", { needsReview: true }),
  locationId: createIntakeField("home", "default", "low", { needsReview: true }),
} as unknown as GarmentIntakeDraft;
assert.equal(countStep3VisibleNeedsReviewFields(reviewDraft), 1, "只统计实际显示且非空可选字段的问题");

for (const file of [
  "src/components/temperature-range-slider.tsx",
  "src/components/temperature-range-bar.tsx",
  "src/lib/device-minimax.ts",
  "src/lib/intake-save-adapters.ts",
  "src/lib/intake-local-draft.ts",
  "src/lib/outfit-ai-metadata.ts",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /temperature-range/, `${file} 必须引用全局温度模块`);
}

const temperatureSliderSource = readFileSync("src/components/temperature-range-slider.tsx", "utf8");
const wardrobeControlsSource = readFileSync("src/components/wardrobe-form-controls.tsx", "utf8");
assert.match(temperatureSliderSource, /grabOffsetX/, "温度滑条必须记录 grab offset");
assert.match(temperatureSliderSource, /data-slider-intent-lock="8px-pan-y"/, "温度滑条必须声明 8px pan-y 意图锁");
assert.doesNotMatch(temperatureSliderSource, /touchAction:\s*"none"|touch-none/, "温度滑条不得阻断纵向滚动");
assert.doesNotMatch(temperatureSliderSource, /document\.addEventListener\("pointermove"/, "knob pointer capture 应承接出界拖动，无需 document 全局监听");
assert.match(temperatureSliderSource, /current\.minC === next\.minC && current\.maxC === next\.maxC/, "温度滑条必须在父级重渲染前去重同一整数范围");
assert.match(wardrobeControlsSource, /grabOffsetX/, "通用 RangeField 必须保留 knob grab offset");
assert.match(wardrobeControlsSource, /data-slider-intent-lock="8px-pan-y"/, "通用 RangeField 必须保留纵向滚动");
assert.match(wardrobeControlsSource, /if \(nextValue === valueRef\.current\) return/, "通用 RangeField 不重复提交相同整数");

console.log("global temperature + real AI confidence: passed");
