import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const md = readFileSync(join(root, "docs/designs/wardrobe-ui-spec.md"), "utf8");
const html = readFileSync(join(root, "docs/designs/wardrobe-ui-spec.html"), "utf8");

const frontMatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

assert.match(frontMatter, /^version:\s+v0\.2-final$/m);
assert.match(html, /<title>[^<]*v0\.2-final[^<]*<\/title>/);
assert.ok(html.includes("DO NOT EDIT BY HAND"));
assert.ok(html.includes("Source SHA256"));
assert.ok(!html.includes("/Users/"));
assert.ok(!html.includes("#f0f2ee"));

for (const title of [
  "Design Tokens",
  "Viewport 与 Safe Area",
  "App Shell",
  "Route 与页面状态矩阵",
  "Overlay / Sheet / Dialog",
  "核心组件 Contract",
  "领域 UI 映射",
  "录入流程状态机",
  "AI 与系统状态",
  "通知 Toast",
  "无障碍",
  "Known Deviations / UI Debt",
  "文档治理",
  "验收与测试映射",
]) {
  assert.ok(html.includes(title), `missing UI spec section: ${title}`);
}

console.log("ui spec preview contract: passed");
