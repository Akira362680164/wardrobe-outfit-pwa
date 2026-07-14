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
const noticeSheet = read("src/components/dialogs/notice-sheet.tsx");
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
const lightboxStart = motion.indexOf("function MotionImageLightboxLayer");
const lightboxEnd = motion.indexOf("/* ------------------------------------------------------------------ */", lightboxStart + 1);
const lightbox = motion.slice(lightboxStart, lightboxEnd);
const popoverStart = motion.indexOf("function MotionPopoverMenuLayer");
const popoverEnd = motion.indexOf("/* ------------------------------------------------------------------ */", popoverStart + 1);
const popover = motion.slice(popoverStart, popoverEnd);

assert.ok(motionSheet.includes("useScrollLock(true)"), "MotionSheet locks background scroll through visual exit");
assert.ok(motionSheet.includes("<OverlayPortal>"), "MotionSheet portals into OverlayRoot");
assert.ok(motionSheet.includes("useOverlayLayer({"), "MotionSheet registers with OverlayStack");
assert.ok(motionSheet.includes("role={resolvedRole}"), "MotionSheet panel exposes role");
assert.ok(motionSheet.includes('aria-modal="true"'), "MotionSheet panel exposes aria-modal");
assert.ok(motionSheet.includes("aria-labelledby={ariaLabelledBy}"), "MotionSheet supports aria-labelledby");
assert.match(motion, /MotionSheetVariant = "action" \| "form" \| "confirm" \| "destructive"/, "MotionSheet exposes frozen variants");
assert.match(motionSheet, /dismissible[\s\S]{0,320}onDismissBlocked/, "MotionSheet exposes non-dismissible feedback");
assert.ok(!motionSheet.includes('event.key === "Escape"'), "MotionSheet delegates Escape to BackCoordinator");
assert.ok(motionSheet.includes("useTopmostFocusScope(panelRef, isTopmost)"), "MotionSheet uses the shared topmost focus scope");
assert.match(motion, /function useTopmostFocusScope[\s\S]{0,1600}event\.key !== "Tab"[\s\S]{0,700}preventDefault\(\)/, "shared overlay focus scope traps Tab");
assert.match(motionSheet, /aria-hidden=\{isTopmost \? undefined : "true"\}/, "lower MotionSheet layers are hidden from assistive tech");
assert.match(motionSheet, /inert=\{isTopmost \? undefined : true\}/, "lower MotionSheet layers are inert");
assert.ok(motionSheet.includes("aria-busy={!dismissible || undefined}"), "non-dismissible dialog exposes busy semantics");

assert.match(overlayRoot, /id = "wardrobe-overlay-root"[\s\S]{0,180}document\.body\.appendChild\(root\)/, "OverlayRoot mounts once under body");
assert.match(overlayRoot, /data-overlay-app-content="true"[\s\S]{0,180}aria-hidden=\{hasOverlay[\s\S]{0,120}inert=\{hasOverlay/, "OverlayRoot isolates App content");
assert.match(overlayRoot, /document\.activeElement instanceof HTMLElement/, "Overlay registration captures the focus return target");
assert.match(overlayStack, /if \(wasTopmost\)[\s\S]{0,420}focusSafely\(entry\.restoreFocusTo\)/, "OverlayStack restores focus after the top layer presentation updates");
assert.match(backCoordinator, /overlayStack\.requestDismiss\(reason\)[\s\S]{0,240}if \(overlay\.handled\)/, "Back coordination stops after overlay consumption");
assert.ok(!stableBack.includes("App.addListener"), "stable page handlers do not create native listeners");
assert.ok(!motionToast.includes("useOverlayLayer"), "Toast stays outside OverlayStack");

assert.ok(lightbox.includes("useScrollLock(true)"), "MotionImageLightbox locks background scroll through visual exit");
assert.ok(lightbox.includes("<OverlayPortal>"), "MotionImageLightbox portals into OverlayRoot");
assert.match(lightbox, /useOverlayLayer\(\{[\s\S]{0,120}kind: "lightbox"/, "MotionImageLightbox registers with OverlayStack");
assert.match(lightbox, /role="dialog"[\s\S]{0,160}aria-modal="true"[\s\S]{0,220}aria-label=/, "MotionImageLightbox has modal dialog semantics and an accessible name");
assert.ok(lightbox.includes("useTopmostFocusScope(layerRef, isTopmost"), "MotionImageLightbox moves and traps focus only while topmost");
assert.match(lightbox, /aria-hidden=\{isTopmost \? undefined : "true"\}[\s\S]{0,100}inert=\{isTopmost \? undefined : true\}/, "lower lightboxes are inert and hidden");

assert.ok(popover.includes("useScrollLock(true)"), "MotionPopoverMenu keeps its anchor context stable through exit");
assert.ok(popover.includes("<OverlayPortal>"), "MotionPopoverMenu portals into OverlayRoot in all compatibility modes");
assert.match(popover, /useOverlayLayer\(\{[\s\S]{0,120}kind: "popover"/, "MotionPopoverMenu registers with OverlayStack");
assert.ok(popover.includes("restoreFocusTo: anchorRef"), "MotionPopoverMenu restores focus to its trigger");
assert.match(popover, /role="menu"[\s\S]{0,140}aria-label=/, "MotionPopoverMenu exposes named menu semantics");
assert.ok(popover.includes("useTopmostFocusScope(popoverRef, isTopmost"), "MotionPopoverMenu focuses its first item");
assert.match(popover, /\["ArrowDown", "ArrowUp", "Home", "End"\]/, "MotionPopoverMenu supports expected menu navigation keys");
assert.match(popover, /event\.key === "Escape"[\s\S]{0,180}requestDismiss\("escape"\)/, "MotionPopoverMenu delegates Escape through OverlayStack");
assert.match(popover, /rect\.left \+ rect\.width \/ 2 - left[\s\S]{0,240}style\.transformOrigin/, "MotionPopoverMenu derives transform origin from its real anchor");
assert.match(popover, /document\.addEventListener\("pointerdown"/, "MotionPopoverMenu closes on outside pointerdown");
assert.ok(!popover.includes("setTimeout"), "MotionPopoverMenu has no time-based global click suppression");
assert.ok(!motion.includes("createPortal("), "shared overlays no longer bypass OverlayPortal");
assert.match(motion, /suppressClickForPointerSequence\(pointerId[\s\S]{0,1200}pointerup[\s\S]{0,400}pointercancel/, "outside-click suppression is scoped to one pointer sequence");

assert.ok(imageSourceSheet.includes("<MotionSheet"), "WardrobeImageSourceSheet delegates to MotionSheet");
assert.ok(!imageSourceSheet.includes("AnimatePresence"), "WardrobeImageSourceSheet has no private AnimatePresence");
assert.ok(!imageSourceSheet.includes("<motion."), "WardrobeImageSourceSheet has no private motion panel");
assert.ok(confirmSheet.includes("<MotionSheet"), "ConfirmActionSheet delegates to MotionSheet");
assert.ok(confirmSheet.includes('role={tone === "danger" ? "alertdialog" : "dialog"}'), "danger confirmation uses alertdialog");
assert.ok(confirmSheet.includes("ariaLabel={title}"), "confirmation sheet labels the dialog");
assert.ok(confirmSheet.includes("onClose={submitting ? () => undefined : onClose}"), "submitting confirmation cannot close");
assert.ok(confirmSheet.includes("dismissible={!submitting}"), "submitting confirmation rejects coordinated dismissal");
assert.match(confirmSheet, /label=\{cancelLabel\}[\s\S]{0,80}disabled=\{submitting\}/, "submitting disables cancel action");
assert.ok(noticeSheet.includes('role="dialog"'), "NoticeSheet exposes dialog semantics");
assert.ok(noticeSheet.includes("ariaLabel={title}"), "NoticeSheet has an accessible name");

assert.match(topBar, /aria-label="返回"[\s\S]{0,140}className="grid h-12 w-12 place-items-center -ml-1"/, "back button has 48px hit area");
assert.match(topBar, /<span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent/, "back button keeps 40px transparent rounded-rectangle hit visual");
assert.match(topBar, /aria-label="更多操作"[\s\S]{0,160}className="grid h-12 w-12 place-items-center -mr-1"/, "more button has 48px hit area");
assert.match(topBar, /app-glass-top grid[\s\S]{0,180}min-h-14 px-2/, "sub page top bar keeps controls close to screen edges without restoring a white strip");
assert.match(topBar, /<ChevronLeft size=\{20\} strokeWidth=\{2\.6\}/, "back icon is slightly larger and heavier after removing the white top strip");
assert.match(topBar, /<span className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink\/55/, "more button keeps 40px transparent rounded-rectangle hit visual");
assert.match(topBar, /<MoreHorizontal size=\{20\} strokeWidth=\{2\.6\}/, "more icon is slightly larger and heavier after removing the white top strip");

assert.match(globals, /--ui-radius-nav-active:\s*22px;/, "bottom nav active radius has concentric token");
assert.match(globals, /\.app-glass-top\s*\{[\s\S]{0,160}background:\s*rgba\(255,\s*255,\s*255,\s*0\.01\);[\s\S]{0,160}box-shadow:\s*none;/, "top glass keeps blur but removes visible white strip");
assert.match(globals, /\.app-floating-nav\s*\{[\s\S]{0,700}background:\s*rgba\(255,\s*255,\s*252,\s*0\.4\);[\s\S]{0,400}backdrop-filter:\s*blur\(34px\) saturate\(1\.5\) brightness\(1\.05\);/, "bottom nav uses the approved higher-transparency glass material");
assert.match(globals, /\.app-floating-nav::before\s*\{[\s\S]{0,800}linear-gradient\([\s\S]{0,120}135deg[\s\S]{0,500}inset 0 0 0 1px/, "bottom nav simulates angled edge refraction and depth without a displacement filter");
assert.match(globals, /data-reduced-transparency[\s\S]{0,260}\.app-floating-nav[\s\S]{0,180}backdrop-filter:\s*none;/, "bottom nav has a reduced-transparency fallback");
assert.match(globals, /--ui-card-bg:\s*rgba\(255,\s*255,\s*252,\s*0\.52\);[\s\S]{0,100}--ui-card-filter:\s*blur\(30px\) saturate\(1\.35\) brightness\(1\.04\);/, "all first-level cards reuse the previous glass material");
assert.match(globals, /\.ui-card\s*\{[\s\S]{0,500}backdrop-filter:\s*var\(--ui-card-filter\);/, "the shared first-level card token owns glass rendering");
assert.ok(!wardrobe.includes("bottom-2 left-2 top-2 w-1"), "runtime toast does not use a full-height status strip");
assert.ok(wardrobe.includes("WebkitLineClamp: 3"), "runtime toast clamps body copy to three lines");
assert.ok(wardrobe.includes("rounded-[var(--ui-radius-nav-active)]"), "mobile nav active item uses concentric nav radius");

assert.ok(!garmentFlow.includes("Step 3"), "garment intake code must not mention Step 3");
assert.ok(!garmentFlow.includes("步骤 3"), "garment intake code must not mention 步骤 3");

console.log("ui overlay contract: passed");
