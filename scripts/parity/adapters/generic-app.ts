import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../lib/fs";
import type { SideEffectType } from "../types";

export type GenericAppStatus = "PASS" | "DEFECT" | "BLOCKED" | "NOT_EXECUTED";

export interface GenericAppNetworkEntry {
  method: string;
  url: string;
  status?: number;
  failure?: string;
}

export interface GenericAppCheckpoint {
  screenshot: Buffer;
  uiTree: unknown;
  route: unknown;
  network: GenericAppNetworkEntry[];
}

export interface GenericAppDriver {
  openRoute(route: string): Promise<void>;
  clickParityId(parityId: string): Promise<void>;
  typeParityId(parityId: string, value: string): Promise<void>;
  back(): Promise<void>;
  waitForStable(): Promise<void>;
  capture(): Promise<GenericAppCheckpoint>;
}

export type GenericAppOperation =
  | { kind: "open"; route: string }
  | { kind: "click"; parityId: string }
  | { kind: "type"; parityId: string; value: string }
  | { kind: "back" }
  | { kind: "checkpoint" };

export interface GenericAppAction {
  screenId: string;
  stateId: string;
  actionId: string;
  fixtureId: string;
  sideEffect: SideEffectType;
  operation: GenericAppOperation | { kind: string };
  /** Optional cleanup/return operation captured as phase 03. */
  returnOperation?: GenericAppOperation;
}

export interface GenericAppEvidenceSink {
  checkpoint(phase: string, evidence: GenericAppCheckpoint): Promise<void>;
  execution(result: GenericAppExecution): Promise<void>;
}

export interface GenericAppExecution {
  schemaVersion: 1;
  platform: "app";
  screenId: string;
  stateId: string;
  actionId: string;
  fixtureId: string;
  status: GenericAppStatus;
  reason?: string;
  evidencePhases: string[];
}

export interface RunGenericAppActionOptions {
  driver: GenericAppDriver;
  action: GenericAppAction;
  sink: GenericAppEvidenceSink;
  /** Exact fixture IDs authorized to perform dangerous writes in this run. */
  dangerousFixtureAllowlist: ReadonlySet<string>;
}

const PHASES = ["00-before", "01-immediate", "02-settled", "03-return-or-close"] as const;
const DANGEROUS_SIDE_EFFECTS = new Set<SideEffectType>([
  "BACKEND_WRITE",
  "OBJECT_UPLOAD",
  "THIRD_PARTY",
]);

function isSupportedOperation(operation: GenericAppAction["operation"]): operation is GenericAppOperation {
  return ["open", "click", "type", "back", "checkpoint"].includes(operation.kind);
}

async function perform(driver: GenericAppDriver, operation: GenericAppOperation): Promise<void> {
  switch (operation.kind) {
    case "open": return driver.openRoute(operation.route);
    case "click": return driver.clickParityId(operation.parityId);
    case "type": return driver.typeParityId(operation.parityId, operation.value);
    case "back": return driver.back();
    case "checkpoint": return;
  }
}

async function finish(sink: GenericAppEvidenceSink, action: GenericAppAction, status: GenericAppStatus, phases: string[], reason?: string): Promise<GenericAppExecution> {
  const result: GenericAppExecution = {
    schemaVersion: 1,
    platform: "app",
    screenId: action.screenId,
    stateId: action.stateId,
    actionId: action.actionId,
    fixtureId: action.fixtureId,
    status,
    ...(reason ? { reason } : {}),
    evidencePhases: phases,
  };
  await sink.execution(result);
  return result;
}

/**
 * Executes one manifest action. The runner deliberately makes no inference from
 * an unknown action: unsupported operations are recorded as NOT_EXECUTED.
 */
export async function runGenericAppAction(options: RunGenericAppActionOptions): Promise<GenericAppExecution> {
  const { action, driver, sink } = options;
  if (!isSupportedOperation(action.operation)) {
    return finish(sink, action, "NOT_EXECUTED", [], `Unsupported APP operation: ${action.operation.kind}`);
  }
  if (DANGEROUS_SIDE_EFFECTS.has(action.sideEffect) && !options.dangerousFixtureAllowlist.has(action.fixtureId)) {
    return finish(sink, action, "BLOCKED", [], `Fixture ${action.fixtureId} is not allowlisted for ${action.sideEffect}`);
  }

  const captured: string[] = [];
  try {
    await driver.waitForStable();
    await sink.checkpoint(PHASES[0], await driver.capture());
    captured.push(PHASES[0]);

    await perform(driver, action.operation);
    await sink.checkpoint(PHASES[1], await driver.capture());
    captured.push(PHASES[1]);

    await driver.waitForStable();
    await sink.checkpoint(PHASES[2], await driver.capture());
    captured.push(PHASES[2]);

    if (action.returnOperation) {
      await perform(driver, action.returnOperation);
      await driver.waitForStable();
    }
    await sink.checkpoint(PHASES[3], await driver.capture());
    captured.push(PHASES[3]);
    return finish(sink, action, "PASS", captured);
  } catch (error) {
    return finish(sink, action, "DEFECT", captured, error instanceof Error ? error.message : String(error));
  }
}

function sanitizeUrl(url: string): string {
  return url.replace(/([?&](?:token|key|code|password)=)[^&]+/giu, "$1***");
}

/** Filesystem sink used by the real ADB/WebView driver supplied by the BFS runner. */
export function createGenericAppFileSink(directory: string): GenericAppEvidenceSink {
  return {
    async checkpoint(phase, evidence) {
      await ensureDir(directory);
      await fs.writeFile(path.join(directory, `${phase}.png`), evidence.screenshot);
      await writeJson(path.join(directory, `${phase}-ui-tree.json`), evidence.uiTree);
      await writeJson(path.join(directory, `${phase}-route.json`), evidence.route);
      await writeJson(path.join(directory, `${phase}-network.json`), evidence.network.map((entry) => ({
        ...entry,
        url: sanitizeUrl(entry.url),
      })));
    },
    async execution(result) {
      await ensureDir(directory);
      await writeJson(path.join(directory, "execution.json"), result);
    },
  };
}
