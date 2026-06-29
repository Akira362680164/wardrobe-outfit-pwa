// v2.0.12-test: 温度全局统一 + AI 置信度无降级
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { calculateDraftConfidenceScore } from "../src/components/item/ai-confidence-pill";
import { buildLocalGarmentDraft } from "../src/lib/intake-local-draft";
import {
  TEMPERATURE_MIN_C,
  TEMPERATURE_MAX_C,
  clampTemperatureC,
  normalizeTemperatureRange,
  validateTemperatureRange,
} from "../src/lib/temperature-range";
import type { GarmentIntakeDraft } from "../src/lib/intake-draft";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; const msg = detail ? `: ${detail}` : ""; failures.push(name + msg); console.log(`  ❌ ${name}${msg}`); }
}

console.log("\n=== 统一温度常量 ===");
check("TEMPERATURE_MIN_C = -20", TEMPERATURE_MIN_C === -20);
check("TEMPERATURE_MAX_C = 40", TEMPERATURE_MAX_C === 40);

console.log("\n=== 组件不再硬编码 0 / 40 ===");
const slider = readFileSync("src/components/temperature-range-slider.tsx", "utf8");
const bar = readFileSync("src/components/temperature-range-bar.tsx", "utf8");
check("slider 不再硬编码 TEMP_MIN = 0", !slider.includes("const TEMP_MIN = 0"));
check("slider 不再硬编码 TEMP_MAX = 40", !slider.includes("const TEMP_MAX = 40"));
check("bar 不再硬编码 TEMP_MIN = 0", !bar.includes("const TEMP_MIN = 0"));
check("bar 不再硬编码 TEMP_MAX = 40", !bar.includes("const TEMP_MAX = 40"));
check("slider 引用统一常量", slider.includes("temperature-range"));
check("bar 引用统一常量", bar.includes("temperature-range"));

console.log("\n=== validateTemperatureRange 校验 minC <= maxC ===");
check("minC > maxC 返回 null", validateTemperatureRange({ minC: 30, maxC: 10 }) === null);
check("minC == maxC 通过", JSON.stringify(validateTemperatureRange({ minC: 10, maxC: 10 })) === JSON.stringify({ minC: 10, maxC: 10 }));
check("null 入参返回 null", validateTemperatureRange(null) === null);
check("undefined 入参返回 null", validateTemperatureRange(undefined) === null);
check("只有 minC 通过", JSON.stringify(validateTemperatureRange({ minC: -20 })) === JSON.stringify({ minC: -20, maxC: 40 }));
check("只有 maxC 通过", JSON.stringify(validateTemperatureRange({ maxC: 40 })) === JSON.stringify({ minC: -20, maxC: 40 }));

console.log("\n=== normalizeTemperatureRange 保留负数，不截断为 0 ===");
const negResult = normalizeTemperatureRange({ minC: -10, maxC: 15 });
check("负数 minC 保留", negResult?.minC === -10, `actual=${negResult?.minC}`);
check("正数 maxC 保留", negResult?.maxC === 15);
check("极端负数 -20 通过 clamp", normalizeTemperatureRange({ minC: -20, maxC: 0 })?.minC === -20);
check("极端正数 40 通过 clamp", normalizeTemperatureRange({ minC: 0, maxC: 40 })?.maxC === 40);
check("clampTemperatureC 把 NaN 视为下限", clampTemperatureC(NaN) === TEMPERATURE_MIN_C);

console.log("\n=== AI 归一化保留负数（src/device-minimax.ts）===");
const aiSrc = readFileSync("src/lib/device-minimax.ts", "utf8");
const aiNormMatch = aiSrc.match(/function normalizeTemperatureRange[\s\S]+?\n\}/);
check("device-minimax normalizeTemperatureRange 保留负数", aiNormMatch ? aiNormMatch[0].includes("Number.isFinite(min)") : false);
check("device-miniax 校验 minC <= maxC", aiNormMatch ? aiNormMatch[0].includes("result.minC > result.maxC") : false);

console.log("\n=== AI 置信度严格只读，无降级 ===");
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
check("aiConfidence=0.86 → score=86", calculateDraftConfidenceScore(draftWithAi) === 86);

const draftNoAi: GarmentIntakeDraft = buildLocalGarmentDraft({
  imageDataUrl: "data:image/png;base64,BBB",
  colors: { mode: "single", primary: "白" } as never,
  nameGuess: "白衬衫",
  categoryGuess: "tops",
  locationId: "home",
  now: "2026-06-29T08:00:00.000Z",
});
check("无 aiConfidence → score=null (无降级)", calculateDraftConfidenceScore(draftNoAi) === null);

const draftAiInvalid: GarmentIntakeDraft = {
  ...buildLocalGarmentDraft({
    imageDataUrl: "data:image/png;base64,CCC",
    colors: { mode: "single", primary: "白" } as never,
    nameGuess: "白衬衫",
    categoryGuess: "tops",
    locationId: "home",
    now: "2026-06-29T08:00:00.000Z",
  }),
  aiConfidence: NaN as unknown as number,
};
check("aiConfidence=NaN → score=null (无降级)", calculateDraftConfidenceScore(draftAiInvalid) === null);

const draftAiZero: GarmentIntakeDraft = {
  ...buildLocalGarmentDraft({
    imageDataUrl: "data:image/png;base64,DDD",
    colors: { mode: "single", primary: "白" } as never,
    nameGuess: "白衬衫",
    categoryGuess: "tops",
    locationId: "home",
    now: "2026-06-29T08:00:00.000Z",
  }),
  aiConfidence: 0,
};
check("aiConfidence=0 → score=0 (允许 0，不视为缺失)", calculateDraftConfidenceScore(draftAiZero) === 0);

console.log(`\ntemperature & confidence strict tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("failures:\n" + failures.join("\n"));
  process.exit(1);
}
