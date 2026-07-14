import assert from "node:assert/strict";
import http from "node:http";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const carouselPath = join(root, "src/components/swipe-image-carousel.tsx");
const lightboxControllerPath = join(root, "src/components/use-lightbox-drag-dismiss.ts");

function resolveSourcePath(path) {
  for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${path}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return path;
}

const entry = `
  import React, { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { motion } from "motion/react";
  import { SwipeImageCarousel } from ${JSON.stringify(carouselPath)};
  import { useLightboxDragDismiss } from ${JSON.stringify(lightboxControllerPath)};

  const svg = (fill, label) => "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="390" height="300"><rect width="100%" height="100%" fill="' + fill + '"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="40">' + label + '</text></svg>'
  );
  const slides = [
    { kind: "image", id: "one", imageDataUrl: svg("#2255aa", "ONE ORIGINAL"), thumbnailSrc: svg("#662222", "ONE THUMB"), displaySrc: svg("#2255aa", "ONE ORIGINAL"), alt: "one" },
    { kind: "image", id: "two", imageDataUrl: svg("#228855", "TWO ORIGINAL"), thumbnailSrc: svg("#664422", "TWO THUMB"), displaySrc: svg("#228855", "TWO ORIGINAL"), alt: "two" },
    { kind: "image", id: "three", imageDataUrl: svg("#884488", "THREE ORIGINAL"), thumbnailSrc: svg("#444444", "THREE THUMB"), displaySrc: svg("#884488", "THREE ORIGINAL"), alt: "three" },
  ];
  window.__carouselEvents = [];

  function CarouselHarness() {
    const [index, setIndex] = useState(0);
    const [clicks, setClicks] = useState(0);
    window.__setCarouselIndex = setIndex;
    window.__carouselTelemetry = { index, clicks };
    return React.createElement("div", { id: "carousel-shell" },
      React.createElement(SwipeImageCarousel, {
        slides,
        index,
        variant: "detail",
        ariaLabel: "gesture harness carousel",
        onIndexChange: (next) => {
          window.__carouselEvents.push({ type: "index", next, at: performance.now() });
          setIndex(next);
        },
        onImageClick: () => setClicks((value) => value + 1),
      }),
    );
  }

  function LightboxControllerHarness() {
    const [zoomScale, setZoomScale] = useState(1);
    const [dismisses, setDismisses] = useState(0);
    const controller = useLightboxDragDismiss({
      zoomScale,
      isPanning: false,
      viewportHeight: 844,
      onDismiss: () => setDismisses((value) => value + 1),
    });
    window.__setLightboxZoom = setZoomScale;
    window.__resetLightboxDrag = controller.reset;
    window.__lightboxTelemetry = { zoomScale, dismisses, enabled: controller.isEnabled };
    return React.createElement(motion.div, {
      id: "lightbox-backdrop",
      style: { opacity: controller.backdropOpacity },
    }, React.createElement(motion.div, {
      id: "lightbox-drag-surface",
      style: { y: controller.y, scale: controller.imageScale, touchAction: "none" },
      ...controller.bindings,
    }, "LIGHTBOX DRAG SURFACE"));
  }

  function Harness() {
    return React.createElement(React.Fragment, null,
      React.createElement(CarouselHarness),
      React.createElement("div", { id: "scroll-spacer" }, "vertical scroll space"),
      React.createElement(LightboxControllerHarness),
      React.createElement("div", { id: "page-tail" }),
    );
  }

  createRoot(document.getElementById("root")).render(React.createElement(Harness));
`;

const stubs = new Map([
  ["@/components/garment-image", `
    import React from "react";
    export function GarmentImage({ src, alt, className = "" }) {
      return React.createElement("img", { src, alt, className, "data-rendered-src": src });
    }
  `],
  ["@/components/online/online-asset-image", `
    import React from "react";
    export function OnlineAssetImage({ alt = "" }) { return React.createElement("div", { "data-online-stub": "true", "aria-label": alt }); }
    export function OnlineCroppedAssetImage({ alt = "" }) { return React.createElement("div", { "data-online-cropped-stub": "true", "aria-label": alt }); }
  `],
  ["@/components/original-cropped-image", `
    import React from "react";
    export function OriginalCroppedImage({ originalSrc, alt = "" }) { return React.createElement("img", { src: originalSrc, alt }); }
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
    name: "wardrobe-gesture-harness-aliases",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@\// }, (args) => {
        if (stubs.has(args.path)) return { path: args.path, namespace: "gesture-stub" };
        return { path: resolveSourcePath(join(root, "src", args.path.slice(2))) };
      });
      buildApi.onLoad({ filter: /.*/, namespace: "gesture-stub" }, (args) => ({
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
  html, body { margin: 0; width: 100%; min-height: 100%; font-family: system-ui, sans-serif; }
  #root { width: 390px; min-height: 1800px; }
  #carousel-shell { width: 390px; height: 300px; }
  .relative { position: relative; }
  .absolute { position: absolute; }
  .inset-0 { inset: 0; }
  .inset-y-0 { top: 0; bottom: 0; }
  .left-0 { left: 0; }
  .flex { display: flex; }
  .grid { display: grid; }
  .h-full { height: 100%; }
  .w-full { width: 100%; }
  .shrink-0 { flex-shrink: 0; }
  .overflow-hidden { overflow: hidden; }
  .block { display: block; }
  .object-contain { object-fit: contain; }
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  #scroll-spacer { height: 900px; padding-top: 24px; color: #777; }
  #lightbox-backdrop { display: grid; place-items: center; width: 390px; height: 360px; background: rgba(0,0,0,.8); }
  #lightbox-drag-surface { display: grid; place-items: center; width: 320px; height: 220px; border-radius: 16px; background: #2255aa; color: white; font-weight: 700; }
  #page-tail { height: 300px; }
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();

function matrixTranslateX(transform) {
  if (!transform || transform === "none") return 0;
  const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]?.split(",").map(Number) ?? [];
  return values.length === 16 ? values[12] : values[4] ?? 0;
}

async function trackX() {
  const transform = await page.locator('[data-carousel-track="true"]').evaluate((node) => getComputedStyle(node).transform);
  return matrixTranslateX(transform);
}

async function resetCarousel(index = 0) {
  await page.evaluate((next) => {
    window.__carouselEvents.length = 0;
    window.__setCarouselIndex(next);
  }, index);
  await page.waitForTimeout(700);
}

const evidence = {};
try {
  await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector('[data-carousel-width="390"]'));
  const carousel = page.locator('[aria-label="gesture harness carousel"]');
  const box = await carousel.boundingBox();
  assert.ok(box);
  const centerY = box.y + box.height / 2;

  // Pointerdown must not replace the original with the thumbnail.
  const currentImage = page.locator('[data-carousel-track="true"] > div[aria-hidden="false"] img').first();
  const sourceBefore = await currentImage.getAttribute("src");
  await page.mouse.move(box.x + 195, centerY);
  await page.mouse.down();
  await page.waitForTimeout(40);
  const sourceAfterPointerDown = await currentImage.getAttribute("src");
  await page.mouse.up();
  assert.equal(sourceAfterPointerDown, sourceBefore);
  evidence.sourceStableOnPointerDown = true;

  // Slow drag follows 1:1, then a held release returns to the same page.
  await resetCarousel(0);
  await page.mouse.move(box.x + 320, centerY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(box.x + 270, centerY, { steps: 3 });
  await page.waitForTimeout(40);
  const slowDragX = await trackX();
  assert.ok(slowDragX < -43 && slowDragX > -57, `slow drag expected -50px, got ${slowDragX}`);
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(650);
  assert.equal((await page.evaluate(() => window.__carouselTelemetry)).index, 0);
  evidence.slowDragX = slowDragX;

  // A short fast flick projects to the next snap point.
  await page.mouse.move(box.x + 330, centerY);
  await page.mouse.down();
  await page.mouse.move(box.x + 285, centerY);
  await page.mouse.move(box.x + 205, centerY);
  await page.mouse.up();
  await page.waitForTimeout(80);
  assert.equal((await page.evaluate(() => window.__carouselTelemetry)).index, 1);
  await page.waitForTimeout(650);
  assert.ok(Math.abs((await trackX()) + 390) < 1.5);
  evidence.fastFlickIndex = 1;

  // Reverse while the first spring is still moving: pointerdown freezes the
  // exact presentation x, then the new positive velocity returns to page 0.
  await resetCarousel(0);
  await page.mouse.move(box.x + 330, centerY);
  await page.mouse.down();
  await page.mouse.move(box.x + 190, centerY, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(36);
  assert.equal((await page.evaluate(() => window.__carouselTelemetry)).index, 1);
  await page.evaluate(() => {
    window.__reversePointerLog = [];
    const root = document.querySelector('[aria-label="gesture harness carousel"]');
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      root.addEventListener(type, (event) => window.__reversePointerLog.push({ type, x: event.clientX, y: event.clientY, target: event.target?.tagName }), true);
    }
  });
  await page.mouse.move(box.x + 150, centerY);
  const reverseStartX = await trackX();
  await page.mouse.down();
  const reverseGrabX = await trackX();
  assert.ok(Math.abs(reverseGrabX - reverseStartX) < 2.5, `pointerdown jumped ${reverseStartX} -> ${reverseGrabX}`);
  await page.mouse.move(box.x + 162, centerY);
  await page.waitForTimeout(24);
  const reverseFirstMoveX = await trackX();
  const reversePointerLog = await page.evaluate(() => window.__reversePointerLog);
  assert.ok(Math.abs((reverseFirstMoveX - reverseGrabX) - 12) < 3.5, `first reverse move was not 1:1: ${reverseGrabX} -> ${reverseFirstMoveX}; ${JSON.stringify(reversePointerLog)}`);
  await page.mouse.move(box.x + 345, centerY, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(750);
  const reversalTelemetry = await page.evaluate(() => ({ state: window.__carouselTelemetry, events: window.__carouselEvents }));
  assert.equal(reversalTelemetry.state.index, 0);
  assert.deepEqual(reversalTelemetry.events.map((event) => event.next), [1, 0]);
  evidence.reverseGrabX = reverseGrabX;
  evidence.reverseFirstMoveDelta = reverseFirstMoveX - reverseGrabX;

  // First-page overscroll uses a progressive curve, not fixed 25% resistance.
  await resetCarousel(0);
  await page.mouse.move(box.x + 100, centerY);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, centerY, { steps: 3 });
  const edgeDragX = await trackX();
  assert.ok(edgeDragX > 45 && edgeDragX < 95, `edge rubber-band expected 45..95px, got ${edgeDragX}`);
  await page.waitForTimeout(140);
  await page.mouse.up();
  await page.waitForTimeout(650);
  assert.equal((await page.evaluate(() => window.__carouselTelemetry)).index, 0);
  evidence.edgeDragX = edgeDragX;

  // The synthetic click belonging to a swipe is suppressed, while the next
  // independent pointer sequence opens the image normally.
  const clicksBeforeSwipe = (await page.evaluate(() => window.__carouselTelemetry)).clicks;
  await page.mouse.move(box.x + 260, centerY);
  await page.mouse.down();
  await page.mouse.move(box.x + 225, centerY);
  await page.waitForTimeout(160);
  await page.mouse.up();
  await page.waitForTimeout(40);
  assert.equal((await page.evaluate(() => window.__carouselTelemetry)).clicks, clicksBeforeSwipe);
  await page.mouse.click(box.x + 195, centerY);
  await page.waitForTimeout(30);
  assert.equal((await page.evaluate(() => window.__carouselTelemetry)).clicks, clicksBeforeSwipe + 1);
  evidence.sameSequenceClickSuppressed = true;
  evidence.nextIndependentClickAccepted = true;

  // Real touch input confirms vertical intent is left to native page scroll.
  await resetCarousel(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const clicksBeforeScroll = (await page.evaluate(() => window.__carouselTelemetry)).clicks;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.synthesizeScrollGesture", {
    x: 195,
    y: 220,
    yDistance: -180,
    speed: 600,
    gestureSourceType: "touch",
  });
  await page.waitForTimeout(250);
  const verticalResult = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.scrollingElement?.scrollHeight,
    clientHeight: document.scrollingElement?.clientHeight,
    touchAction: getComputedStyle(document.querySelector('[aria-label="gesture harness carousel"]')).touchAction,
    state: window.__carouselTelemetry,
  }));
  assert.ok(verticalResult.scrollY > 25, `vertical touch did not scroll page: ${JSON.stringify(verticalResult)}`);
  assert.equal(verticalResult.state.index, 0);
  assert.equal(verticalResult.state.clicks, clicksBeforeScroll);
  evidence.verticalScrollY = verticalResult.scrollY;

  // Exercise the isolated C2-ready Lightbox controller at the same viewport.
  const lightboxSurface = page.locator("#lightbox-drag-surface");
  await lightboxSurface.scrollIntoViewIfNeeded();
  let lightboxBox = await lightboxSurface.boundingBox();
  assert.ok(lightboxBox);
  await page.mouse.move(lightboxBox.x + lightboxBox.width / 2, lightboxBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(lightboxBox.x + lightboxBox.width / 2, lightboxBox.y + 160, { steps: 3 });
  const lightboxSlowY = await lightboxSurface.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42);
  assert.ok(lightboxSlowY > 72 && lightboxSlowY < 88, `lightbox should follow 80px drag, got ${lightboxSlowY}`);
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(650);
  assert.equal((await page.evaluate(() => window.__lightboxTelemetry)).dismisses, 0);

  lightboxBox = await lightboxSurface.boundingBox();
  assert.ok(lightboxBox);
  await page.mouse.move(lightboxBox.x + lightboxBox.width / 2, lightboxBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(lightboxBox.x + lightboxBox.width / 2, lightboxBox.y + 125);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  assert.equal((await page.evaluate(() => window.__lightboxTelemetry)).dismisses, 1);
  await page.evaluate(() => {
    window.__resetLightboxDrag();
    window.__setLightboxZoom(2);
  });
  await page.waitForTimeout(650);
  lightboxBox = await lightboxSurface.boundingBox();
  assert.ok(lightboxBox);
  await page.mouse.move(lightboxBox.x + lightboxBox.width / 2, lightboxBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(lightboxBox.x + lightboxBox.width / 2, lightboxBox.y + 190);
  const zoomGateY = await lightboxSurface.evaluate((node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42);
  await page.mouse.up();
  assert.ok(Math.abs(zoomGateY) < 1, `zoom gate allowed drag dismiss y=${zoomGateY}`);
  assert.equal((await page.evaluate(() => window.__lightboxTelemetry)).dismisses, 1);
  evidence.lightboxSlowDragY = lightboxSlowY;
  evidence.lightboxFlickDismisses = 1;
  evidence.lightboxZoomGateY = zoomGateY;

  // A fresh reduced-motion context proves that direct manipulation remains,
  // while release uses an immediate snap rather than momentum animation.
  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
  await reducedPage.waitForFunction(() => document.querySelector('[data-carousel-width="390"]'));
  const reducedCarousel = reducedPage.locator('[aria-label="gesture harness carousel"]');
  const reducedBox = await reducedCarousel.boundingBox();
  assert.ok(reducedBox);
  await reducedPage.mouse.move(reducedBox.x + 320, reducedBox.y + 150);
  await reducedPage.mouse.down();
  await reducedPage.mouse.move(reducedBox.x + 190, reducedBox.y + 150);
  await reducedPage.mouse.up();
  await reducedPage.waitForTimeout(35);
  assert.equal((await reducedPage.evaluate(() => window.__carouselTelemetry)).index, 1);
  const reducedTransform = await reducedPage.locator('[data-carousel-track="true"]').evaluate((node) => getComputedStyle(node).transform);
  assert.ok(Math.abs(matrixTranslateX(reducedTransform) + 390) < 1, `reduced-motion release was not immediate: ${reducedTransform}`);
  await reducedContext.close();
  evidence.reducedMotionImmediateSnap = true;

  console.log("✅ 390px Playwright carousel/Lightbox gesture evidence");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
