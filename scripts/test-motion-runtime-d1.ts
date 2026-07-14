import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { shouldReduceLargeAreaEffects } from "../src/lib/motion-runtime-preferences";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function listSourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((entry) => {
    const absolute = join(root, directory, entry);
    const path = relative(root, absolute);
    return statSync(absolute).isDirectory() ? listSourceFiles(path) : [path];
  }).filter((path) => /\.(?:ts|tsx|css)$/.test(path));
}

assert.equal(shouldReduceLargeAreaEffects({
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  hardwareConcurrency: 4,
  deviceMemoryGb: 4,
}), true, "constrained Android disables large blur");
assert.equal(shouldReduceLargeAreaEffects({
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
}), false, "capable Android preserves normal material");
assert.equal(shouldReduceLargeAreaEffects({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
  hardwareConcurrency: 4,
  deviceMemoryGb: 4,
}), false, "desktop is not guessed low-end from CPU alone");

const sourceFiles = listSourceFiles("src");
const combined = sourceFiles.map((path) => `${path}\n${read(path)}`).join("\n");
assert.doesNotMatch(combined, /active:scale-|whileTap\s*=/, "press scale is centralized");
assert.doesNotMatch(combined, /will-change-transform/, "gesture tracks do not keep permanent GPU layers");
assert.doesNotMatch(combined, /height\s*:\s*["']auto["']/, "intrinsic height is never animated");
assert.doesNotMatch(combined, /staggerReveal/, "list entry stagger has been removed");
assert.doesNotMatch(read("src/app/globals.css"), /scroll-behavior\s*:\s*smooth/, "global scrolling is never forced smooth");

const nativeBackOwners = sourceFiles.filter((path) => read(path).includes('App.addListener("backButton"'));
assert.deepEqual(nativeBackOwners, ["src/components/overlay-root.tsx"], "OverlayRoot is the sole native Back owner");

for (const match of combined.matchAll(/scrollIntoView\([^\n]+behavior:\s*"smooth"[^\n]+/g)) {
  assert.match(match[0], /reduc/i, "smooth scroll has an inline reduced-motion branch");
  assert.match(match[0], /"auto"/, "reduced-motion scroll is instant/auto");
}

const globals = read("src/app/globals.css");
for (const contract of [
  "prefers-reduced-transparency",
  "prefers-contrast: more",
  'data-motion-effects="reduced"',
  ".app-press-feedback",
]) {
  assert.ok(globals.includes(contract), `globals include ${contract}`);
}

const provider = read("src/components/motion-provider.tsx");
assert.ok(provider.includes("shouldReduceLargeAreaEffects"), "MotionProvider applies the Android capability profile");
assert.ok(provider.includes("data-reduced-transparency"), "MotionProvider reflects transparency preference");
assert.ok(provider.includes("data-high-contrast"), "MotionProvider reflects contrast preference");

const selectedReview = read("src/components/wardrobe-selected-images-review-portal.tsx");
for (const contract of ["<OverlayPortal>", "useOverlayLayer({", "useOverlayFocusScope(", 'role="dialog"', "aria-label={title}"]) {
  assert.ok(selectedReview.includes(contract), `selected image review includes ${contract}`);
}

const motionCommon = read("src/components/motion-common.tsx");
assert.ok(motionCommon.includes('role="progressbar"'), "AI progress exposes native progress semantics");
assert.ok(motionCommon.includes("aria-valuetext={stage}"), "AI progress names the current stage");
assert.ok(motionCommon.includes("const panelVariants = prefersReducedMotion"), "sheets explicitly become reduced-motion fades");
assert.ok(motionCommon.includes("const variants = prefersReducedMotion"), "shared navigation/menu surfaces select reduced variants");

console.log(`motion D1 runtime contract passed (${sourceFiles.length} source files scanned)`);
