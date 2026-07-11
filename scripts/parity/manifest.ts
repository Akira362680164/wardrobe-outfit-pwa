import { promises as fs } from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./lib/fs";
import type { AppSourceDisposition, DomainManifest, InventoryBundle, ScreenManifest, ScreenMapManifest } from "./types";
import type { ValidationResult } from "./validate";

const DOMAIN_FILES = [
  "shared-shell.yaml",
  "wardrobe.yaml",
  "intake.yaml",
  "outfits.yaml",
  "wishlist.yaml",
  "recommendations.yaml",
  "settings.yaml",
  "statistics.yaml",
];

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

export async function validateManifests(options: {
  cwd: string;
  runRoot: string;
}): Promise<ValidationResult> {
  const manifestRoot = path.join(options.cwd, "scripts", "parity", "manifests");
  const [app, mini] = await Promise.all([
    readJson<InventoryBundle>(path.join(options.runRoot, "inventory", "app-inventory.json")),
    readJson<InventoryBundle>(path.join(options.runRoot, "inventory", "mini-inventory.json")),
  ]);
  const manifests: DomainManifest[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let screenMap: ScreenMapManifest = { schemaVersion: 1, screens: [] };
  let appSourceDispositions: AppSourceDisposition[] = [];
  try {
    screenMap = JSON.parse(await fs.readFile(path.join(manifestRoot, "screen-map.yaml"), "utf8")) as ScreenMapManifest;
  } catch (error) {
    errors.push(`screen-map.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    appSourceDispositions = JSON.parse(await fs.readFile(path.join(manifestRoot, "app-source-dispositions.json"), "utf8")) as AppSourceDisposition[];
  } catch (error) {
    errors.push(`app-source-dispositions.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const filename of DOMAIN_FILES) {
    const file = path.join(manifestRoot, filename);
    try {
      manifests.push(JSON.parse(await fs.readFile(file, "utf8")) as DomainManifest);
    } catch (error) {
      errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const screens = manifests.flatMap((manifest) => manifest.screens);
  for (const duplicate of duplicates(screens.map((screen) => screen.id))) errors.push(`duplicate semantic screen id: ${duplicate}`);
  const appInventoryIds = new Set(app.screens.map((screen) => screen.id));
  const miniInventoryIds = new Set(mini.screens.map((screen) => screen.id));
  const mappedApp = new Set<string>();
  const mappedMini = new Set<string>();
  for (const duplicate of duplicates(screenMap.screens.map((screen) => screen.id))) errors.push(`duplicate screen-map id: ${duplicate}`);
  for (const entry of screenMap.screens) {
    if (entry.mappingStatus === "UNMAPPED") errors.push(`${entry.id}: screen-map status is UNMAPPED`);
    for (const id of entry.appInventoryIds) {
      if (!appInventoryIds.has(id)) errors.push(`${entry.id}: unknown APP inventory id ${id}`);
      mappedApp.add(id);
    }
    for (const id of entry.miniInventoryIds) {
      if (!miniInventoryIds.has(id)) errors.push(`${entry.id}: unknown mini inventory id ${id}`);
      mappedMini.add(id);
    }
  }
  const semanticIds = new Set(screenMap.screens.map((entry) => entry.id));
  for (const duplicate of duplicates(appSourceDispositions.map((entry) => entry.id))) errors.push(`duplicate APP source disposition id: ${duplicate}`);
  for (const disposition of appSourceDispositions) {
    if (!appInventoryIds.has(disposition.id)) errors.push(`unknown APP source disposition id ${disposition.id}`);
    for (const target of disposition.targets) {
      if (!semanticIds.has(target)) errors.push(`${disposition.id}: unknown semantic target ${target}`);
    }
    mappedApp.add(disposition.id);
  }
  for (const screen of screens) {
    if (!screenMap.screens.some((entry) => entry.id === screen.id)) errors.push(`${screen.id}: detailed manifest has no screen-map entry`);
    if (screen.mappingStatus === "UNMAPPED") errors.push(`${screen.id}: mappingStatus is UNMAPPED`);
    if (screen.sourceOfTruth !== "app") errors.push(`${screen.id}: sourceOfTruth must be app`);
    if (screen.fixtures.length === 0 && screen.mappingStatus !== "LOGIN_EXCLUDED") errors.push(`${screen.id}: fixtures are empty`);
    for (const id of screen.app.sourceInventoryIds) {
      if (!appInventoryIds.has(id)) errors.push(`${screen.id}: unknown APP inventory id ${id}`);
      mappedApp.add(id);
    }
    for (const id of screen.mini.sourceInventoryIds) {
      if (!miniInventoryIds.has(id)) errors.push(`${screen.id}: unknown mini inventory id ${id}`);
    }
    const stateIds = new Set(screen.states.map((state) => state.id));
    for (const checkpoint of screen.checkpoints) {
      if (!stateIds.has(checkpoint)) errors.push(`${screen.id}: checkpoint missing matching state ${checkpoint}`);
    }
    for (const action of screen.requiredActions) {
      if (action.sideEffect !== "NONE" && action.sideEffect !== "LOCAL_STATE" && !action.serverAssertion) {
        errors.push(`${screen.id}/${action.id}: remote side effect missing serverAssertion`);
      }
    }
  }
  const unmappedApp = app.screens.filter((screen) => !mappedApp.has(screen.id)).map((screen) => screen.id);
  const unmappedMini = mini.screens.filter((screen) => !mappedMini.has(screen.id)).map((screen) => screen.id);
  if (unmappedApp.length > 0) warnings.push(`${unmappedApp.length} APP screen inventory candidates are not mapped`);
  if (unmappedMini.length > 0) errors.push(`${unmappedMini.length} registered mini screens are not mapped`);
  const metrics = {
    mappedSemanticScreens: screenMap.screens.length,
    detailedSemanticScreens: screens.length,
    appInventoryScreens: app.screens.length,
    mappedAppInventoryScreens: mappedApp.size,
    classifiedAppSourceCandidates: appSourceDispositions.length,
    unmappedAppInventoryScreens: unmappedApp.length,
    miniInventoryScreens: mini.screens.length,
    mappedMiniInventoryScreens: mappedMini.size,
    unmappedMiniInventoryScreens: unmappedMini.length,
    states: screens.reduce((total, screen) => total + screen.states.length, 0),
    actions: screens.reduce((total, screen) => total + screen.requiredActions.length, 0),
    checkpoints: screens.reduce((total, screen) => total + screen.checkpoints.length, 0),
  };
  const result = { valid: errors.length === 0, errors, warnings, metrics };
  await writeJson(path.join(options.runRoot, "manifests", "validation.json"), result);
  await writeJson(path.join(options.runRoot, "manifests", "unmapped-app-screens.json"), unmappedApp);
  await writeJson(path.join(options.runRoot, "manifests", "unmapped-mini-screens.json"), unmappedMini);
  return result;
}

export function emptyDomainManifest(domain: string, screens: ScreenManifest[] = []): DomainManifest {
  return { schemaVersion: 1, domain, screens };
}
