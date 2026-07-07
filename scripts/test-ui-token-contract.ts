import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..");
const spec = readFileSync(join(root, "docs/designs/wardrobe-ui-spec.md"), "utf8");
const scanRoots = ["src/components", "src/app"];
const legacyAllowedFiles = new Set([
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/components/auth/auth-gate.tsx",
  "src/components/batch-ai-progress-panel.tsx",
  "src/components/catalog-selection/catalog-multi-select-bar.tsx",
  "src/components/color-chip.tsx",
  "src/components/fit-gender-chips.tsx",
  "src/components/garment-immersive-detail.tsx",
  "src/components/garment-intake-flow.tsx",
  "src/components/intake-flow-shell.tsx",
  "src/components/item/color-fields.tsx",
  "src/components/motion-common.tsx",
  "src/components/outfit-intake-flow.tsx",
  "src/components/selected-images-review.tsx",
  "src/components/wardrobe-app.tsx",
  "src/components/wardrobe-form-controls.tsx",
  "src/components/wardrobe-image-source-sheet.tsx",
  "src/components/wardrobe-selected-images-review-portal.tsx",
  "src/components/wear-statistics-view.tsx",
]);

function listFiles(dir: string): string[] {
  const abs = join(root, dir);
  return readdirSync(abs).flatMap((entry) => {
    const path = join(abs, entry);
    const rel = relative(root, path);
    if (statSync(path).isDirectory()) return listFiles(rel);
    return /\.(tsx?|css)$/.test(path) ? [rel] : [];
  });
}

const violations: string[] = [];
const hexPattern = /(?:\b(?:bg|text|border)-\[#(?:[0-9a-fA-F]{3,8})\]|backgroundColor:\s*["']#[0-9a-fA-F]{3,8}["']|#[0-9a-fA-F]{6})/g;

for (const file of scanRoots.flatMap(listFiles)) {
  const content = readFileSync(join(root, file), "utf8");
  const matches = content.match(hexPattern) ?? [];
  if (!matches.length) continue;
  if (legacyAllowedFiles.has(file)) continue;
  violations.push(`${file}: ${matches.slice(0, 3).join(", ")}`);
}

assert.ok(spec.includes("UI-DEBT-001"), "legacy token debt must be registered");
assert.deepEqual(violations, []);

console.log("ui token contract: passed");
