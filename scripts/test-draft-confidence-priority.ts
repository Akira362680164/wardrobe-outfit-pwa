// v2.0.11-test P1-3: 整件级 AI 置信度优先于字段平均
// 验证：
// - GarmentIntakeDraft / WishlistIntakeDraft 顶层 aiConfidence 字段 (0-1)
// - buildLocalGarmentDraft 接受 aiConfidence 并写入草稿
// - calculateDraftConfidenceScore 优先返回 aiConfidence * 100，无则降级到字段平均

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { calculateDraftConfidenceScore } from "../src/components/item/ai-confidence-pill";
import { buildLocalGarmentDraft } from "../src/lib/intake-local-draft";
import { createIntakeField, type GarmentIntakeDraft } from "../src/lib/intake-draft";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; const msg = detail ? `: ${detail}` : ""; failures.push(name + msg); console.log(`  ❌ ${name}${msg}`); }
}

console.log("\n=== calculateDraftConfidenceScore 优先 aiConfidence ===");
const draftWithAi: GarmentIntakeDraft = {
  ...buildLocalGarmentDraft({
    imageDataUrl: "data:image/png;base64,AAA",
    colors: { mode: "single", primary: "白" } as never,
    nameGuess: "白衬衫",
    categoryGuess: "tops",
    locationId: "home",
    now: "2026-06-29T08:00:00.000Z",
  }),
  aiConfidence: 0.86,
};
const scoreWithAi = calculateDraftConfidenceScore(draftWithAi);
check("aiConfidence=0.86 → score=86", scoreWithAi === 86, `actual=${scoreWithAi}`);

const draftWithAiLow: GarmentIntakeDraft = {
  ...buildLocalGarmentDraft({
    imageDataUrl: "data:image/png;base64,BBB",
    colors: { mode: "single", primary: "黑" } as never,
    nameGuess: "黑外套",
    categoryGuess: "outerwear",
    locationId: "home",
    now: "2026-06-29T08:00:00.000Z",
  }),
  aiConfidence: 0.42,
};
const scoreWithAiLow = calculateDraftConfidenceScore(draftWithAiLow);
check("aiConfidence=0.42 → score=42", scoreWithAiLow === 42, `actual=${scoreWithAiLow}`);

const draftNoAi: GarmentIntakeDraft = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,CCC",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白T恤",
  categoryGuess: "tops",
  locationId: "home",
  now: "2026-06-29T08:00:00.000Z",
});
const scoreNoAi = calculateDraftConfidenceScore(draftNoAi);
check("无 aiConfidence 时降级字段平均 (有效数字)", typeof scoreNoAi === "number" && scoreNoAi > 0 && scoreNoAi <= 100, `actual=${scoreNoAi}`);

const draftAiInvalid: GarmentIntakeDraft = {
  ...buildLocalGarmentDraft({
    imageDataUrl: "data:image/png;base64,DDD",
    colors: { mode: "single", primary: "白" } as never,
    nameGuess: "白T",
    categoryGuess: "tops",
    locationId: "home",
    now: "2026-06-29T08:00:00.000Z",
  }),
  aiConfidence: NaN as unknown as number,
};
const scoreAiInvalid = calculateDraftConfidenceScore(draftAiInvalid);
check("aiConfidence=NaN 时降级字段平均", typeof scoreAiInvalid === "number" && scoreAiInvalid > 0, `actual=${scoreAiInvalid}`);

console.log("\n=== buildLocalGarmentDraft 接受 aiConfidence ===");
const passedThrough = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,EEE",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白T",
  categoryGuess: "tops",
  locationId: "home",
  now: "2026-06-29T08:00:00.000Z",
  aiConfidence: 0.73,
});
check("buildLocalGarmentDraft 写入 aiConfidence", passedThrough.aiConfidence === 0.73, `actual=${passedThrough.aiConfidence}`);

const omitted = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,FFF",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白T",
  categoryGuess: "tops",
  locationId: "home",
  now: "2026-06-29T08:00:00.000Z",
});
check("buildLocalGarmentDraft 不传 aiConfidence 时不写", omitted.aiConfidence === undefined);

const clamped = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,GGG",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白T",
  categoryGuess: "tops",
  locationId: "home",
  now: "2026-06-29T08:00:00.000Z",
  aiConfidence: 1.5,
});
check("buildLocalGarmentDraft aiConfidence > 1 截到 1", clamped.aiConfidence === 1, `actual=${clamped.aiConfidence}`);

const negative = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,HHH",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白T",
  categoryGuess: "tops",
  locationId: "home",
  now: "2026-06-29T08:00:00.000Z",
  aiConfidence: -0.3,
});
check("buildLocalGarmentDraft aiConfidence < 0 截到 0", negative.aiConfidence === 0, `actual=${negative.aiConfidence}`);

console.log("\n=== Step 3 visible review fields 排除 locationId/status ===");
const reviewFieldKeys = readFileSync("src/components/garment-intake-flow.tsx", "utf8");
const hasLocationId = /STEP3_VISIBLE_REVIEW_FIELD_KEYS[\s\S]{0,400}"locationId"/.test(reviewFieldKeys);
const hasStatus = /STEP3_VISIBLE_REVIEW_FIELD_KEYS[\s\S]{0,400}"status"/.test(reviewFieldKeys);
check("STEP3 可见字段集不再包含 locationId", !hasLocationId);
check("STEP3 可见字段集不再包含 status", !hasStatus);

console.log(`\ndraft confidence priority tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("failures:\n" + failures.join("\n"));
  process.exit(1);
}
