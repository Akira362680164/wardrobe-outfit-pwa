import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

import { spring } from "../src/lib/motion-tokens";
import { resolveWardrobeMessageDurationMs } from "../src/components/use-wardrobe-message-controller";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const section = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
};

function dampingRatio(config: { stiffness: number; damping: number; mass: number }) {
  return config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
}

assert.equal(spring.control.bounce, 0, "ordinary controls must not bounce");
assert.equal(spring.panel.bounce, 0, "panels must not bounce without a gesture");
assert.ok(dampingRatio(spring.control) >= 0.98, "control spring is critically damped");
assert.ok(dampingRatio(spring.panel) >= 0.98, "panel spring is critically damped");
assert.ok(spring.momentum.bounce > 0, "momentum spring is the gesture-only rebound preset");
assert.equal(spring.snappy, spring.control, "snappy remains a control compatibility alias");
assert.equal(spring.soft, spring.panel, "soft remains a panel compatibility alias");
assert.equal(spring.gentle, spring.panel, "gentle remains a panel compatibility alias");

const motionCommon = read("src/components/motion-common.tsx");
const pressable = section(motionCommon, "export function AppPressable", "/* Compatibility wrapper");
assert.ok(pressable.includes("setPressed(true)"), "pointerdown enters pressed state immediately");
assert.ok(pressable.includes("setPointerCapture"), "press sequence uses pointer capture");
assert.ok(pressable.includes("PRESS_CANCEL_DISTANCE_PX"), "press cancels after the shared drag threshold");
assert.ok(pressable.includes("handlePointerLeave"), "drag-leave cancels press");
assert.ok(pressable.includes("handlePointerCancel"), "pointercancel restores press state");
assert.ok(pressable.includes("handleLostPointerCapture"), "lost capture restores press state");
assert.ok(pressable.includes('event.key === "Enter"') && pressable.includes('event.key === " "'), "keyboard press feedback covers Enter and Space");
assert.ok(pressable.includes("useReducedMotion"), "press feedback honors reduced motion");
assert.ok(pressable.includes("suppressClickRef.current"), "canceled pointer sequence suppresses its click");
assert.ok(pressable.includes('data-press-feedback={feedback}'), "control/icon/card use named feedback presets");
assert.ok(!pressable.includes("whileTap"), "AppPressable does not delegate cancellation to whileTap");

const toast = section(motionCommon, "export function MotionToast", "/*  AppPressable");
assert.ok(toast.includes("spring.control"), "Toast uses the non-bouncing control spring");
assert.ok(toast.includes("prefersReducedMotion"), "Toast becomes a reduced-motion fade");
assert.equal(resolveWardrobeMessageDurationMs("success"), 2800, "success Toast is short-lived");
assert.equal(resolveWardrobeMessageDurationMs("info"), 4000, "info Toast preserves reading time");
assert.equal(resolveWardrobeMessageDurationMs("error"), null, "error Toast stays until dismissed");
assert.equal(resolveWardrobeMessageDurationMs("action"), null, "action Toast stays until handled");

const messageController = read("src/components/use-wardrobe-message-controller.ts");
for (const lifecycleSignal of ["visibilitychange", 'addEventListener("focus"', 'addEventListener("blur"']) {
  assert.ok(messageController.includes(lifecycleSignal), `Toast countdown observes ${lifecycleSignal}`);
}
assert.ok(messageController.includes("remainingMs"), "Toast resumes from remaining time rather than restarting");
assert.ok(messageController.includes("pauseMessageDismiss") && messageController.includes("resumeMessageDismiss"), "Toast interaction can pause and resume its timer");

const progress = section(motionCommon, "export function AiTaskProgressCard", "/*  MotionShimmer");
assert.ok(progress.includes("scaleX("), "AI progress uses transform scaleX");
assert.ok(!progress.includes("width: `${clamped}%`"), "AI progress does not animate layout width");
assert.ok(progress.includes('className="sr-only" role="status"'), "AI stage has a dedicated live region");
assert.ok(!progress.includes('className="shrink-0 text-xs font-semibold text-denim tabular-nums"\n          role='), "visible percent is not itself a live region");

const shimmer = section(motionCommon, "export function MotionShimmer", "/*  MotionAccordion");
assert.ok(shimmer.includes('initial={{ x: "-100%" }}') && shimmer.includes('animate={{ x: "100%" }}'), "Shimmer moves on transform");
assert.ok(!shimmer.includes("backgroundPosition"), "Shimmer avoids background-position repainting");
assert.ok(shimmer.includes("prefersReduced"), "Shimmer is static for reduced motion");

const accordion = section(motionCommon, "export function MotionAccordion", "/*  MotionTransition");
assert.ok(accordion.includes("animateHeight && !prefersReducedMotion"), "reduced motion avoids height:auto interpolation");

const batchProgress = read("src/components/batch-ai-progress-panel.tsx");
assert.ok(batchProgress.includes("scaleX("), "batch progress uses transform scaleX");
assert.ok(!batchProgress.includes("transition-[width]"), "batch progress does not animate width");
assert.ok(batchProgress.includes('className="sr-only" role="status"'), "batch stage announcement is separate from percent");
assert.ok(!batchProgress.includes("bg-[#fbfbf8]"), "B1-touched batch surface uses a semantic color token");

const softProgress = read("src/lib/use-soft-ai-progress.ts");
assert.ok(softProgress.includes("PROGRESS_TICK_MS = 100"), "soft progress avoids a per-frame React loop");
assert.ok(!softProgress.includes("requestAnimationFrame(tick)"), "soft progress no longer schedules every animation frame");

const cardShell = read("src/components/item-shell/catalog-waterfall-card-shell.tsx");
assert.ok(cardShell.includes("<AppPressable"), "catalog card uses the shared press primitive");
assert.ok(cardShell.includes("pressDisabled={selectionMode}"), "selection mode does not scale whole cards");
assert.ok(!cardShell.includes("whileTap"), "catalog card has no private press scale");

const selectionBar = read("src/components/catalog-selection/catalog-multi-select-bar.tsx");
const bulkDeleteSheet = read("src/components/catalog-selection/catalog-bulk-delete-sheet.tsx");
assert.ok(selectionBar.includes("<AppPressable") && bulkDeleteSheet.includes("<AppPressable"), "selection actions share AppPressable");

function assertNoNestedAppPressables(path: string, source: string) {
  let depth = 0;
  for (const match of source.matchAll(/<(\/?)AppPressable\b[^>]*?(\/?)>/g)) {
    const closing = match[1] === "/";
    const selfClosing = match[2] === "/";
    if (closing) {
      depth -= 1;
      assert.ok(depth >= 0, `${path} has balanced AppPressable markup`);
      continue;
    }
    assert.equal(depth, 0, `${path} does not nest AppPressable scale surfaces`);
    if (!selfClosing) depth += 1;
  }
  assert.equal(depth, 0, `${path} has balanced AppPressable markup`);
}

for (const [path, source] of [
  ["motion-common", motionCommon],
  ["batch progress", batchProgress],
  ["catalog card", cardShell],
  ["selection bar", selectionBar],
  ["bulk delete", bulkDeleteSheet],
] as const) assertNoNestedAppPressables(path, source);

const wardrobeApp = read("src/components/wardrobe-app.tsx");
assertNoNestedAppPressables("wardrobe app B1 regions", wardrobeApp);
const globalFeedback = section(wardrobeApp, "{/* v1.0: 全局浮动", "<WardrobeImageSourceSheet");
const toastShell = section(wardrobeApp, "{/* v0.9.25-dev + v1.1 review fix", "</main>");
const navButtons = section(wardrobeApp, "function NavButton", "function StatBox");
assert.ok(globalFeedback.includes("<AppPressable"), "global FAB and create actions share AppPressable");
assert.ok(!globalFeedback.includes("whileTap") && !globalFeedback.includes("active:scale"), "global feedback region has no private press scale");
assert.ok(toastShell.includes("pauseMessageDismiss") && toastShell.includes("resumeMessageDismiss"), "Toast pauses for hover, focus, and touch press");
assert.ok(navButtons.includes("<AppPressable") && !navButtons.includes("whileTap"), "bottom navigation shares AppPressable");
assert.ok(!navButtons.includes("#ffffff"), "B1-touched navigation uses semantic color classes");

const spec = read("docs/designs/wardrobe-ui-spec.md");
assert.ok(spec.includes("##### 6.1.5 B1 即时按压与状态反馈"), "B1 owns a named UI specification subsection");

async function verifyPressablePointerLifecycle() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  const { window } = dom;

  class TestPointerEvent extends window.MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string; isPrimary?: boolean } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch";
      this.isPrimary = init.isPrimary ?? true;
    }
  }

  Object.defineProperties(globalThis, {
    window: { configurable: true, value: window },
    document: { configurable: true, value: window.document },
    navigator: { configurable: true, value: window.navigator },
    Node: { configurable: true, value: window.Node },
    Element: { configurable: true, value: window.Element },
    HTMLElement: { configurable: true, value: window.HTMLElement },
    SVGElement: { configurable: true, value: window.SVGElement },
    Event: { configurable: true, value: window.Event },
    MouseEvent: { configurable: true, value: window.MouseEvent },
    PointerEvent: { configurable: true, value: TestPointerEvent },
    KeyboardEvent: { configurable: true, value: window.KeyboardEvent },
    getComputedStyle: { configurable: true, value: window.getComputedStyle.bind(window) },
    requestAnimationFrame: { configurable: true, value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16) },
    cancelAnimationFrame: { configurable: true, value: (id: number) => window.clearTimeout(id) },
  });
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const capturedPointers = new WeakMap<HTMLElement, Set<number>>();
  window.HTMLElement.prototype.setPointerCapture = function setPointerCapture(pointerId: number) {
    const ids = capturedPointers.get(this) ?? new Set<number>();
    ids.add(pointerId);
    capturedPointers.set(this, ids);
  };
  window.HTMLElement.prototype.hasPointerCapture = function hasPointerCapture(pointerId: number) {
    return capturedPointers.get(this)?.has(pointerId) ?? false;
  };
  window.HTMLElement.prototype.releasePointerCapture = function releasePointerCapture(pointerId: number) {
    capturedPointers.get(this)?.delete(pointerId);
  };

  const React = await import("react");
  const { cleanup, fireEvent, render } = await import("@testing-library/react");
  const { AppPressable } = await import("../src/components/motion-common");

  let clickCount = 0;
  const rendered = render(React.createElement(AppPressable, {
    "aria-label": "测试按压",
    feedback: "card",
    onClick: () => { clickCount += 1; },
  }, "测试"));
  const button = rendered.getByRole("button", { name: "测试按压" }) as HTMLButtonElement;
  button.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });

  fireEvent.pointerDown(button, { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 50, clientY: 50 });
  assert.equal(button.dataset.pressed, "true", "pointerdown publishes pressed state in the same React turn");
  fireEvent.pointerMove(button, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 54, clientY: 50 });
  assert.equal(button.dataset.pressed, "true", "movement within threshold keeps press active");
  fireEvent.pointerUp(button, { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: 54, clientY: 50 });
  fireEvent.click(button);
  assert.equal(clickCount, 1, "valid pointer sequence commits exactly once");

  fireEvent.pointerDown(button, { pointerId: 2, pointerType: "touch", isPrimary: true, button: 0, clientX: 50, clientY: 50 });
  fireEvent.pointerMove(button, { pointerId: 2, pointerType: "touch", isPrimary: true, clientX: 61, clientY: 50 });
  assert.equal(button.dataset.pressed, undefined, "movement beyond 10px cancels pressed state");
  fireEvent.pointerUp(button, { pointerId: 2, pointerType: "touch", isPrimary: true, button: 0, clientX: 61, clientY: 50 });
  fireEvent.click(button);
  assert.equal(clickCount, 1, "canceled drag suppresses only its synthetic click");
  await new Promise((resolve) => window.setTimeout(resolve, 1));
  fireEvent.click(button);
  assert.equal(clickCount, 2, "independent click after canceled drag remains available");

  fireEvent.pointerDown(button, { pointerId: 3, pointerType: "touch", isPrimary: true, button: 0, clientX: 50, clientY: 50 });
  fireEvent.pointerLeave(button, { pointerId: 3, pointerType: "touch", isPrimary: true, clientX: 101, clientY: 50 });
  assert.equal(button.dataset.pressed, undefined, "pointer leave cancels pressed state");
  fireEvent.pointerUp(button, { pointerId: 3, pointerType: "touch", isPrimary: true, button: 0, clientX: 101, clientY: 50 });
  fireEvent.click(button);
  assert.equal(clickCount, 2, "drag-leave sequence cannot open the card");

  fireEvent.pointerDown(button, { pointerId: 4, pointerType: "touch", isPrimary: true, button: 0, clientX: 50, clientY: 50 });
  fireEvent.pointerCancel(button, { pointerId: 4, pointerType: "touch", isPrimary: true, clientX: 50, clientY: 50 });
  assert.equal(button.dataset.pressed, undefined, "pointercancel restores visual state");
  fireEvent.click(button);
  assert.equal(clickCount, 2, "pointercancel suppresses the canceled sequence click");

  await new Promise((resolve) => window.setTimeout(resolve, 1));
  fireEvent.keyDown(button, { key: " " });
  assert.equal(button.dataset.pressed, "true", "Space gives keyboard press feedback");
  fireEvent.keyUp(button, { key: " " });
  assert.equal(button.dataset.pressed, undefined, "Space release restores visual state");
  fireEvent.click(button);
  assert.equal(clickCount, 3, "keyboard activation remains clickable");

  const nestedGesture = render(React.createElement(AppPressable, {
    "aria-label": "轮播卡片",
    feedback: "card",
  }, React.createElement("div", { "aria-roledescription": "carousel", "data-testid": "carousel" }, "图片")));
  const gestureButton = nestedGesture.getByRole("button", { name: "轮播卡片" }) as HTMLButtonElement;
  const carousel = nestedGesture.getByTestId("carousel");
  gestureButton.getBoundingClientRect = button.getBoundingClientRect;
  fireEvent.pointerDown(carousel, { pointerId: 5, pointerType: "touch", isPrimary: true, button: 0, clientX: 50, clientY: 50 });
  assert.equal(gestureButton.dataset.pressed, "true", "nested carousel still gives immediate card press feedback");
  assert.equal(capturedPointers.get(gestureButton)?.has(5) ?? false, false, "AppPressable does not steal pointer capture from nested gesture owner");
  fireEvent.pointerMove(carousel, { pointerId: 5, pointerType: "touch", isPrimary: true, clientX: 61, clientY: 50 });
  assert.equal(gestureButton.dataset.pressed, undefined, "nested gesture movement cancels outer card press");

  cleanup();
  dom.window.close();
}

verifyPressablePointerLifecycle()
  .then(() => console.log("motion feedback B1 contract: passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
