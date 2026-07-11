import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../lib/fs";
import type { GenericMiniCheckpoint } from "./generic-mini";

export type MiniPackingActionId = "plans.packing.toggle" | "plans.packing.manual-add" | "plans.packing.mark-all" | "plans.packing.reset";

export interface PackingItemReadback {
  id: string;
  label: string;
  checked: boolean;
  quantity?: number;
}

export interface PackingTripReadback {
  id: string;
  revision: number;
  checklist: PackingItemReadback[];
}

/** Boundary implemented by the real wechatide automation driver. */
export interface MiniPackingDriver {
  connect(): Promise<void>;
  openTrip(tripId: string): Promise<void>;
  tapParityId(parityId: string): Promise<void>;
  inputParityId(parityId: string, value: string): Promise<void>;
  callMethod(method: string, args?: unknown): Promise<void>;
  waitForStable(): Promise<void>;
  capture(): Promise<GenericMiniCheckpoint>;
  /** Must force page reload and therefore a new server GET, not reuse page state. */
  forceReloadTrip(tripId: string): Promise<void>;
}

export interface MiniPackingApi {
  getTrip(tripId: string): Promise<PackingTripReadback>;
}

export interface MiniPackingExecution {
  schemaVersion: 1;
  platform: "mini";
  screenId: "plans.packing";
  actionId: MiniPackingActionId;
  fixtureId: string;
  tripId: string;
  status: "PASS" | "DEFECT";
  evidencePhases: string[];
  serverAssertion: { passed: boolean; revisionBefore: number; revisionAfter?: number };
  reason?: string;
}

export interface MiniPackingEvidenceSink {
  checkpoint(actionId: MiniPackingActionId, phase: string, evidence: GenericMiniCheckpoint): Promise<void>;
  serverReadback(actionId: MiniPackingActionId, evidence: unknown): Promise<void>;
  execution(actionId: MiniPackingActionId, result: MiniPackingExecution): Promise<void>;
}

export interface CaptureMiniPackingOptions {
  driver: MiniPackingDriver;
  api: MiniPackingApi;
  sink: MiniPackingEvidenceSink;
  fixtureId: string;
  tripId: string;
  packingItemId: string;
  manualItemLabel?: string;
}

const PHASES = ["00-before", "01-immediate", "02-settled", "03-return-or-close"] as const;

async function perform(driver: MiniPackingDriver, actionId: MiniPackingActionId, options: CaptureMiniPackingOptions): Promise<void> {
  if (actionId === "plans.packing.toggle") {
    await driver.tapParityId(`parity.mini.pages.trips.detail.packing.toggle.${options.packingItemId}`);
    return;
  }
  if (actionId === "plans.packing.manual-add") {
    await driver.tapParityId("parity.mini.pages.trips.detail.packing.add");
    await driver.inputParityId("parity.mini.pages.trips.detail.packing.label", options.manualItemLabel ?? "parity-充电器");
    await driver.inputParityId("parity.mini.pages.trips.detail.packing.category", "自动化测试");
    await driver.inputParityId("parity.mini.pages.trips.detail.packing.quantity", "1");
    await driver.tapParityId("parity.mini.pages.trips.detail.packing.save");
    return;
  }
  if (actionId === "plans.packing.mark-all") {
    await driver.tapParityId("parity.mini.pages.trips.detail.packing.all");
    return;
  }
  await driver.tapParityId("parity.mini.pages.trips.detail.packing.reset");
}

function stateMatches(actionId: MiniPackingActionId, before: PackingTripReadback, after: PackingTripReadback, options: CaptureMiniPackingOptions): boolean {
  if (after.revision <= before.revision) return false;
  if (actionId === "plans.packing.toggle") {
    const oldItem = before.checklist.find((item) => item.id === options.packingItemId);
    const newItem = after.checklist.find((item) => item.id === options.packingItemId);
    return Boolean(oldItem && newItem && oldItem.checked !== newItem.checked);
  }
  if (actionId === "plans.packing.manual-add") {
    const label = options.manualItemLabel ?? "parity-充电器";
    return after.checklist.some((item) => item.label === label && item.quantity === 1);
  }
  if (actionId === "plans.packing.mark-all") return after.checklist.length > 0 && after.checklist.every((item) => item.checked);
  return after.checklist.every((item) => !item.checked);
}

async function runAction(actionId: MiniPackingActionId, options: CaptureMiniPackingOptions): Promise<MiniPackingExecution> {
  const phases: string[] = [];
  const before = await options.api.getTrip(options.tripId);
  try {
    await options.sink.checkpoint(actionId, PHASES[0], await options.driver.capture());
    phases.push(PHASES[0]);
    await perform(options.driver, actionId, options);
    await options.sink.checkpoint(actionId, PHASES[1], await options.driver.capture());
    phases.push(PHASES[1]);
    await options.driver.waitForStable();
    await options.sink.checkpoint(actionId, PHASES[2], await options.driver.capture());
    phases.push(PHASES[2]);

    await options.driver.forceReloadTrip(options.tripId);
    await options.driver.waitForStable();
    const after = await options.api.getTrip(options.tripId);
    await options.sink.serverReadback(actionId, { assertion: "packing-readback", before, after });
    const passed = stateMatches(actionId, before, after, options);
    await options.sink.checkpoint(actionId, PHASES[3], await options.driver.capture());
    phases.push(PHASES[3]);
    const result: MiniPackingExecution = {
      schemaVersion: 1, platform: "mini", screenId: "plans.packing", actionId,
      fixtureId: options.fixtureId, tripId: options.tripId, status: passed ? "PASS" : "DEFECT",
      evidencePhases: phases,
      serverAssertion: { passed, revisionBefore: before.revision, revisionAfter: after.revision },
      ...(!passed ? { reason: "Forced reload/server GET did not confirm revision and packing state" } : {}),
    };
    await options.sink.execution(actionId, result);
    return result;
  } catch (error) {
    const result: MiniPackingExecution = {
      schemaVersion: 1, platform: "mini", screenId: "plans.packing", actionId,
      fixtureId: options.fixtureId, tripId: options.tripId, status: "DEFECT", evidencePhases: phases,
      serverAssertion: { passed: false, revisionBefore: before.revision },
      reason: error instanceof Error ? error.message : String(error),
    };
    await options.sink.execution(actionId, result);
    return result;
  }
}

export async function captureMiniPackingEvidence(options: CaptureMiniPackingOptions): Promise<MiniPackingExecution[]> {
  await options.driver.connect();
  await options.driver.openTrip(options.tripId);
  await options.driver.waitForStable();
  const actions: MiniPackingActionId[] = [
    "plans.packing.toggle", "plans.packing.manual-add", "plans.packing.mark-all", "plans.packing.reset",
  ];
  const results: MiniPackingExecution[] = [];
  for (const actionId of actions) results.push(await runAction(actionId, options));
  return results;
}

function sanitizeUrl(url: string): string {
  return url.replace(/([?&](?:token|key|code|password)=)[^&]+/giu, "$1***");
}

export function createMiniPackingFileSink(root: string): MiniPackingEvidenceSink {
  function directory(actionId: MiniPackingActionId): string { return path.join(root, actionId); }
  return {
    async checkpoint(actionId, phase, evidence) {
      const target = directory(actionId);
      await ensureDir(target);
      await fs.writeFile(path.join(target, `${phase}.png`), evidence.screenshot);
      await writeJson(path.join(target, `${phase}-ui-tree.json`), evidence.uiTree);
      await writeJson(path.join(target, `${phase}-route.json`), evidence.route);
      await writeJson(path.join(target, `${phase}-network.json`), evidence.network.map((entry) => ({ ...entry, url: sanitizeUrl(entry.url) })));
    },
    async serverReadback(actionId, evidence) { await writeJson(path.join(directory(actionId), "server-readback.json"), evidence); },
    async execution(actionId, result) { await writeJson(path.join(directory(actionId), "execution.json"), result); },
  };
}
