import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { countStep3VisibleNeedsReviewFields } from "../src/components/garment-intake-flow";
import { calculateDraftConfidenceScore } from "../src/components/item/ai-confidence-pill";
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

console.log("global temperature + real AI confidence: passed");
