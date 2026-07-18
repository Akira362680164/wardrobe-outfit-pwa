import { strict as assert } from "node:assert";
import { QWEATHER_VISUAL_CODES, QWEATHER_VISUAL_SOURCE_SHA256, resolveQWeatherVisual } from "@wardrobe/domain-catalog";
import { canvasEligibility, createWeatherScene, prototypeSceneFingerprint } from "../src/lib/home/weather-canvas-engine";
import { createWeatherFrameScheduler } from "../src/lib/home/weather-canvas-scheduler";
import { classifyLocationPermission, sanitizeResolvedLocationCandidates } from "../src/lib/home/device-location";

assert.equal(QWEATHER_VISUAL_SOURCE_SHA256, "30c97e315d2efd0d9bfcf10125177d58cf9edb479b8d9310476752277cbe37db");
assert.equal(QWEATHER_VISUAL_CODES.length, 62);
for (const code of ["304", "403", "508", "512"] as const) {
  const a = createWeatherScene(code, "today");
  const b = createWeatherScene(code, "today");
  assert.equal(prototypeSceneFingerprint(a, 0), prototypeSceneFingerprint(b, 0), `${code} seed/clock must be deterministic`);
}
assert.equal(resolveQWeatherVisual("998").static, true);
assert.equal(canvasEligibility({ kind: "today", code: "998", forecast: true, stale: false }), "static_unknown");
assert.equal(canvasEligibility({ kind: "tomorrow", code: "304", forecast: true, stale: false }), "static_tomorrow");
assert.equal(canvasEligibility({ kind: "today", code: "304", forecast: false, stale: false }), "static_fallback");
assert.equal(canvasEligibility({ kind: "today", code: "304", forecast: true, stale: true }), "static_stale");
assert.equal(canvasEligibility({ kind: "today", code: "304", forecast: true, stale: false }), "dynamic_today");

const frames: number[] = [];
const resumes: boolean[] = [];
const scheduler = createWeatherFrameScheduler((time, resumed) => { frames.push(time); resumes.push(resumed); });
scheduler.setVisible(true);
scheduler.setForeground(true);
scheduler.advanceForTest(0);
scheduler.advanceForTest(18);
scheduler.advanceForTest(35);
assert.equal(frames.length, 1, "single scheduler targets about 29 FPS");
scheduler.setForeground(false);
scheduler.advanceForTest(2000);
scheduler.setForeground(true);
scheduler.advanceForTest(2040);
assert.equal(frames.length, 2, "resume must not catch up or replay missed frames");
assert.equal(resumes.at(-1), true, "resume frame must be identified so scene clock uses zero delta");
scheduler.setReducedMotion(true);
scheduler.advanceForTest(2080);
assert.equal(frames.length, 2, "reduced motion has no loop frames");
scheduler.destroy();

assert.equal(classifyLocationPermission({ location: "prompt", coarseLocation: "prompt" }), "prompt");
assert.equal(classifyLocationPermission({ location: "denied", coarseLocation: "denied" }), "denied");
assert.equal(classifyLocationPermission({ location: "granted", coarseLocation: "granted" }), "granted");
const candidates = sanitizeResolvedLocationCandidates([{ locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai", centroidLatitude: 31.23, centroidLongitude: 121.47 }]);
assert.deepEqual(candidates, [{ locationId: "101020100", displayName: "上海", timezone: "Asia/Shanghai" }]);
assert.equal("latitude" in candidates[0]!, false, "coordinates must not survive candidate resolution");
console.log("home feed P3 fixtures: passed");
