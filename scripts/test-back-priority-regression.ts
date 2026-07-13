#!/usr/bin/env tsx
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { BackHandlerStore, coordinateBackRequest } from "../src/lib/back-coordinator";
import { OverlayStackStore } from "../src/lib/overlay-stack";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return /\.[cm]?tsx?$/.test(entry.name) ? [path] : [];
  });
}

async function verifyOverlayConsumesExactlyOneTransition(): Promise<void> {
  const overlays = new OverlayStackStore();
  const pages = new BackHandlerStore();
  const transitions: string[] = [];
  let restoredFocus = 0;

  const unregisterLower = overlays.register({
    id: "lower-sheet",
    kind: "sheet",
    dismissible: true,
    onDismiss: () => transitions.push("lower-sheet"),
  });
  const unregisterUpper = overlays.register({
    id: "upper-confirm",
    kind: "alertdialog",
    dismissible: true,
    onDismiss: () => transitions.push("upper-confirm"),
    restoreFocusTo: { focus: () => { restoredFocus += 1; } },
  });
  pages.register({
    id: "root-page",
    priority: -1_000,
    handler: () => {
      transitions.push("root-page");
      return true;
    },
  });

  assert.equal(overlays.getSnapshot().topmostId, "upper-confirm", "latest overlay is topmost");
  assert.equal(
    overlays.requestDismiss("backdrop", "lower-sheet").handled,
    false,
    "a lower layer cannot consume backdrop dismissal",
  );

  const firstResult = coordinateBackRequest(overlays, pages, "android-back");
  assert.deepEqual(transitions, ["upper-confirm"], "one Back dismisses only the topmost overlay");
  assert.equal(firstResult.source, "overlay");
  assert.equal(firstResult.overlay.dismissed, true);
  assert.equal(firstResult.handlerId, null, "page fallback is not consulted after overlay dismissal");

  unregisterUpper();
  await Promise.resolve();
  assert.equal(restoredFocus, 1, "unregistering the topmost overlay restores its trigger focus once");
  assert.equal(overlays.getSnapshot().topmostId, "lower-sheet");

  coordinateBackRequest(overlays, pages, "escape");
  assert.deepEqual(
    transitions,
    ["upper-confirm", "lower-sheet"],
    "the next independent request advances only the next layer",
  );
  unregisterLower();
}

function verifyBlockedOverlayNeverFallsThrough(): void {
  const overlays = new OverlayStackStore();
  const pages = new BackHandlerStore();
  const callbacks: string[] = [];

  overlays.register({
    id: "saving-transaction",
    kind: "alertdialog",
    dismissible: false,
    onDismiss: () => callbacks.push("dismissed"),
    onDismissBlocked: () => callbacks.push("blocked-feedback"),
  });
  pages.register({
    id: "page",
    handler: () => {
      callbacks.push("page-transition");
      return true;
    },
  });

  const result = coordinateBackRequest(overlays, pages, "android-back");
  assert.deepEqual(callbacks, ["blocked-feedback"], "non-dismissible work rejects close without page fallthrough");
  assert.equal(result.source, "overlay");
  assert.equal(result.overlay.blocked, true);
  assert.equal(result.overlay.dismissed, false);
}

function verifyPageHandlersStopAfterFirstTransition(): void {
  const overlays = new OverlayStackStore();
  const pages = new BackHandlerStore();
  const transitions: string[] = [];

  pages.register({
    id: "root-fallback",
    priority: -1_000,
    handler: () => {
      transitions.push("root-fallback");
      return true;
    },
  });
  const unregisterNested = pages.register({
    id: "nested-page",
    priority: 100,
    handler: () => {
      transitions.push("nested-page");
      return true;
    },
  });

  const nestedResult = coordinateBackRequest(overlays, pages, "android-back");
  assert.deepEqual(transitions, ["nested-page"], "a consumed nested handler prevents the root transition");
  assert.equal(nestedResult.handlerId, "nested-page");

  unregisterNested();
  transitions.length = 0;
  pages.register({ id: "pass-through", priority: 100, handler: () => false });
  const fallbackResult = coordinateBackRequest(overlays, pages, "escape");
  assert.deepEqual(transitions, ["root-fallback"], "a false handler may fall through, but still yields one transition");
  assert.equal(fallbackResult.handlerId, "root-fallback");
}

function verifyRuntimeUsesCoordinatorRegistration(): void {
  const overlayRoot = read("src/components/overlay-root.tsx");
  const stableBack = read("src/lib/use-stable-back-handler.ts");
  const wardrobeApp = read("src/components/wardrobe-app.tsx");

  const nativeBackOwners = listTypeScriptFiles(join(root, "src")).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const matches = [...source.matchAll(/App\s*\.\s*addListener\s*\(\s*["']backButton["']/g)];
    return matches.map((match) => ({
      file: relative(root, path).replaceAll("\\", "/"),
      line: source.slice(0, match.index).split("\n").length,
    }));
  });

  assert.equal(
    (overlayRoot.match(/App\.addListener\("backButton"/g) ?? []).length,
    1,
    "OverlayRoot owns one native Back listener",
  );
  assert.deepEqual(
    nativeBackOwners.map(({ file }) => file),
    ["src/components/overlay-root.tsx"],
    `OverlayRoot must be the only native Back listener owner; found ${nativeBackOwners
      .map(({ file, line }) => `${file}:${line}`)
      .join(", ")}`,
  );
  assert.match(overlayRoot, /coordinateBackRequest\(overlayStack, backHandlers, "escape"\)/);
  assert.ok(!stableBack.includes("App.addListener"), "useStableBackHandler no longer creates native listeners");
  assert.match(
    wardrobeApp,
    /useStableBackHandler\(handleTopLevelBack, true, -1_000\)/,
    "WardrobeApp registers its root behavior as the lowest-priority fallback",
  );
}

async function main(): Promise<void> {
  await verifyOverlayConsumesExactlyOneTransition();
  verifyBlockedOverlayNeverFallsThrough();
  verifyPageHandlersStopAfterFirstTransition();
  verifyRuntimeUsesCoordinatorRegistration();
  console.log("back priority regression: one request causes at most one state transition");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
