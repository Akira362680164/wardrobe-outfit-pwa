import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const wishlistView = readFileSync(join(root, "src/components/wishlist-view-2.0.tsx"), "utf8");
const garmentFlow = readFileSync(join(root, "src/components/garment-intake-flow.tsx"), "utf8");
const mapper = readFileSync(join(root, "src/lib/wishlist-intake-from-ai.ts"), "utf8");
const shell = readFileSync(join(root, "src/components/intake-flow-shell.tsx"), "utf8");

assert.ok(wishlistView.includes('title="添加种草"'));
assert.ok(wishlistView.includes('flowKind="wishlist"'));
assert.ok(/draft\.price/.test(garmentFlow) && /flowKind === "wishlist"\s*\?\s*"价格"/.test(garmentFlow));
assert.ok(/draft\.productUrl/.test(garmentFlow) && /flowKind === "wishlist"\s*\?\s*"链接"/.test(garmentFlow));
assert.ok(garmentFlow.includes("<ItemColorFields"));
assert.ok(garmentFlow.includes("label=\"备注\""));
assert.ok(!/price:\s*candidate\.price/.test(mapper));
assert.ok(!/currency:\s*resolvedCurrency/.test(mapper));
assert.ok(!/productUrl:\s*candidate/.test(mapper));
assert.ok(/price:\s*optionalPrice\(draft\.price\)/.test(readFileSync(join(root, "src/lib/intake-save-adapters.ts"), "utf8")));
assert.ok(!/currency:\s*requiredText/.test(readFileSync(join(root, "src/lib/intake-save-adapters.ts"), "utf8")));
assert.ok(/productUrl:\s*optionalText\(draft\.productUrl\)/.test(readFileSync(join(root, "src/lib/intake-save-adapters.ts"), "utf8")));
assert.ok(wardrobeApp.includes("onProcessIntakeImage={processGarmentIntakeImage}"));
assert.ok(!/price:\s*overrideIfPresent/.test(wardrobeApp));
assert.ok(!/disabled=\{isProcessing\}/.test(shell));
assert.ok(shell.includes("正在处理本次录入，退出后本次结果不会保存。"));
console.log("wishlist intake confirm contract passed");
