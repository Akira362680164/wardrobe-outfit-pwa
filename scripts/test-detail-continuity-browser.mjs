import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const motionPath = join(root, "src/components/motion-common.tsx");
const overlayPath = join(root, "src/components/overlay-root.tsx");
const detailShellPath = join(root, "src/components/detail-shell.tsx");

function resolveSourcePath(path) {
  for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const entry = `
  import React, { useRef, useState } from "react";
  import { createRoot } from "react-dom/client";
  import { OverlayRoot } from ${JSON.stringify(overlayPath)};
  import {
    MotionImageLightbox,
    MotionPopoverMenu,
    rememberLightboxSourceAnchor,
  } from ${JSON.stringify(motionPath)};
  import { DetailTabContent, DetailTabs } from ${JSON.stringify(detailShellPath)};

  const imageSrc = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" rx="48" fill="#315f86"/><circle cx="400" cy="360" r="170" fill="#e8d9c5"/><text x="400" y="760" text-anchor="middle" fill="white" font-size="70">DETAIL</text></svg>'
  );

  function Harness() {
    const sourceRef = useRef(null);
    const menuAnchorRef = useRef(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [sourceHidden, setSourceHidden] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("info");
    const [dismisses, setDismisses] = useState(0);

    window.__detailHarness = {
      setZoomScale,
      setIsPanning,
      setLightboxOpen,
      getState: () => ({ lightboxOpen, sourceHidden, zoomScale, isPanning, popoverOpen, activeTab, dismisses }),
    };

    const closeLightbox = () => {
      setLightboxOpen(false);
      setDismisses((value) => value + 1);
    };
    const openFromVisibleSource = () => {
      setSourceHidden(false);
      rememberLightboxSourceAnchor(sourceRef.current);
      setLightboxOpen(true);
    };
    const openWithHiddenSource = () => {
      rememberLightboxSourceAnchor(sourceRef.current);
      setSourceHidden(true);
      setLightboxOpen(true);
    };
    const openWithoutSource = () => {
      setSourceHidden(false);
      setLightboxOpen(true);
    };

    return React.createElement(OverlayRoot, null,
      React.createElement("main", { id: "app-shell" },
        React.createElement("button", {
          id: "hero-source",
          ref: sourceRef,
          type: "button",
          style: { display: sourceHidden ? "none" : "block" },
          onClick: openFromVisibleSource,
        }, React.createElement("img", { src: imageSrc, alt: "详情来源图" })),
        React.createElement("div", { id: "controls" },
          React.createElement("button", { id: "open-hidden-source", type: "button", onClick: openWithHiddenSource }, "隐藏来源"),
          React.createElement("button", { id: "open-no-source", type: "button", onClick: openWithoutSource }, "无来源"),
          React.createElement("button", { id: "menu-trigger", ref: menuAnchorRef, type: "button", onClick: () => setPopoverOpen(true) }, "更多"),
        ),
        React.createElement("section", { id: "tab-harness" },
          React.createElement(DetailTabs, {
            tabs: [
              { key: "info", label: "信息" },
              { key: "pairing", label: "搭配" },
              { key: "record", label: "记录" },
            ],
            activeTab,
            onChange: setActiveTab,
          }),
          React.createElement(DetailTabContent, { activeKey: activeTab },
            React.createElement("div", {
              id: "panel-" + activeTab,
              style: { height: activeTab === "pairing" ? 220 : activeTab === "record" ? 80 : 130 },
            }, activeTab),
          ),
        ),
      ),
      React.createElement(MotionImageLightbox, {
        open: lightboxOpen,
        onClose: closeLightbox,
        src: imageSrc,
        alt: "详情大图",
        zoomScale,
        isPanning,
      }),
      React.createElement(MotionPopoverMenu, {
        visible: popoverOpen,
        onClose: () => setPopoverOpen(false),
        anchorRef: menuAnchorRef,
        ariaLabel: "详情更多操作",
      }, React.createElement("div", null,
        React.createElement("button", { type: "button" }, "编辑"),
        React.createElement("button", { type: "button" }, "分享"),
        React.createElement("button", { type: "button" }, "删除"),
      )),
    );
  }

  createRoot(document.getElementById("root")).render(React.createElement(Harness));
`;

const stubs = new Map([
  ["@capacitor/app", `
    export const App = { addListener: async () => ({ remove() {} }) };
  `],
  ["@/components/original-cropped-image", `
    import React from "react";
    export function OriginalCroppedImage({ originalSrc, alt = "", className = "" }) {
      return React.createElement("img", { src: originalSrc, alt, className });
    }
  `],
  ["@/components/app-sub-page-top-bar", `
    import React from "react";
    export function AppSubPageTopBar() { return React.createElement("div"); }
  `],
  ["@/components/swipe-image-carousel", `
    import React from "react";
    export function SwipeImageCarousel() { return React.createElement("div"); }
  `],
  ["@/components/item-shell/detail-section-card", `
    import React from "react";
    export function DetailSectionCard({ children }) { return React.createElement("section", null, children); }
  `],
  ["@/components/online/online-asset-image", `
    import React from "react";
    export function OnlineAssetImage({ alt = "" }) { return React.createElement("div", { "aria-label": alt }); }
  `],
]);

const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: root },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "detail-continuity-harness-aliases",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@capacitor\/app$/ }, (args) => ({ path: args.path, namespace: "detail-stub" }));
      buildApi.onResolve({ filter: /^@\// }, (args) => {
        if (stubs.has(args.path)) return { path: args.path, namespace: "detail-stub" };
        return { path: resolveSourcePath(join(root, "src", args.path.slice(2))) };
      });
      buildApi.onLoad({ filter: /.*/, namespace: "detail-stub" }, (args) => ({
        contents: stubs.get(args.path),
        loader: "tsx",
        resolveDir: root,
      }));
    },
  }],
});

const js = bundle.outputFiles.find((file) => file.path.endsWith("<stdout>"))?.text
  ?? bundle.outputFiles[0]?.text
  ?? "";
const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; min-height: 100%; font-family: system-ui, sans-serif; background: #f7f4ef; }
  button { font: inherit; }
  #root, #app-shell { width: 390px; min-height: 844px; }
  #app-shell { padding: 20px; }
  #hero-source { width: 124px; height: 154px; overflow: hidden; border: 0; border-radius: 18px; padding: 0; background: #315f86; }
  #hero-source img, [data-overlay-kind="lightbox"] img { display: block; width: 100%; height: 100%; object-fit: contain; }
  #controls { display: flex; gap: 8px; margin: 16px 0 44px; }
  #controls button { min-height: 44px; }
  #menu-trigger { margin-left: auto; }
  #tab-harness { width: 350px; }
  [role="tablist"] { display: grid; position: relative; padding: 4px; background: #e9e7e2; border-radius: 16px; }
  [role="tab"] { position: relative; isolation: isolate; height: 44px; border: 0; border-radius: 12px; background: transparent; }
  [data-detail-tab-indicator="true"] { position: absolute; inset: 0; z-index: -1; border-radius: 12px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
  [data-detail-tab-content="true"] { position: relative; margin-top: 14px; }
  [data-detail-tab-panel] { padding: 16px; border-radius: 18px; background: white; }
  .absolute { position: absolute; }
  .relative { position: relative; }
  .fixed { position: fixed; }
  .inset-0 { inset: 0; }
  .grid { display: grid; }
  .h-full { height: 100%; }
  .w-full { width: 100%; }
  .overflow-hidden { overflow: hidden; }
  [data-overlay-kind="lightbox"] { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; min-height: 100dvh; padding: 16px; outline: none; }
  [data-overlay-kind="lightbox"] > div:first-of-type { position: absolute; inset: 0; background: black; }
  [data-lightbox-source-transition] { position: relative; z-index: 10; width: 358px; height: 742px; transform-origin: center; }
  [data-lightbox-source-transition] > div { position: relative; width: 100%; height: 100%; overflow: hidden; background: black; }
  [data-lightbox-close="true"] { position: absolute; right: 8px; top: 8px; z-index: 10; width: 44px; height: 44px; border: 0; border-radius: 999px; color: white; background: rgba(0,0,0,.58); }
  [data-overlay-kind="popover"] { position: fixed; z-index: 70; width: 180px; padding: 4px; border: 1px solid #ddd; border-radius: 12px; background: white; box-shadow: 0 8px 28px rgba(0,0,0,.18); }
  [data-overlay-kind="popover"] button { display: block; width: 100%; height: 44px; border: 0; border-radius: 8px; background: white; text-align: left; padding: 0 12px; }
</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`;

const server = http.createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(js);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");

const browser = await chromium.launch({ headless: true });

function matrixTranslateY(transform) {
  if (!transform || transform === "none") return 0;
  const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]?.split(",").map(Number) ?? [];
  return values.length === 16 ? values[13] : values[5] ?? 0;
}

function matrixIsIdentity(transform) {
  if (!transform || transform === "none") return true;
  const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]?.split(",").map(Number) ?? [];
  const identity = values.length === 16
    ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    : [1, 0, 0, 1, 0, 0];
  return values.length === identity.length && values.every((value, index) => Math.abs(value - identity[index]) < 0.001);
}

async function createPage(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    ...options,
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#hero-source");
  return { context, page };
}

async function dragDown(page, distance, holdBeforeRelease = 0) {
  await page.waitForSelector('[data-overlay-kind="lightbox"][data-overlay-topmost="true"]');
  await page.waitForTimeout(180);
  const surface = page.locator("[data-lightbox-drag-enabled]");
  await surface.evaluate((node) => {
    window.__detailPointerLog = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
      node.addEventListener(type, (event) => {
        window.__detailPointerLog.push({ type, pointerType: event.pointerType, clientY: event.clientY, touchAction: getComputedStyle(node).touchAction, transform: getComputedStyle(node).transform });
        requestAnimationFrame(() => window.__detailPointerLog.push({ type: `${type}:raf`, pointerType: event.pointerType, clientY: event.clientY, touchAction: getComputedStyle(node).touchAction, transform: getComputedStyle(node).transform }));
      });
    }
  });
  const box = await surface.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(180, box.height / 3);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(35);
  await page.mouse.move(x, y + distance, { steps: 3 });
  if (holdBeforeRelease) await page.waitForTimeout(holdBeforeRelease);
  const transform = await surface.evaluate((node) => getComputedStyle(node).transform);
  const pointerLog = await page.evaluate(() => window.__detailPointerLog);
  await page.mouse.up();
  return { y: matrixTranslateY(transform), pointerLog };
}

const evidence = {};
try {
  const { context, page } = await createPage();

  // Visible source: the outer Lightbox shell performs FLIP while the inner
  // gesture surface remains independently draggable.
  await page.click("#hero-source");
  const transition = page.locator("[data-lightbox-source-transition]");
  await transition.waitFor();
  assert.equal(await transition.getAttribute("data-lightbox-source-transition"), "source");
  assert.equal(await page.locator("#hero-source").evaluate((node) => node.style.visibility), "hidden");
  await page.waitForTimeout(45);
  const enteringTransform = await transition.evaluate((node) => getComputedStyle(node).transform);
  assert.notEqual(enteringTransform, "none");
  await page.waitForTimeout(320);
  const settledTransform = await transition.evaluate((node) => getComputedStyle(node).transform);
  assert.ok(matrixIsIdentity(settledTransform));
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-overlay-kind=\"lightbox\"]", { state: "detached" });
  await page.waitForTimeout(40);
  assert.equal(await page.locator("#hero-source").evaluate((node) => node.style.visibility), "");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "hero-source");
  evidence.visibleSource = { enter: 280, exit: 240, focusRestored: true };

  // Closing during the source entrance starts from the current presentation
  // matrix instead of snapping to the fully-open identity frame first.
  await page.click("#hero-source");
  await page.waitForSelector("[data-lightbox-source-transition=\"source\"]");
  const quickCloseStart = await transition.evaluate(async (node) => {
    const animations = node.getAnimations();
    if (animations.length !== 1) {
      throw new Error(`expected one entrance animation, got ${animations.length}`);
    }
    const [entrance] = animations;
    entrance.pause();
    await entrance.ready;
    entrance.currentTime = 45;
    return {
      currentTime: entrance.currentTime,
      playState: entrance.playState,
      transform: getComputedStyle(node).transform,
    };
  });
  assert.equal(quickCloseStart.playState, "paused");
  assert.equal(quickCloseStart.currentTime, 45);
  assert.ok(!matrixIsIdentity(quickCloseStart.transform));
  await page.keyboard.press("Escape");
  const quickCloseFirstFrame = await transition.evaluate((node) => {
    const animation = node.getAnimations().at(-1);
    const effect = animation?.effect;
    return effect instanceof KeyframeEffect ? effect.getKeyframes()[0]?.transform : null;
  });
  assert.equal(quickCloseFirstFrame, quickCloseStart.transform);
  await page.waitForSelector("[data-overlay-kind=\"lightbox\"]", { state: "detached" });
  evidence.visibleSource.interruptibleClose = true;

  // An unavailable source uses the bounded fade fallback and is never hidden.
  await page.click("#open-hidden-source");
  await page.waitForSelector("[data-lightbox-source-transition=\"fade\"]");
  assert.equal(await page.locator("#hero-source").evaluate((node) => getComputedStyle(node).display), "none");
  await page.click("[data-lightbox-close=\"true\"]");
  await page.waitForSelector("[data-overlay-kind=\"lightbox\"]", { state: "detached" });
  evidence.hiddenSourceFallback = "fade";

  // Direct manipulation follows the finger 1:1, then springs back below the
  // projection threshold. A short fast downward flick dismisses.
  await page.click("#open-no-source");
  await page.waitForSelector("[data-lightbox-drag-enabled=\"true\"]");
  const slowDrag = await dragDown(page, 80, 190);
  const slowY = slowDrag.y;
  assert.ok(slowY > 72 && slowY < 88, `expected about 80px direct drag, got ${slowY}: ${JSON.stringify(slowDrag.pointerLog)}`);
  assert.ok(!slowDrag.pointerLog.some((event) => event.type === "pointercancel"), JSON.stringify(slowDrag.pointerLog));
  await page.waitForTimeout(700);
  assert.ok(await page.locator("[data-overlay-kind=\"lightbox\"]").isVisible());
  const resetTransform = await page.locator("[data-lightbox-drag-enabled]").evaluate((node) => getComputedStyle(node).transform);
  assert.ok(Math.abs(matrixTranslateY(resetTransform)) < 1);
  const fastY = (await dragDown(page, 48)).y;
  assert.ok(fastY > 35);
  await page.waitForSelector("[data-overlay-kind=\"lightbox\"]", { state: "detached" });
  evidence.dragDismiss = { slowY, fastY, projectedFlickClosed: true };

  // Zoom and pan ownership each close the drag-dismiss gate.
  await page.evaluate(() => window.__detailHarness.setZoomScale(2));
  await page.click("#open-no-source");
  await page.waitForSelector("[data-lightbox-drag-enabled=\"false\"]");
  const zoomGateY = (await dragDown(page, 120)).y;
  assert.ok(Math.abs(zoomGateY) < 1);
  assert.ok(await page.locator("[data-overlay-kind=\"lightbox\"]").isVisible());
  await page.click("[data-lightbox-close=\"true\"]");
  await page.waitForSelector("[data-overlay-kind=\"lightbox\"]", { state: "detached" });
  await page.evaluate(() => {
    window.__detailHarness.setZoomScale(1);
    window.__detailHarness.setIsPanning(true);
  });
  await page.click("#open-no-source");
  await page.waitForSelector("[data-lightbox-drag-enabled=\"false\"]");
  const panGateY = (await dragDown(page, 120)).y;
  assert.ok(Math.abs(panGateY) < 1);
  await page.click("[data-lightbox-close=\"true\"]");
  await page.waitForSelector("[data-overlay-kind=\"lightbox\"]", { state: "detached" });
  evidence.gestureOwnership = { zoomGateY, panGateY };

  // Shared Popover is anchored to the trigger, moves focus with menu keys,
  // closes on Escape, and restores focus to the same trigger.
  await page.click("#menu-trigger");
  const menu = page.getByRole("menu", { name: "详情更多操作" });
  await menu.waitFor();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "编辑");
  const geometry = await page.evaluate(() => {
    const trigger = document.querySelector("#menu-trigger").getBoundingClientRect();
    const menu = document.querySelector('[role="menu"]').getBoundingClientRect();
    const origin = getComputedStyle(document.querySelector('[role="menu"]')).transformOrigin.split(" ").map(Number.parseFloat);
    return { triggerCenterX: trigger.left + trigger.width / 2, originX: menu.left + origin[0], menuTop: menu.top, menuBottom: menu.bottom };
  });
  assert.ok(Math.abs(geometry.originX - geometry.triggerCenterX) < 1.5, JSON.stringify(geometry));
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "分享");
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "删除");
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "编辑");
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });
  await page.waitForTimeout(40);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "menu-trigger");
  evidence.popover = { anchoredOrigin: true, arrowNavigation: true, focusRestored: true };

  // Three detail tabs share exactly one moving layout indicator and use the
  // short opacity-only popLayout content transition.
  const firstIndicatorBox = await page.locator("[data-detail-tab-indicator]").boundingBox();
  assert.ok(firstIndicatorBox);
  await page.getByRole("tab", { name: "搭配" }).click();
  await page.waitForTimeout(420);
  const secondIndicatorBox = await page.locator("[data-detail-tab-indicator]").boundingBox();
  assert.ok(secondIndicatorBox);
  assert.ok(secondIndicatorBox.x > firstIndicatorBox.x + 80);
  assert.equal(await page.locator("[data-detail-tab-indicator]").count(), 1);
  assert.equal(await page.locator("[data-detail-tab-panel]").count(), 1);
  assert.equal(await page.locator("[data-detail-tab-panel]").getAttribute("data-detail-tab-panel"), "pairing");
  assert.equal(await page.locator("#panel-pairing").evaluate((node) => node.style.height), "220px");
  evidence.tabs = { sharedIndicatorTravel: secondIndicatorBox.x - firstIndicatorBox.x, activePanel: "pairing" };

  await page.screenshot({ path: "/tmp/wardrobe-c2-detail-continuity-390.png", fullPage: true });
  await context.close();

  // Reduced motion never attempts a large source FLIP and leaves the visible
  // source in place, while preserving the bounded fade fallback.
  const reduced = await createPage({ reducedMotion: "reduce" });
  await reduced.page.click("#hero-source");
  await reduced.page.waitForSelector("[data-lightbox-source-transition=\"fade\"]");
  assert.equal(await reduced.page.locator("#hero-source").evaluate((node) => node.style.visibility), "");
  const reducedTransform = await reduced.page.locator("[data-lightbox-source-transition]").evaluate((node) => getComputedStyle(node).transform);
  assert.ok(matrixIsIdentity(reducedTransform));
  await reduced.context.close();
  evidence.reducedMotion = "fade-without-source-hiding";

  console.log("detail continuity C2 390px browser evidence passed");
  console.log(JSON.stringify(evidence, null, 2));
  console.log("screenshot: /tmp/wardrobe-c2-detail-continuity-390.png");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
