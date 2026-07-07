import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const motion = read("src/components/motion-common.tsx");
const imageSourceSheet = read("src/components/wardrobe-image-source-sheet.tsx");
const confirmSheet = read("src/components/dialogs/confirm-action-sheet.tsx");

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

console.log("ui overlay contract: passed");
