import { promises as fs } from "node:fs";
import path from "node:path";
import { pathExists, readJson, writeJson } from "./lib/fs";
import type { ActionInventoryItem, InventoryBundle } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: Record<string, number>;
}

function validateUniqueIds<T extends { id: string }>(label: string, items: T[], errors: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id) errors.push(`${label}: item has empty id`);
    if (seen.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

async function validateSources(bundle: InventoryBundle, errors: string[]): Promise<void> {
  const groups = [bundle.screens, bundle.actions, bundle.overlays, bundle.transitions, bundle.sideEffects, bundle.unresolved];
  for (const item of groups.flat()) {
    if (item.source.line < 1 || item.source.column < 1) errors.push(`${item.id}: invalid source position`);
    if (!await pathExists(path.join(bundle.root, item.source.file))) errors.push(`${item.id}: missing source ${item.source.file}`);
  }
}

export async function validateInventory(runRoot: string): Promise<ValidationResult> {
  const inventoryRoot = path.join(runRoot, "inventory");
  const [app, mini] = await Promise.all([
    readJson<InventoryBundle>(path.join(inventoryRoot, "app-inventory.json")),
    readJson<InventoryBundle>(path.join(inventoryRoot, "mini-inventory.json")),
  ]);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (app.schemaVersion !== 1 || app.platform !== "app") errors.push("invalid APP inventory header");
  if (mini.schemaVersion !== 1 || mini.platform !== "mini") errors.push("invalid mini inventory header");
  for (const bundle of [app, mini]) {
    validateUniqueIds(`${bundle.platform}.screens`, bundle.screens, errors);
    validateUniqueIds(`${bundle.platform}.actions`, bundle.actions, errors);
    validateUniqueIds(`${bundle.platform}.overlays`, bundle.overlays, errors);
    validateUniqueIds(`${bundle.platform}.transitions`, bundle.transitions, errors);
    validateUniqueIds(`${bundle.platform}.sideEffects`, bundle.sideEffects, errors);
    validateUniqueIds(`${bundle.platform}.unresolved`, bundle.unresolved, errors);
    await validateSources(bundle, errors);
  }
  if (app.screens.length === 0 || mini.screens.length === 0) errors.push("screen inventory is empty");
  if (app.actions.length === 0 || mini.actions.length === 0) errors.push("action inventory is empty");
  if (mini.screens.length !== 35) warnings.push(`expected current mini baseline to register 35 pages, found ${mini.screens.length}`);
  if (app.unresolved.length + mini.unresolved.length > 0) {
    warnings.push(`${app.unresolved.length + mini.unresolved.length} unresolved static candidates require manual mapping`);
  }
  const metrics = {
    appScreens: app.screens.length,
    miniScreens: mini.screens.length,
    appActions: app.actions.length,
    miniActions: mini.actions.length,
    appOverlays: app.overlays.length,
    miniOverlays: mini.overlays.length,
    appTransitions: app.transitions.length,
    miniTransitions: mini.transitions.length,
    appSideEffects: app.sideEffects.length,
    miniSideEffects: mini.sideEffects.length,
    unresolved: app.unresolved.length + mini.unresolved.length,
  };
  const result = { valid: errors.length === 0, errors, warnings, metrics };
  await writeJson(path.join(inventoryRoot, "validation.json"), result);
  return result;
}

function instrumentationMetrics(actions: ActionInventoryItem[]): Record<string, number> {
  return {
    actions: actions.length,
    withParityId: actions.filter((action) => Boolean(action.parityId)).length,
    missingParityId: actions.filter((action) => !action.parityId).length,
  };
}

export async function checkInstrumentation(runRoot: string): Promise<ValidationResult> {
  const inventoryRoot = path.join(runRoot, "inventory");
  const [app, mini] = await Promise.all([
    readJson<InventoryBundle>(path.join(inventoryRoot, "app-inventory.json")),
    readJson<InventoryBundle>(path.join(inventoryRoot, "mini-inventory.json")),
  ]);
  const appMetrics = instrumentationMetrics(app.actions);
  const miniMetrics = instrumentationMetrics(mini.actions);
  const missing = [...app.actions, ...mini.actions].filter((action) => !action.parityId);
  const errors = missing.map((action) => `${action.platform}:${action.source.file}:${action.source.line} ${action.event} missing parity-id`);
  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings: [],
    metrics: {
      appActions: appMetrics.actions,
      appWithParityId: appMetrics.withParityId,
      appMissingParityId: appMetrics.missingParityId,
      miniActions: miniMetrics.actions,
      miniWithParityId: miniMetrics.withParityId,
      miniMissingParityId: miniMetrics.missingParityId,
    },
  };
  await writeJson(path.join(inventoryRoot, "instrumentation-check.json"), result);
  await fs.writeFile(
    path.join(inventoryRoot, "missing-parity-ids.txt"),
    `${errors.join("\n")}${errors.length ? "\n" : ""}`,
    "utf8",
  );
  return result;
}
