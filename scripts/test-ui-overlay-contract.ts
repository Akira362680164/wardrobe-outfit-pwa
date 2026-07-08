import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const motion = read("src/components/motion-common.tsx");
const imageSourceSheet = read("src/components/wardrobe-image-source-sheet.tsx");
const confirmSheet = read("src/components/dialogs/confirm-action-sheet.tsx");
const topBar = read("src/components/app-sub-page-top-bar.tsx");
const garmentFlow = read("src/components/garment-intake-flow.tsx");
const globals = read("src/app/globals.css");
const wardrobe = read("src/components/wardrobe-app.tsx");

const motionSheetStart = motion.indexOf("export function MotionSheet");
const motionSheetEnd = motion.indexOf("/* ------------------------------------------------------------------ */", motionSheetStart + 1);
const motionSheet = motion.slice(motionSheetStart, motionSheetEnd);

assert.ok(motionSheet.includes("useScrollLock(open)"), "MotionSheet locks background scroll");
assert.ok(motionSheet.includes("role={role}"), "MotionSheet panel exposes role");
assert.ok(motionSheet.includes('aria-modal="true"'), "MotionSheet panel exposes aria-modal");
assert.match(motionSheet, /key === "Escape"[\s\S]{0,240}onClose\(\)/, "MotionSheet handles Escape");
assert.match(motionSheet, /previousFocusRef[\s\S]{0,240}document\.activeElement/, "MotionSheet records current focus");
assert.match(motionSheet, /focusable[\s\S]{0,240}\.focus\(\)/, "MotionSheet moves focus into panel");
assert.match(motionSheet, /previousFocusRef\.current[\s\S]{0,240}\.focus\(\)/, "MotionSheet restores focus after close");
assert.match(motionSheet, /key !== "Tab"[\s\S]{0,600}preventDefault\(\)/, "MotionSheet traps Tab focus");

assert.match(motion, /export function MotionImageLightbox[\s\S]*?useScrollLock\(open\)/, "MotionImageLightbox locks background scroll");
assert.match(motion, /export function MotionPopoverMenu[\s\S]*?document\.addEventListener\("pointerdown"/, "MotionPopoverMenu closes on outside pointerdown");

assert.ok(imageSourceSheet.includes("<MotionSheet"), "WardrobeImageSourceSheet delegates to MotionSheet");
assert.ok(!imageSourceSheet.includes("AnimatePresence"), "WardrobeImageSourceSheet has no private AnimatePresence");
assert.ok(!imageSourceSheet.includes("<motion."), "WardrobeImageSourceSheet has no private motion panel");
assert.ok(confirmSheet.includes("<MotionSheet"), "ConfirmActionSheet delegates to MotionSheet");
assert.ok(confirmSheet.includes('role={tone === "danger" ? "alertdialog" : "dialog"}'), "danger confirmation uses alertdialog");
assert.ok(confirmSheet.includes("ariaLabel={title}"), "confirmation sheet labels the dialog");
assert.ok(confirmSheet.includes("onClose={submitting ? () => undefined : onClose}"), "submitting confirmation cannot close");
assert.match(confirmSheet, /label=\{cancelLabel\}[\s\S]{0,80}disabled=\{submitting\}/, "submitting disables cancel action");

assert.match(topBar, /aria-label="返回"[\s\S]{0,140}className="grid h-12 w-12 place-items-center -ml-1"/, "back button has 48px hit area");
assert.match(topBar, /<span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent/, "back button keeps 40px transparent rounded-rectangle hit visual");
assert.match(topBar, /aria-label="更多操作"[\s\S]{0,160}className="grid h-12 w-12 place-items-center -mr-1"/, "more button has 48px hit area");
assert.match(topBar, /<span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink\/40/, "more button keeps 40px transparent rounded-rectangle hit visual");

assert.match(globals, /--ui-radius-nav-active:\s*22px;/, "bottom nav active radius has concentric token");
assert.match(globals, /\.app-glass-top\s*\{[\s\S]{0,160}background:\s*rgba\(255,\s*255,\s*255,\s*0\.01\);[\s\S]{0,160}box-shadow:\s*none;/, "top glass keeps blur but removes visible white strip");
assert.ok(!wardrobe.includes("bottom-2 left-2 top-2 w-1"), "runtime toast does not use a full-height status strip");
assert.ok(wardrobe.includes("WebkitLineClamp: 3"), "runtime toast clamps body copy to three lines");
assert.ok(wardrobe.includes("rounded-[var(--ui-radius-nav-active)]"), "mobile nav active item uses concentric nav radius");

assert.ok(!garmentFlow.includes("Step 3"), "garment intake code must not mention Step 3");
assert.ok(!garmentFlow.includes("步骤 3"), "garment intake code must not mention 步骤 3");

console.log("ui overlay contract: passed");
