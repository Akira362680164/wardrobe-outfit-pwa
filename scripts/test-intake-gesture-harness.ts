import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { build } from "esbuild";
import { chromium } from "playwright";

async function main() {
const root = resolve(__dirname, "..");
const source = "data:image/svg+xml," + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="390" height="520" viewBox="0 0 390 520">
    <rect width="390" height="520" fill="#d9e3ea"/>
    <path d="M92 80h206v360H92z" fill="#758ca1"/>
  </svg>
`);

const entry = `
  import React, { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { ImageCropEditor } from "./src/components/image-crop-editor";
  import { TemperatureRangeSlider } from "./src/components/temperature-range-slider";

  function Harness() {
    const [temperature, setTemperature] = useState({ minC: -5, maxC: 10 });
    const [changeCount, setChangeCount] = useState(0);
    return <main>
      <section data-testid="temperature-host">
        <output data-testid="temperature-value">{temperature.minC},{temperature.maxC}</output>
        <output data-testid="temperature-change-count">{changeCount}</output>
        <TemperatureRangeSlider
          value={temperature}
          onChange={(next) => {
            setChangeCount((count) => count + 1);
            setTemperature(next);
          }}
        />
      </section>
      <div className="page-spacer" />
      <section className="crop-host" data-testid="crop-host">
        <ImageCropEditor
          source=${JSON.stringify(source)}
          variant="embedded"
          onCancel={() => {}}
          onConfirm={() => {}}
        />
      </section>
    </main>;
  }

  createRoot(document.getElementById("root")).render(<Harness />);
`;

const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: root,
    sourcefile: "b4-intake-gesture-harness.tsx",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  write: false,
  tsconfig: resolve(root, "tsconfig.json"),
});

const script = bundle.outputFiles[0]?.text;
assert.ok(script, "browser harness bundle must be generated");

const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 390px; min-height: 1200px; font-family: sans-serif; }
  main { width: 390px; overflow-x: hidden; }
  [data-testid="temperature-host"] { width: 390px; padding: 12px 0; }
  [data-slider-intent-lock] { position: relative; display: block; width: 390px; height: 44px; }
  button[data-handle] { position: absolute; padding: 0; border: 0; }
  button[data-handle] > span { display: block; border-radius: 999px; background: #355c7d; }
  .page-spacer { height: 120px; }
  .crop-host { width: 390px; height: 420px; background: #111; }
  .crop-host [data-crop-gesture] { position: relative; width: 100%; height: 100%; overflow: hidden; }
  .crop-host [data-crop-gesture] > img,
  .crop-host [data-crop-frame] { position: absolute; }
</style></head><body><div id="root"></div><script>${script}</script></body></html>`;

const server = createServer((_, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert.ok(address && typeof address !== "string");

const browser = await chromium.launch({ headless: true });
try {
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`http://127.0.0.1:${address.port}`, { waitUntil: "networkidle" });
assert.equal(await page.evaluate(() => window.innerWidth), 390, "harness viewport must be 390px");
await page.waitForTimeout(100);
assert.deepEqual(errors, [], `harness must mount without page errors: ${errors.join(" | ")}`);

const cdp = await context.newCDPSession(page);
async function touch(type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await page.waitForTimeout(40);
}

async function valueText(testId: string) {
  return page.getByTestId(testId).textContent();
}

const track = await page.locator("[data-slider-intent-lock]").boundingBox();
const minKnob = await page.locator('[data-handle="min"]').boundingBox();
assert.ok(track && minKnob, "temperature track and min knob must be measurable");
const knobStartX = minKnob.x + minKnob.width / 2 + 8;
const knobStartY = minKnob.y + minKnob.height / 2;

// Track gestures never start a value drag.
await touch("touchStart", track.x + track.width * 0.78, track.y + track.height / 2);
await touch("touchMove", track.x + track.width * 0.9, track.y + track.height / 2);
await touch("touchEnd", 0, 0);
assert.equal(await valueText("temperature-value"), "-5,10", "track drag must not change temperature");

// Pointerdown retains the grab offset and a vertical gesture is left to page scrolling.
await touch("touchStart", knobStartX, knobStartY);
assert.equal(await valueText("temperature-value"), "-5,10", "knob pointerdown must not jump the value");
await touch("touchMove", knobStartX + 2, knobStartY + 46);
await touch("touchEnd", 0, 0);
assert.equal(await valueText("temperature-value"), "-5,10", "vertical touch intent must not change temperature");
assert.equal(await valueText("temperature-change-count"), "0", "non-horizontal gestures must not emit onChange");

// Horizontal drag follows outside the knob and repeated moves at one integer emit once.
await touch("touchStart", knobStartX, knobStartY);
await touch("touchMove", knobStartX + 78, knobStartY + 1);
const changedValue = await valueText("temperature-value");
const firstChangeCount = Number(await valueText("temperature-change-count"));
assert.notEqual(changedValue, "-5,10", "horizontal knob drag must update temperature");
assert.ok(firstChangeCount >= 1, "horizontal knob drag must emit a change");
await touch("touchMove", knobStartX + 78, knobStartY + 1);
await touch("touchMove", knobStartX + 78, knobStartY + 1);
assert.equal(
  Number(await valueText("temperature-change-count")),
  firstChangeCount,
  "same rounded integer must not emit duplicate onChange",
);
await touch("touchMove", knobStartX + 150, knobStartY + 70);
const outsideChangeCount = Number(await valueText("temperature-change-count"));
assert.ok(outsideChangeCount > firstChangeCount, "pointer capture must keep updating after the pointer leaves the 44px knob");
await touch("touchMove", knobStartX + 150, knobStartY + 70);
assert.equal(
  Number(await valueText("temperature-change-count")),
  outsideChangeCount,
  "same out-of-knob integer must remain de-duplicated",
);
await touch("touchEnd", 0, 0);

await page.getByTestId("crop-host").scrollIntoViewIfNeeded();
await page.locator("[data-crop-frame]").waitFor({ state: "visible" });
const cropImage = await page.locator("[data-crop-gesture] > img").boundingBox();
const cropFrame = await page.locator("[data-crop-frame]").boundingBox();
assert.ok(cropImage && cropFrame, "crop image and frame must be measurable");
const cropStartX = cropFrame.x + cropFrame.width / 2;
const cropStartY = cropFrame.y + cropFrame.height / 2;
await touch("touchStart", cropStartX, cropStartY);
await touch("touchMove", 1, cropStartY);
const resistedFrame = await page.locator("[data-crop-frame]").boundingBox();
assert.ok(resistedFrame, "resisted crop frame must remain visible");
assert.ok(resistedFrame.x < cropImage.x, "crop frame presentation may cross the image edge while dragging");
assert.ok(cropImage.x - resistedFrame.x <= 44.5, "crop edge resistance must cap visual overshoot");
await touch("touchEnd", 0, 0);
await page.waitForTimeout(700);
const settledFrame = await page.locator("[data-crop-frame]").boundingBox();
assert.ok(settledFrame, "settled crop frame must remain visible");
assert.ok(Math.abs(settledFrame.x - cropImage.x) <= 1.5, "crop frame must spring back to the legal image edge");

const screenshotPath = "/tmp/wardrobe-b4-intake-gesture-390.png";
await page.screenshot({ path: screenshotPath, fullPage: false });
assert.deepEqual(errors, [], `browser harness must not raise page errors: ${errors.join(" | ")}`);

console.log(`B4 390px touch harness passed; screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
