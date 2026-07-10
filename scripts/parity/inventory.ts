import path from "node:path";
import { readJson, writeJson } from "./lib/fs";
import { assertBaselineUnchanged } from "./lock";
import { scanApp } from "./scanners/app";
import { scanMini } from "./scanners/mini";
import type { BaselineLock, InventoryBundle } from "./types";

function sources(bundle: InventoryBundle): Array<{ id: string; platform: string; source: unknown }> {
  return [bundle.screens, bundle.actions, bundle.overlays, bundle.transitions, bundle.sideEffects, bundle.unresolved]
    .flat()
    .map((item) => ({ id: item.id, platform: item.platform, source: item.source }));
}

export async function generateInventory(options: {
  cwd: string;
  appRoot: string;
  miniRoot: string;
  runRoot: string;
}): Promise<{ app: InventoryBundle; mini: InventoryBundle }> {
  const lock = await readJson<BaselineLock>(path.join(options.runRoot, "baseline-lock.json"));
  await assertBaselineUnchanged(lock, options.cwd);
  const [app, mini] = await Promise.all([
    scanApp({ root: options.appRoot, ref: lock.appRef, sha: lock.appSha, treeHash: lock.appTreeHash }),
    scanMini({ root: options.miniRoot, ref: lock.miniRef, sha: lock.miniSha, treeHash: lock.miniTreeHash }),
  ]);
  const inventoryRoot = path.join(options.runRoot, "inventory");
  await Promise.all([
    writeJson(path.join(inventoryRoot, "app-screens.json"), app.screens),
    writeJson(path.join(inventoryRoot, "mini-screens.json"), mini.screens),
    writeJson(path.join(inventoryRoot, "actions.json"), [...app.actions, ...mini.actions]),
    writeJson(path.join(inventoryRoot, "overlays.json"), [...app.overlays, ...mini.overlays]),
    writeJson(path.join(inventoryRoot, "transitions.json"), [...app.transitions, ...mini.transitions]),
    writeJson(path.join(inventoryRoot, "side-effects.json"), [...app.sideEffects, ...mini.sideEffects]),
    writeJson(path.join(inventoryRoot, "unresolved.json"), [...app.unresolved, ...mini.unresolved]),
    writeJson(path.join(inventoryRoot, "source-locations.json"), [...sources(app), ...sources(mini)]),
    writeJson(path.join(inventoryRoot, "app-inventory.json"), app),
    writeJson(path.join(inventoryRoot, "mini-inventory.json"), mini),
  ]);
  return { app, mini };
}
