import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../lib/fs";
import type { SideEffectType } from "../types";

export type GenericMiniStatus = "PASS" | "DEFECT" | "BLOCKED" | "NOT_EXECUTED";

export interface GenericMiniNetworkEntry {
  method?: string;
  url: string;
  status?: number;
  failure?: string;
}

export interface GenericMiniCheckpoint {
  screenshot: Buffer;
  uiTree: unknown;
  route: unknown;
  network: GenericMiniNetworkEntry[];
}

/** Runtime boundary implemented by the wechatide-backed BFS orchestrator. */
export interface GenericMiniDriver {
  connect(): Promise<void>;
  openRoute(route: string): Promise<void>;
  tapParityId(parityId: string): Promise<void>;
  inputParityId(parityId: string, value: string): Promise<void>;
  callMethod(method: string, args?: unknown): Promise<void>;
  back(): Promise<void>;
  waitForStable(): Promise<void>;
  capture(): Promise<GenericMiniCheckpoint>;
}

export type GenericMiniOperation =
  | { kind: "open"; route: string }
  | { kind: "tap"; parityId: string; callMethodFallback?: string; fallbackArgs?: unknown }
  | { kind: "input"; parityId: string; value: string; callMethodFallback?: string; fallbackArgs?: unknown }
  | { kind: "callMethod"; method: string; args?: unknown }
  | { kind: "back" }
  | { kind: "checkpoint" };

export interface GenericMiniAction {
  screenId: string;
  stateId: string;
  actionId: string;
  fixtureId: string;
  sideEffect: SideEffectType;
  operation: GenericMiniOperation | { kind: string };
  returnOperation?: GenericMiniOperation;
  serverAssertion?: string;
}

export interface GenericMiniServerAssertionResult {
  passed: boolean;
  evidence?: unknown;
  reason?: string;
}

export type GenericMiniServerAssertionHook = (
  assertionId: string,
  action: GenericMiniAction,
) => Promise<GenericMiniServerAssertionResult>;

export interface GenericMiniEvidenceSink {
  checkpoint(phase: string, evidence: GenericMiniCheckpoint): Promise<void>;
  serverAssertion?(assertionId: string, evidence: unknown): Promise<void>;
  execution(result: GenericMiniExecution): Promise<void>;
}

export interface GenericMiniExecution {
  schemaVersion: 1;
  platform: "mini";
  screenId: string;
  stateId: string;
  actionId: string;
  fixtureId: string;
  status: GenericMiniStatus;
  reason?: string;
  evidencePhases: string[];
  serverAssertion?: { id: string; passed: boolean };
}

export interface RunGenericMiniActionOptions {
  driver: GenericMiniDriver;
  action: GenericMiniAction;
  sink: GenericMiniEvidenceSink;
  dangerousFixtureAllowlist: ReadonlySet<string>;
  serverAssertionHook?: GenericMiniServerAssertionHook;
}

export class GenericMiniConnectionError extends Error {}
export class GenericMiniSemanticMappingError extends Error {}

const PHASES = ["00-before", "01-immediate", "02-settled", "03-return-or-close"] as const;
const DANGEROUS_SIDE_EFFECTS = new Set<SideEffectType>(["BACKEND_WRITE", "OBJECT_UPLOAD", "THIRD_PARTY"]);

function isSupportedOperation(operation: GenericMiniAction["operation"]): operation is GenericMiniOperation {
  return ["open", "tap", "input", "callMethod", "back", "checkpoint"].includes(operation.kind);
}

async function withFallback(
  primary: () => Promise<void>,
  driver: GenericMiniDriver,
  fallback?: string,
  fallbackArgs?: unknown,
): Promise<void> {
  try {
    await primary();
  } catch (error) {
    if (!fallback) throw error;
    await driver.callMethod(fallback, fallbackArgs);
  }
}

async function perform(driver: GenericMiniDriver, operation: GenericMiniOperation): Promise<void> {
  switch (operation.kind) {
    case "open": return driver.openRoute(operation.route);
    case "tap": return withFallback(
      () => driver.tapParityId(operation.parityId),
      driver,
      operation.callMethodFallback,
      operation.fallbackArgs,
    );
    case "input": return withFallback(
      () => driver.inputParityId(operation.parityId, operation.value),
      driver,
      operation.callMethodFallback,
      operation.fallbackArgs,
    );
    case "callMethod": return driver.callMethod(operation.method, operation.args);
    case "back": return driver.back();
    case "checkpoint": return;
  }
}

async function finish(
  sink: GenericMiniEvidenceSink,
  action: GenericMiniAction,
  status: GenericMiniStatus,
  phases: string[],
  reason?: string,
  assertion?: { id: string; passed: boolean },
): Promise<GenericMiniExecution> {
  const result: GenericMiniExecution = {
    schemaVersion: 1,
    platform: "mini",
    screenId: action.screenId,
    stateId: action.stateId,
    actionId: action.actionId,
    fixtureId: action.fixtureId,
    status,
    ...(reason ? { reason } : {}),
    evidencePhases: phases,
    ...(assertion ? { serverAssertion: assertion } : {}),
  };
  await sink.execution(result);
  return result;
}

function classifyFailure(error: unknown): { status: GenericMiniStatus; reason: string } {
  const reason = error instanceof Error ? error.message : String(error);
  if (error instanceof GenericMiniConnectionError) return { status: "BLOCKED", reason };
  if (error instanceof GenericMiniSemanticMappingError) return { status: "NOT_EXECUTED", reason };
  return { status: "DEFECT", reason };
}

/** Executes one manifest action without inferring PASS from missing runtime evidence. */
export async function runGenericMiniAction(options: RunGenericMiniActionOptions): Promise<GenericMiniExecution> {
  const { action, driver, sink } = options;
  if (!isSupportedOperation(action.operation)) {
    return finish(sink, action, "NOT_EXECUTED", [], `Unsupported mini operation: ${action.operation.kind}`);
  }
  if (DANGEROUS_SIDE_EFFECTS.has(action.sideEffect) && !options.dangerousFixtureAllowlist.has(action.fixtureId)) {
    return finish(sink, action, "BLOCKED", [], `Fixture ${action.fixtureId} is not allowlisted for ${action.sideEffect}`);
  }
  if (action.serverAssertion && !options.serverAssertionHook) {
    return finish(sink, action, "NOT_EXECUTED", [], `Server assertion hook missing: ${action.serverAssertion}`);
  }

  const captured: string[] = [];
  try {
    await driver.connect();
    await driver.waitForStable();
    await sink.checkpoint(PHASES[0], await driver.capture());
    captured.push(PHASES[0]);

    await perform(driver, action.operation);
    await sink.checkpoint(PHASES[1], await driver.capture());
    captured.push(PHASES[1]);

    await driver.waitForStable();
    await sink.checkpoint(PHASES[2], await driver.capture());
    captured.push(PHASES[2]);

    let assertionSummary: { id: string; passed: boolean } | undefined;
    if (action.serverAssertion) {
      const asserted = await options.serverAssertionHook!(action.serverAssertion, action);
      assertionSummary = { id: action.serverAssertion, passed: asserted.passed };
      if (asserted.evidence !== undefined) await sink.serverAssertion?.(action.serverAssertion, asserted.evidence);
      if (!asserted.passed) {
        return finish(sink, action, "DEFECT", captured, asserted.reason ?? `Server assertion failed: ${action.serverAssertion}`, assertionSummary);
      }
    }

    if (action.returnOperation) {
      await perform(driver, action.returnOperation);
      await driver.waitForStable();
    }
    await sink.checkpoint(PHASES[3], await driver.capture());
    captured.push(PHASES[3]);
    return finish(sink, action, "PASS", captured, undefined, assertionSummary);
  } catch (error) {
    const failure = classifyFailure(error);
    return finish(sink, action, failure.status, captured, failure.reason);
  }
}

function sanitizeUrl(url: string): string {
  return url.replace(/([?&](?:token|key|code|password)=)[^&]+/giu, "$1***");
}

export function createGenericMiniFileSink(directory: string): GenericMiniEvidenceSink {
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
    async serverAssertion(assertionId, evidence) {
      await writeJson(path.join(directory, `server-${assertionId}.json`), evidence);
    },
    async execution(result) {
      await writeJson(path.join(directory, "execution.json"), result);
    },
  };
}
