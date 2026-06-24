import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const garment = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const adapter = readFileSync(join(root, "src/lib/intake-save-adapters.ts"), "utf8");

assert.ok(!garment.includes("用顿号或逗号分隔"));
assert.ok(!/label="主色"[\s\S]{0,220}<TextField/.test(garment));
assert.ok(!/label="辅助色"[\s\S]{0,220}<TextField/.test(garment));
const itemColorFields = readFileSync(join(root, "src/components/item/color-fields.tsx"), "utf8");
assert.ok(garment.includes("<ItemColorFields"));
assert.ok(itemColorFields.includes("colorMode === \"main_with_accent\""));
assert.ok(garment.includes("label=\"备注\""));
assert.ok(adapter.includes("notes: optionalText(draft.notes)"));
assert.ok(!garment.includes("本地"));
console.log("garment intake confirm contract passed");
