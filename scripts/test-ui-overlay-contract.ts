import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const motion = read("src/components/motion-common.tsx");
const overlayRoot = read("src/components/overlay-root.tsx");
const overlayStack = read("src/lib/overlay-stack.ts");
const backCoordinator = read("src/lib/back-coordinator.ts");
const stableBack = read("src/lib/use-stable-back-handler.ts");
const imageSourceSheet = read("src/components/wardrobe-image-source-sheet.tsx");
const confirmSheet = read("src/components/dialogs/confirm-action-sheet.tsx");
const topBar = read("src/components/app-sub-page-top-bar.tsx");
const garmentFlow = read("src/components/garment-intake-flow.tsx");
const globals = read("src/app/globals.css");
const wardrobe = read("src/components/wardrobe-app.tsx");

const motionSheetStart = motion.indexOf("function MotionSheetLayer");
const motionSheetEnd = motion.indexOf("/* ------------------------------------------------------------------ */", motionSheetStart + 1);
const motionSheet = motion.slice(motionSheetStart, motionSheetEnd);
const motionToastStart = motion.indexOf("export function MotionToast");
const motionToastEnd = motion.indexOf("/* ------------------------------------------------------------------ */", motionToastStart + 1);
const motionToast = motion.slice(motionToastStart, motionToastEnd);

assert.ok(motionSheet.includes("useScrollLock(true)"), "MotionSheet locks background scroll through visual exit");
assert.ok(motionSheet.includes("<OverlayPortal>"), "MotionSheet portals into OverlayRoot");
assert.ok(motionSheet.includes("useOverlayLayer({"), "MotionSheet registers with OverlayStack");
assert.ok(motionSheet.includes("role={resolvedRole}"), "MotionSheet panel exposes role");
assert.ok(motionSheet.includes('aria-modal="true"'), "MotionSheet panel exposes aria-modal");
assert.ok(motionSheet.includes("aria-labelledby={ariaLabelledBy}"), "MotionSheet supports aria-labelledby");
assert.match(motion, /MotionSheetVariant = "action" \| "form" \| "confirm" \| "destructive"/, "MotionSheet exposes frozen variants");
assert.match(motionSheet, /dismissible[\s\S]{0,320}onDismissBlocked/, "MotionSheet exposes non-dismissible feedback");
assert.ok(!motionSheet.includes('event.key === "Escape"'), "MotionSheet delegates Escape to BackCoordinator");
assert.match(motionSheet, /focusable[\s\S]{0,240}\.focus\(\)/, "MotionSheet moves focus into panel");
assert.match(motionSheet, /event\.key !== "Tab"[\s\S]{0,700}preventDefault\(\)/, "MotionSheet traps Tab focus");
assert.match(motionSheet, /aria-hidden=\{isTopmost \? undefined : "true"\}/, "lower MotionSheet layers are hidden from assistive tech");
assert.match(motionSheet, /inert=\{isTopmost \? undefined : true\}/, "lower MotionSheet layers are inert");

assert.match(overlayRoot, /id = "wardrobe-overlay-root"[\s\S]{0,180}document\.body\.appendChild\(root\)/, "OverlayRoot mounts once under body");
assert.match(overlayRoot, /data-overlay-app-content="true"[\s\S]{0,180}aria-hidden=\{hasOverlay[\s\S]{0,120}inert=\{hasOverlay/, "OverlayRoot isolates App content");
assert.match(overlayRoot, /document\.activeElement instanceof HTMLElement/, "Overlay registration captures the focus return target");
assert.match(overlayStack, /if \(wasTopmost\)[\s\S]{0,420}focusSafely\(entry\.restoreFocusTo\)/, "OverlayStack restores focus after the top layer presentation updates");
assert.match(backCoordinator, /overlayStack\.requestDismiss\(reason\)[\s\S]{0,240}if \(overlay\.handled\)/, "Back coordination stops after overlay consumption");
assert.ok(!stableBack.includes("App.addListener"), "stable page handlers do not create native listeners");
assert.ok(!motionToast.includes("useOverlayLayer"), "Toast stays outside OverlayStack");

assert.match(motion, /export function MotionImageLightbox[\s\S]*?useScrollLock\(open\)/, "MotionImageLightbox locks background scroll");
assert.match(motion, /export function MotionPopoverMenu[\s\S]*?document\.addEventListener\("pointerdown"/, "MotionPopoverMenu closes on outside pointerdown");

assert.ok(imageSourceSheet.includes("<MotionSheet"), "WardrobeImageSourceSheet delegates to MotionSheet");
assert.ok(!imageSourceSheet.includes("AnimatePresence"), "WardrobeImageSourceSheet has no private AnimatePresence");
assert.ok(!imageSourceSheet.includes("<motion."), "WardrobeImageSourceSheet has no private motion panel");
assert.ok(confirmSheet.includes("<MotionSheet"), "ConfirmActionSheet delegates to MotionSheet");
assert.ok(confirmSheet.includes('role={tone === "danger" ? "alertdialog" : "dialog"}'), "danger confirmation uses alertdialog");
assert.ok(confirmSheet.includes("ariaLabel={title}"), "confirmation sheet labels the dialog");
assert.ok(confirmSheet.includes("onClose={submitting ? () => undefined : onClose}"), "submitting confirmation cannot close");
assert.ok(confirmSheet.includes("dismissible={!submitting}"), "submitting confirmation rejects coordinated dismissal");
assert.match(confirmSheet, /label=\{cancelLabel\}[\s\S]{0,80}disabled=\{submitting\}/, "submitting disables cancel action");

assert.match(topBar, /aria-label="返回"[\s\S]{0,140}className="grid h-12 w-12 place-items-center -ml-1"/, "back button has 48px hit area");
assert.match(topBar, /<span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent/, "back button keeps 40px transparent rounded-rectangle hit visual");
assert.match(topBar, /aria-label="更多操作"[\s\S]{0,160}className="grid h-12 w-12 place-items-center -mr-1"/, "more button has 48px hit area");
assert.match(topBar, /app-glass-top grid[\s\S]{0,180}min-h-14 px-2/, "sub page top bar keeps controls close to screen edges without restoring a white strip");
assert.match(topBar, /<ChevronLeft size=\{20\} strokeWidth=\{2\.6\}/, "back icon is slightly larger and heavier after removing the white top strip");
assert.match(topBar, /<span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink\/55/, "more button keeps 40px transparent rounded-rectangle hit visual");
assert.match(topBar, /<MoreHorizontal size=\{20\} strokeWidth=\{2\.6\}/, "more icon is slightly larger and heavier after removing the white top strip");

assert.match(globals, /--ui-radius-nav-active:\s*22px;/, "bottom nav active radius has concentric token");
assert.match(globals, /\.app-glass-top\s*\{[\s\S]{0,160}background:\s*rgba\(255,\s*255,\s*255,\s*0\.01\);[\s\S]{0,160}box-shadow:\s*none;/, "top glass keeps blur but removes visible white strip");
assert.ok(!wardrobe.includes("bottom-2 left-2 top-2 w-1"), "runtime toast does not use a full-height status strip");
assert.ok(wardrobe.includes("WebkitLineClamp: 3"), "runtime toast clamps body copy to three lines");
assert.ok(wardrobe.includes("rounded-[var(--ui-radius-nav-active)]"), "mobile nav active item uses concentric nav radius");

assert.ok(!garmentFlow.includes("Step 3"), "garment intake code must not mention Step 3");
assert.ok(!garmentFlow.includes("步骤 3"), "garment intake code must not mention 步骤 3");

console.log("ui overlay contract: passed");
