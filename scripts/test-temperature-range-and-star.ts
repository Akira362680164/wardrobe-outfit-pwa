// v2.0.11-test P2-7 + P2-8: 温度范围 -20~40 + 衣橱名称星号
// 验证：
// - TemperatureRangeSlider / TemperatureRangeBar 的 TEMP_MIN = -20, TEMP_MAX = 40
// - 添加衣橱 / 编辑衣橱弹窗中衣橱名称字段标题用 flex 容器包含文字和星号
// - input 带 required + aria-required

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const slider = readFileSync(join(root, "src/components/temperature-range-slider.tsx"), "utf8");
const bar = readFileSync(join(root, "src/components/temperature-range-bar.tsx"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; const msg = detail ? `: ${detail}` : ""; failures.push(name + msg); console.log(`  ❌ ${name}${msg}`); }
}

console.log("\n=== 温度范围 -20~40 ===");
check("TemperatureRangeSlider TEMP_MIN = -20", /const TEMP_MIN = -20;/.test(slider));
check("TemperatureRangeSlider TEMP_MAX = 40", /const TEMP_MAX = 40;/.test(slider));
check("TemperatureRangeBar TEMP_MIN = -20", /const TEMP_MIN = -20;/.test(bar));
check("TemperatureRangeBar TEMP_MAX = 40", /const TEMP_MAX = 40;/.test(bar));
check("slider 不再使用 TEMP_MIN = 0", !/const TEMP_MIN = 0;/.test(slider));
check("bar 不再使用 TEMP_MIN = 0", !/const TEMP_MIN = 0;/.test(bar));

console.log("\n=== 衣橱名称星号布局 ===");
const starMatches = wardrobeApp.match(/<span className="flex items-center gap-1">衣橱名称<span className="text-red-500"/g) ?? [];
check("添加衣橱 + 编辑衣橱 共 2 个星号 flex 标题", starMatches.length === 2, `actual=${starMatches.length}`);
check("衣橱名称 input 带 required", /aria-required="true"[\s\S]{0,300}placeholder="例如 办公室抽屉"|衣橱名称[\s\S]{0,300}required/.test(wardrobeApp));
check("衣橱名称 input 带 aria-required=\"true\"", /aria-required="true"/.test(wardrobeApp));

console.log(`\ntemperature & star tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("failures:\n" + failures.join("\n"));
  process.exit(1);
}
