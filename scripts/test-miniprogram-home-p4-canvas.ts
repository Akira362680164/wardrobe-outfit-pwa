import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { QWEATHER_VISUAL_CODES } from "../packages/domain-catalog/src/weather-visuals";
import {
  WEATHER_CANVAS_DRAW_ORDER,
  canvasEligibility,
  createWeatherScene,
  triggerWeatherSceneEvent,
} from "../src/lib/home/weather-canvas-engine";
import {
  WEATHER_CANVAS_MAX_DPR,
  WEATHER_CANVAS_TARGET_FPS,
} from "../src/lib/home/weather-canvas-scheduler";

const require = createRequire(import.meta.url);
const mini = require("../apps/wechat-miniprogram/generated/wardora-weather-canvas.js") as typeof import("../src/lib/home/weather-canvas-engine") & typeof import("../src/lib/home/weather-canvas-scheduler");

assert.equal(QWEATHER_VISUAL_CODES.length, 62);
assert.deepEqual(mini.WEATHER_CANVAS_DRAW_ORDER, WEATHER_CANVAS_DRAW_ORDER);
assert.equal(mini.WEATHER_CANVAS_TARGET_FPS, WEATHER_CANVAS_TARGET_FPS);
assert.equal(mini.WEATHER_CANVAS_MAX_DPR, WEATHER_CANVAS_MAX_DPR);
assert.equal(mini.WEATHER_CANVAS_TARGET_FPS, 29);
assert.equal(mini.WEATHER_CANVAS_MAX_DPR, 2);
assert.match(readFileSync(new URL("../scripts/generate-miniprogram-home-shared.mjs", import.meta.url), "utf8"), /createOffscreenCanvas/, "WeChat host must adapt the App texture canvas without forking its render semantics");

for (const code of [...QWEATHER_VISUAL_CODES, "998", "999", "future-unknown"]) {
  for (const key of ["today", "tomorrow"] as const) {
    assert.deepEqual(snapshot(mini.createWeatherScene(code, key)), snapshot(createWeatherScene(code, key)), `${code}/${key} must use the exact App P3 scene`);
  }
}

for (const code of ["304", "403", "508", "512", "998"]) {
  const appScene = createWeatherScene(code, "today");
  const miniScene = mini.createWeatherScene(code, "today");
  appScene.clock = miniScene.clock = 7.25;
  triggerWeatherSceneEvent(appScene, code === "508" ? "hail" : "lightning");
  mini.triggerWeatherSceneEvent(miniScene, code === "508" ? "hail" : "lightning");
  assert.deepEqual(snapshot(miniScene), snapshot(appScene), `${code} fixed clock/event state must remain identical`);
}

assert.equal(mini.canvasEligibility({ kind: "today", code: "304", forecast: true, stale: false }), canvasEligibility({ kind: "today", code: "304", forecast: true, stale: false }));
assert.equal(mini.canvasEligibility({ kind: "tomorrow", code: "304", forecast: true, stale: false }), "static_tomorrow");
assert.equal(mini.canvasEligibility({ kind: "today", code: "998", forecast: true, stale: false }), "static_unknown");
assert.equal(mini.canvasEligibility({ kind: "today", code: "304", forecast: false, stale: false }), "static_fallback");
assert.equal(mini.canvasEligibility({ kind: "today", code: "304", forecast: true, stale: true }), "static_stale");

console.log("miniprogram P4 Canvas shared-kernel fixtures passed");

function snapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
