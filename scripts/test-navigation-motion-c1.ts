import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppRoute } from "../src/lib/app-route";
import {
  createNavigationTransition,
  getRouteScrollKey,
} from "../src/lib/app-route";
import {
  getNavigationMotionStates,
  readPresentedWindowScrollY,
  restoreWindowScrollBeforePaint,
  saveAndResolveNavigationScroll,
  type NavigationScrollPositions,
} from "../src/components/navigation-motion";

const root = join(__dirname, "..");
const controllerSource = readFileSync(join(root, "src/components/use-app-navigation-controller.ts"), "utf8");
const appSource = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const motionSource = readFileSync(join(root, "src/components/navigation-motion.tsx"), "utf8");

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  ✅ ${name}`);
}

console.log("\n=== C1 navigation metadata ===");
const wardrobe: AppRoute = { name: "wardrobe_home" };
const detail: AppRoute = { name: "garment_detail", itemId: 42, returnTo: "wardrobe_home" };
const push = createNavigationTransition(7, wardrobe, detail, "user", "push");
check("transition keeps id/fromRoute/toRoute/source/direction together", push.id === 7
  && push.fromRoute === wardrobe
  && push.toRoute === detail
  && push.source === "user"
  && push.direction === "push");
check("controller commits route and transition atomically", /setNavigationState\(\{ route: next, transition \}\)/.test(controllerSource));
check("Tab/reset uses nav + tab", /resetToMainTab[\s\S]+?"nav", "tab"/.test(controllerSource));
check("forward open uses user + push", /const openRoute[\s\S]{0,180}?"user", "push"/.test(controllerSource));
check("back uses back + pop", /const goBack[\s\S]{0,180}?"back", "pop"/.test(controllerSource));
check("create close returns with pop", /closeCreateFlow[\s\S]{0,500}?"create", "pop"/.test(controllerSource));
check("replace is non-hierarchical", /const replaceRoute[\s\S]{0,180}?"user", "replace"/.test(controllerSource));

console.log("\n=== C1 symmetric, interruptible motion ===");
const pushStates = getNavigationMotionStates("push", false);
const popStates = getNavigationMotionStates("pop", false);
const tabStates = getNavigationMotionStates("tab", false);
const reducedStates = getNavigationMotionStates("push", true);
check("push enters from +24px and sends old page back -6px", pushStates.enter.x === 24 && pushStates.exit.x === -6);
check("pop exactly reverses both push paths", popStates.exit.x === pushStates.enter.x && popStates.enter.x === pushStates.exit.x);
check("peer Tab uses only a 4px short cross-fade", tabStates.enter.y === 4 && tabStates.enter.opacity === 0.96);
check("reduced motion removes route displacement", !("x" in reducedStates.enter) && !("y" in reducedStates.enter));
check("AnimatePresence is sync, never wait", /AnimatePresence mode="sync"/.test(motionSource) && !/mode="wait"/.test(motionSource));
check("route container has no persistent transform-gpu", !/className="[^"]*transform-gpu/.test(appSource));
check("exiting page cannot receive input", /pointerEvents: isPresent \? "auto" : "none"/.test(motionSource));

console.log("\n=== C1 repeated Tab and push/pop scroll harness ===");
const positions: NavigationScrollPositions = {};
let renderedRoute: AppRoute = wardrobe;
let presentedY = 412;
function navigate(toRoute: AppRoute) {
  presentedY = saveAndResolveNavigationScroll(positions, renderedRoute, toRoute, presentedY);
  renderedRoute = toRoute;
  return presentedY;
}

const outfit: AppRoute = { name: "outfit_home" };
const wishlist: AppRoute = { name: "wishlist_home" };
const settings: AppRoute = { name: "settings_home" };
check("first Tab has no inherited outgoing scroll", navigate(outfit) === 0);
presentedY = 188;
check("second Tab starts independently", navigate(wishlist) === 0);
presentedY = 96;
check("third Tab starts independently", navigate(settings) === 0);
presentedY = 64;
check("returning Tab restores its own position", navigate(wardrobe) === 412);

for (const route of [outfit, wishlist, settings, wardrobe]) navigate(route);
check("rapid four-Tab sequence ends at requested route without a queue", renderedRoute.name === "wardrobe_home");
check("rapid sequence retains every Tab position", positions.wardrobe_home === 412
  && positions.outfit_home === 188
  && positions.wishlist_home === 96
  && positions.settings_home === 64);

presentedY = 512;
check("detail push starts at top", navigate(detail) === 0);
presentedY = 75;
check("detail pop restores list before animation timing", navigate(wardrobe) === 512);
check("different detail items have independent scroll keys", getRouteScrollKey(detail) !== getRouteScrollKey({ ...detail, itemId: 43 }));

console.log("\n=== C1 pre-paint and Sheet handoff contracts ===");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
let restoredY = -1;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    scrollY: 23,
    pageYOffset: 23,
    scrollTo: (options: ScrollToOptions) => { restoredY = Number(options.top ?? 0); },
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { body: { style: { position: "", top: "" } } },
});
check("ordinary restore executes synchronously", (() => {
  restoreWindowScrollBeforePaint(188);
  return restoredY === 188;
})());
(globalThis.document.body.style as CSSStyleDeclaration).position = "fixed";
(globalThis.document.body.style as CSSStyleDeclaration).top = "-347px";
check("Sheet lock exposes its visually frozen scroll position", readPresentedWindowScrollY() === 347);

if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
else delete (globalThis as { window?: unknown }).window;
if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
else delete (globalThis as { document?: unknown }).document;

const createHandler = /function handleCreateAction[\s\S]+?\n  \}/.exec(appSource)?.[0] ?? "";
check("Sheet selection and intake push share one event (no timer wait)", /setShowCreateSheet\(false\)/.test(createHandler)
  && /navigation\.openRoute/.test(createHandler)
  && !/setTimeout|requestAnimationFrame/.test(createHandler));
check("outfit trigger is committed before its intake route", createHandler.indexOf("setCreateOutfitTrigger") < createHandler.indexOf('name: "intake_outfit"'));
check("legacy animation-complete triple-rAF restore is removed", !/pendingRestoreViewRef|viewScrollPositionsRef|onAnimationComplete/.test(appSource));
check("bottom navigation keeps B1 AppPressable and adds only a shared layout indicator", /function MobileNavButton[\s\S]+?<AppPressable[\s\S]+?layoutId=\{selectionLayoutId\}/.test(appSource));

console.log(`\n${passed} C1 navigation checks passed`);
