import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getBackRoute, getMainTabHomeRoute } from "../src/lib/app-route";
import { getWardoraHomeRoute, isWardoraHomeFeedEnabled } from "../src/lib/home/home-feed-rollout";

assert.equal(isWardoraHomeFeedEnabled(undefined), true, "missing env must default to home_feed");
assert.equal(isWardoraHomeFeedEnabled(""), true, "empty env must not silently roll back");
assert.equal(isWardoraHomeFeedEnabled("false"), true, "only explicit true disables the new home");
assert.equal(isWardoraHomeFeedEnabled("true"), false, "explicit emergency-off must enable legacy rollback");
assert.deepEqual(getWardoraHomeRoute(undefined), { name: "home_feed" });
assert.deepEqual(getWardoraHomeRoute("true"), { name: "wardrobe_home" });

const previousEmergencyOff = process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF;
delete process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF;
assert.deepEqual(getMainTabHomeRoute("wardrobe"), { name: "home_feed" }, "Home Tab must target the new home");
assert.deepEqual(
  getBackRoute({ name: "garment_detail", itemId: 7, returnTo: "wardrobe_home" }),
  { name: "home_feed" },
  "legacy detail return targets must normalize to the production home",
);
process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF = "true";
assert.deepEqual(getMainTabHomeRoute("wardrobe"), { name: "wardrobe_home" }, "emergency rollback must remain launchable");
assert.deepEqual(
  getBackRoute({ name: "garment_detail", itemId: 7, returnTo: "home_feed" }),
  { name: "wardrobe_home" },
  "detail Back must follow the emergency rollback home",
);
if (previousEmergencyOff === undefined) delete process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF;
else process.env.NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF = previousEmergencyOff;

const root = join(import.meta.dirname, "..");
const navigation = readFileSync(join(root, "src/components/use-app-navigation-controller.ts"), "utf8");
const app = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const appRoot = readFileSync(join(root, "src/components/app-root.tsx"), "utf8");
const rollout = readFileSync(join(root, "src/lib/home/home-feed-rollout.ts"), "utf8");
const capacitorSanitizer = readFileSync(join(root, "scripts/patch-capacitor-logs.mjs"), "utf8");

assert.match(navigation, /const DEFAULT_ROUTE: AppRoute = getWardoraHomeRoute\(\)/, "cold start and login must use the production home");
assert.match(navigation, /case "wardrobe": setRoute\(getWardoraHomeRoute\(\)/, "Home Tab must use the production home");
assert.match(app, /label: "首页"/);
assert.match(app, /label: "穿搭"/);
assert.match(app, /renderWardrobeContent=\{\(\) => renderWardrobeCapability\(undefined, defaultHomeRoute\)\}/, "wardrobe must remain an internal home tab");
assert.match(app, /onOpen=\{\(\) => openWardrobeItemDetail\(item, wardrobeHomeRoute\)\}/, "wardrobe details must retain the home return target");
assert.match(app, /navigation\.openRoute\(defaultHomeRoute\)/, "conversion flows must return to the production home");
assert.doesNotMatch(app, /Wardora 新首页预览|内部只读入口|open-home-feed-preview|onOpenHomePreview/, "legacy preview entry and copy must be absent");
assert.doesNotMatch(app, /NEXT_PUBLIC_WARDORA_HOME_FEED_P1/, "the production home must not depend on the P1 preview flag");
assert.match(rollout, /NEXT_PUBLIC_WARDORA_HOME_FEED_EMERGENCY_OFF/, "the rollback switch must be explicit and named");
assert.match(app, /route\.name === "wardrobe_home" \|\| route\.name === "garment_detail"/, "legacy rollback implementation must remain runnable");
assert.match(appRoot, /<WardrobeApp[\s\S]*key=\{auth\.user\.id\}/, "account switches must remount all in-memory home state");
assert.doesNotMatch(app + navigation + rollout, /indexedDB|Outbox|optimistic/i, "P5 must not add client business persistence");
assert.match(capacitorSanitizer, /APK 开发地址字面量门禁通过/, "candidate sync must reject packaged development literals");
assert.match(capacitorSanitizer, /"local"\+"host"/, "the standard URL polyfill must retain runtime semantics without a localhost literal");

console.log("home feed P5 fixtures: passed");
