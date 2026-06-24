import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outfit = readFileSync(join(root, "src/components/outfit-list-view.tsx"), "utf8");
const device = readFileSync(join(root, "src/lib/device-minimax.ts"), "utf8");

assert.ok(!outfit.includes("recognizeSingleItemFromDataUrl"));
assert.ok(device.includes("generateOutfitNameOnDevice"));
assert.ok(device.includes("name / seasons / sceneTags / styleTags / pairingTags / temperatureRange / notes"));
for (const text of ["套装名称", "季节", "场景", "风格", "搭配", "适穿温度", "备注"]) {
  assert.ok(outfit.includes(text), `outfit flow should include ${text}`);
}
console.log("outfit intake confirm contract passed");
