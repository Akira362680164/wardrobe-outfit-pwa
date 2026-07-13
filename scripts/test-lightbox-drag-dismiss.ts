import assert from "node:assert/strict";
import {
  canDragDismissLightbox,
  resolveLightboxDragDismiss,
  useLightboxDragDismiss,
} from "../src/components/use-lightbox-drag-dismiss";

assert.equal(typeof useLightboxDragDismiss, "function", "C2-ready hook must be exported");
assert.equal(canDragDismissLightbox({}), true);
assert.equal(canDragDismissLightbox({ zoomScale: 1.01 }), true);
assert.equal(canDragDismissLightbox({ zoomScale: 1.02 }), false, "zoomed image owns pan gestures");
assert.equal(canDragDismissLightbox({ isPanning: true }), false, "active image pan owns gestures");
assert.equal(canDragDismissLightbox({ enabled: false }), false);

const slowShort = resolveLightboxDragDismiss({
  offsetY: 60,
  velocityY: 0,
  viewportHeight: 844,
});
assert.equal(slowShort.shouldDismiss, false);
assert.equal(slowShort.thresholdY, 844 * 0.18);

const deliberate = resolveLightboxDragDismiss({
  offsetY: 170,
  velocityY: 0,
  viewportHeight: 844,
});
assert.equal(deliberate.shouldDismiss, true, "deliberate downward drag dismisses");

const flick = resolveLightboxDragDismiss({
  offsetY: 32,
  velocityY: 780,
  viewportHeight: 844,
});
assert.equal(flick.shouldDismiss, true, "short downward flick uses projected endpoint");
assert.ok(flick.projectedY > flick.thresholdY);

const reversal = resolveLightboxDragDismiss({
  offsetY: 110,
  velocityY: -900,
  viewportHeight: 844,
});
assert.equal(reversal.shouldDismiss, false, "upward reversal cancels dismiss");

const tinyFastMove = resolveLightboxDragDismiss({
  offsetY: 10,
  velocityY: 2000,
  viewportHeight: 844,
});
assert.equal(tinyFastMove.shouldDismiss, false, "minimum 18px movement prevents accidental dismiss");

const zoomed = resolveLightboxDragDismiss({
  offsetY: 220,
  velocityY: 1200,
  viewportHeight: 844,
  zoomScale: 2,
});
assert.equal(zoomed.shouldDismiss, false, "zoom gate overrides drag distance and velocity");

const panning = resolveLightboxDragDismiss({
  offsetY: 220,
  velocityY: 1200,
  viewportHeight: 844,
  isPanning: true,
});
assert.equal(panning.shouldDismiss, false, "pan gate overrides drag distance and velocity");

assert.equal(resolveLightboxDragDismiss({ offsetY: 100, velocityY: 0, viewportHeight: 390 }).thresholdY, 96);
assert.equal(resolveLightboxDragDismiss({ offsetY: 100, velocityY: 0, viewportHeight: 1200 }).thresholdY, 160);

console.log("✅ test-lightbox-drag-dismiss: gate, projection, reversal and thresholds passed");
