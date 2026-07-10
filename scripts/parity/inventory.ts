import path from "node:path";
import { readJson, writeJson } from "./lib/fs";
import { assertBaselineUnchanged } from "./lock";
import { scanApp } from "./scanners/app";
import { scanMini } from "./scanners/mini";
import type { BaselineLock, InventoryBundle } from "./types";
import type { UnresolvedResolution } from "./types";

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
  resolutionsFile?: string;
}): Promise<{ app: InventoryBundle; mini: InventoryBundle; resolved: number; unresolved: number }> {
  const lock = await readJson<BaselineLock>(path.join(options.runRoot, "baseline-lock.json"));
  await assertBaselineUnchanged(lock, options.cwd);
  const [app, mini] = await Promise.all([
    scanApp({ root: options.appRoot, ref: lock.appRef, sha: lock.appSha, treeHash: lock.appTreeHash }),
    scanMini({ root: options.miniRoot, ref: lock.miniRef, sha: lock.miniSha, treeHash: lock.miniTreeHash }),
  ]);
  const inventoryRoot = path.join(options.runRoot, "inventory");
  let resolutions: UnresolvedResolution[] = [];
  if (options.resolutionsFile) {
    try {
      resolutions = await readJson<UnresolvedResolution[]>(options.resolutionsFile);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }
  const candidates = [...app.unresolved, ...mini.unresolved];
  const candidateIds = new Set(candidates.map((item) => item.id));
  const invalidResolutionIds = resolutions.filter((resolution) => !candidateIds.has(resolution.id)).map((resolution) => resolution.id);
  if (invalidResolutionIds.length > 0) throw new Error(`Resolution IDs do not match current inventory: ${invalidResolutionIds.join(", ")}`);
  const resolvedIds = new Set(resolutions.map((resolution) => resolution.id));
  const unresolved = candidates.filter((item) => !resolvedIds.has(item.id));
  await Promise.all([
    writeJson(path.join(inventoryRoot, "app-screens.json"), app.screens),
    writeJson(path.join(inventoryRoot, "mini-screens.json"), mini.screens),
    writeJson(path.join(inventoryRoot, "actions.json"), [...app.actions, ...mini.actions]),
    writeJson(path.join(inventoryRoot, "overlays.json"), [...app.overlays, ...mini.overlays]),
    writeJson(path.join(inventoryRoot, "transitions.json"), [...app.transitions, ...mini.transitions]),
    writeJson(path.join(inventoryRoot, "side-effects.json"), [...app.sideEffects, ...mini.sideEffects]),
    writeJson(path.join(inventoryRoot, "unresolved-candidates.json"), candidates),
    writeJson(path.join(inventoryRoot, "resolved.json"), resolutions),
    writeJson(path.join(inventoryRoot, "unresolved.json"), unresolved),
    writeJson(path.join(inventoryRoot, "source-locations.json"), [...sources(app), ...sources(mini)]),
    writeJson(path.join(inventoryRoot, "app-inventory.json"), app),
    writeJson(path.join(inventoryRoot, "mini-inventory.json"), mini),
  ]);
  return { app, mini, resolved: resolutions.length, unresolved: unresolved.length };
}
