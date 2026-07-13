import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getBackRoute } from "../src/lib/app-route";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const motion = read("src/components/motion-common.tsx");
const detailShell = read("src/components/detail-shell.tsx");
const immersive = read("src/components/garment-immersive-detail.tsx");
const garment = read("src/components/garment-detail-3.0.tsx");
const outfit = read("src/components/outfit-list-view.tsx");
const wishlist = read("src/components/wishlist-view-2.0.tsx");
const wardrobe = read("src/components/wardrobe-app.tsx");

// Shared Tab physics: one moving indicator and one same-level content fade.
assert.match(detailShell, /layoutId=\{`detail-tab-indicator-\$\{indicatorId\}`\}/);
assert.match(detailShell, /data-detail-tab-indicator="true"/);
assert.match(detailShell, /<AnimatePresence mode="popLayout" initial=\{false\}>/);
assert.match(detailShell, /data-detail-tab-panel=\{activeKey\}/);
assert.doesNotMatch(detailShell, /height:\s*["']auto["']/);
for (const [name, source] of [["garment", garment], ["outfit", outfit], ["wishlist", wishlist]] as const) {
  assert.match(source, /<DetailTabContent activeKey=\{(?:activeTab|detailTab)\}>/, `${name} detail must use shared Tab content motion`);
  assert.doesNotMatch(source, /<MotionImageLightbox/, `${name} detail must not create a private Lightbox`);
}

// Source-anchored Lightbox and B2 runtime controller wiring.
assert.match(motion, /useLightboxDragDismiss\(\{/);
assert.match(motion, /zoomScale,[\s\S]{0,100}isPanning/);
assert.match(motion, /data-lightbox-drag-enabled=\{dragDismiss\.isEnabled/);
assert.match(motion, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(motion, /draggable=\{false\}/);
assert.match(motion, /rememberLightboxSourceAnchor/);
assert.match(motion, /consumeLightboxSourceAnchor/);
assert.match(motion, /getVisibleSourceRect/);
assert.match(motion, /target\?\.getAnimations\(\)\.forEach\(\(animation\) => animation\.cancel\(\)\)/);
assert.match(motion, /data-lightbox-source-transition="pending"/);
assert.match(motion, /canReturnToSource \? "source" : "fade"/);
assert.match(motion, /durationMs = canReturnToSource \? 240 : prefersReducedMotion \? 100 : 120/);
assert.match(detailShell, /data-lightbox-source-anchor="detail-hero"/);
assert.match(detailShell, /rememberLightboxSourceAnchor\(source\)/);
assert.doesNotMatch(detailShell, /onPointerDownCapture=\{\(event\) => rememberDetailImageSource/);
assert.match(immersive, /data-lightbox-source-anchor="garment-immersive-hero"/);
assert.match(immersive, /rememberLightboxSourceAnchor\(sourceAnchorRef\.current\)/);

// Popover remains a single anchored, keyboard-accessible shared primitive.
assert.match(motion, /rect\.left \+ rect\.width \/ 2 - left[\s\S]{0,260}transformOrigin/);
assert.match(motion, /\["ArrowDown", "ArrowUp", "Home", "End"\]/);
assert.match(motion, /event\.key === "Escape"[\s\S]{0,180}requestDismiss\("escape"\)/);
assert.match(motion, /restoreFocusTo: anchorRef/);
for (const [name, source] of [["garment", garment], ["outfit", outfit], ["wishlist", wishlist]] as const) {
  assert.match(source, /<MotionPopoverMenu[\s\S]{0,180}anchorRef=\{menuAnchorRef/, `${name} more menu must use its real trigger anchor`);
}

// The four approved source contexts keep their exact back destination.
assert.deepEqual(
  getBackRoute({ name: "garment_detail", itemId: 1, returnTo: "wardrobe_home" }),
  { name: "wardrobe_home" },
);
assert.deepEqual(
  getBackRoute({ name: "garment_detail", itemId: 1, returnTo: "wishlist_purchased" }),
  { name: "wishlist_purchased" },
);
assert.deepEqual(
  getBackRoute({ name: "outfit_detail", outfitId: "outfit-1", returnTo: "outfit_home" }),
  { name: "outfit_home" },
);
assert.deepEqual(
  getBackRoute({ name: "outfit_detail", outfitId: "outfit-1", returnTo: "outfit_calendar" }),
  { name: "outfit_calendar" },
);
const nestedReturn = { name: "garment_detail", itemId: 7, returnTo: "wardrobe_home", initialTab: "pairing" } as const;
assert.deepEqual(
  getBackRoute({ name: "outfit_detail", outfitId: "outfit-2", returnTo: "outfit_home", returnRoute: nestedReturn }),
  nestedReturn,
);
assert.match(outfit, /onViewOutfit=\{\(outfitId\) => openOutfitDetail\(outfitId, "library"\)\}/);
assert.match(outfit, /onViewOutfit=\{\(outfitId\) => openOutfitDetail\(outfitId, "planning_calendar"\)\}/);
assert.match(outfit, /setSubPage\(detailReturnTo\)/);
assert.match(outfit, /const \[planningMonthDate, setPlanningMonthDate\]/);
assert.match(outfit, /const \[selectedPlanDate, setSelectedPlanDate\]/);
assert.match(wardrobe, /setPendingViewingItemReturnTarget\("wishlist_owned"\)[\s\S]{0,180}setPendingViewingItemId\(itemId\)/);
assert.match(wardrobe, /pendingViewingItemReturnTarget === "wishlist_owned"[\s\S]{0,100}\{ name: "wishlist_purchased" \}/);

console.log("detail continuity C2 contracts passed");
