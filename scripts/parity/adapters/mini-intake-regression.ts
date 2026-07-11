import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../lib/fs";

export type MiniIntakeStatus = "PASS" | "DEFECT" | "BLOCKED";

export interface MiniIntakeCheckpoint {
  screenshot: Buffer;
  uiTree: unknown;
  route: unknown;
  network: Array<{ method?: string; url: string; status?: number; failure?: string }>;
}

export interface MiniIntakeDriver {
  /** Injects a wx temporary fixture into page memory; it must not copy the file. */
  injectTemporaryImage(filePath: string): Promise<void>;
  clearInjectedState(): Promise<void>;
  callMethod(method: string): Promise<void>;
  setFailureState(message: string): Promise<void>;
  waitForStable(): Promise<void>;
  capture(): Promise<MiniIntakeCheckpoint>;
  /** All image paths referenced by page/store state after the action. */
  referencedImagePaths(): Promise<string[]>;
}

export interface MiniIntakeEvidenceSink {
  checkpoint(actionId: string, phase: string, evidence: MiniIntakeCheckpoint): Promise<void>;
  execution(result: MiniIntakeExecution): Promise<void>;
}

export interface MiniIntakeExecution {
  schemaVersion: 1;
  platform: "mini";
  screenId: "intake.crop" | "intake.select";
  actionId: string;
  fixtureId: string;
  status: MiniIntakeStatus;
  reason?: string;
  evidencePhases: string[];
  persistentCopies: string[];
}

export interface CaptureMiniIntakeRegressionOptions {
  driver: MiniIntakeDriver;
  sink: MiniIntakeEvidenceSink;
  fixtureId: string;
  /** Safe wx temp file from fixture preparation. Omit when probing native picker automation. */
  temporaryImagePath?: string;
  fixtureAllowlist: ReadonlySet<string>;
}

const phases = ["00-before", "01-immediate", "02-settled", "03-return-or-close"] as const;

const cases = [
  { actionId: "intake.crop.open", method: undefined, returnMethod: "cancelCrop", screenId: "intake.crop" as const },
  { actionId: "intake.crop.rotate-left", method: "rotateCropLeft", returnMethod: "resetCrop", screenId: "intake.crop" as const },
  { actionId: "intake.crop.rotate-right", method: "rotateCropRight", returnMethod: "resetCrop", screenId: "intake.crop" as const },
  { actionId: "intake.crop.reset", method: "resetCrop", screenId: "intake.crop" as const },
  { actionId: "intake.crop.confirm", method: "confirmCrop", screenId: "intake.crop" as const, writes: true },
  { actionId: "intake.crop.skip", method: "cancelCrop", screenId: "intake.crop" as const },
  { actionId: "intake.crop.failure", method: "__failure__", screenId: "intake.select" as const },
  { actionId: "intake.crop.retry", method: "retryFailedUpload", screenId: "intake.select" as const, writes: true },
] as const;

function isSafeTemporaryPath(filePath: string): boolean {
  if (/USER_DATA_PATH|wxfile:\/\/usr\/|\/user_data\//iu.test(filePath)) return false;
  return /^(?:wxfile:\/\/tmp[_/]|https?:\/\/tmp\/|\/tmp\/|\/private\/var\/folders\/)/u.test(filePath);
}

function persistentUserDataPaths(paths: string[]): string[] {
  return paths.filter((item) => /USER_DATA_PATH|wxfile:\/\/usr\/|\/user_data\//iu.test(item));
}

async function result(options: CaptureMiniIntakeRegressionOptions, actionId: string, screenId: MiniIntakeExecution["screenId"], status: MiniIntakeStatus, evidencePhases: string[], persistentCopies: string[], reason?: string): Promise<MiniIntakeExecution> {
  const execution: MiniIntakeExecution = {
    schemaVersion: 1,
    platform: "mini",
    screenId,
    actionId,
    fixtureId: options.fixtureId,
    status,
    ...(reason ? { reason } : {}),
    evidencePhases,
    persistentCopies,
  };
  await options.sink.execution(execution);
  return execution;
}

async function capture(options: CaptureMiniIntakeRegressionOptions, actionId: string, phase: string, captured: string[]): Promise<void> {
  await options.sink.checkpoint(actionId, phase, await options.driver.capture());
  captured.push(phase);
}

/**
 * Captures the repaired mini intake crop state graph. Native picker invocation is
 * intentionally not simulated: without a safe temporary fixture the result is
 * BLOCKED, never PASS.
 */
export async function captureMiniIntakeRegression(options: CaptureMiniIntakeRegressionOptions): Promise<MiniIntakeExecution[]> {
  if (!options.temporaryImagePath) {
    return [await result(options, "intake.select.native-picker", "intake.select", "BLOCKED", [], [], "Native picker is not automatable; provide a safe temporary fixture path")];
  }
  if (!options.fixtureAllowlist.has(options.fixtureId)) {
    return [await result(options, "intake.crop.fixture-injection", "intake.select", "BLOCKED", [], [], `Fixture ${options.fixtureId} is not allowlisted`)];
  }
  if (!isSafeTemporaryPath(options.temporaryImagePath)) {
    return [await result(options, "intake.crop.fixture-injection", "intake.select", "BLOCKED", [], [], "Fixture path is not an approved temporary path")];
  }

  const executions: MiniIntakeExecution[] = [];
  for (const testCase of cases) {
    const captured: string[] = [];
    try {
      await options.driver.clearInjectedState();
      await options.driver.waitForStable();
      await capture(options, testCase.actionId, phases[0], captured);
      await options.driver.injectTemporaryImage(options.temporaryImagePath);
      if (testCase.method === "__failure__") await options.driver.setFailureState("fixture upload failed");
      else if (testCase.method) {
        if ("writes" in testCase && testCase.writes && !options.fixtureAllowlist.has(options.fixtureId)) {
          throw new Error(`Fixture ${options.fixtureId} is not allowlisted for write action`);
        }
        await options.driver.callMethod(testCase.method);
      }
      await capture(options, testCase.actionId, phases[1], captured);
      await options.driver.waitForStable();
      await capture(options, testCase.actionId, phases[2], captured);

      if ("returnMethod" in testCase && testCase.returnMethod) {
        await options.driver.callMethod(testCase.returnMethod);
        await options.driver.waitForStable();
      }
      await capture(options, testCase.actionId, phases[3], captured);
      const persistentCopies = persistentUserDataPaths(await options.driver.referencedImagePaths());
      executions.push(await result(
        options,
        testCase.actionId,
        testCase.screenId,
        persistentCopies.length ? "DEFECT" : "PASS",
        captured,
        persistentCopies,
        persistentCopies.length ? "Intake state references a USER_DATA_PATH persistent copy" : undefined,
      ));
    } catch (error) {
      const persistentCopies = persistentUserDataPaths(await options.driver.referencedImagePaths().catch(() => []));
      executions.push(await result(options, testCase.actionId, testCase.screenId, "DEFECT", captured, persistentCopies, error instanceof Error ? error.message : String(error)));
    }
  }
  return executions;
}

function sanitizeUrl(url: string): string {
  return url.replace(/([?&](?:token|key|code|password)=)[^&]+/giu, "$1***");
}

export function createMiniIntakeFileSink(directory: string): MiniIntakeEvidenceSink {
  return {
    async checkpoint(actionId, phase, evidence) {
      const actionRoot = path.join(directory, actionId);
      await ensureDir(actionRoot);
      await fs.writeFile(path.join(actionRoot, `${phase}.png`), evidence.screenshot);
      await writeJson(path.join(actionRoot, `${phase}-ui-tree.json`), evidence.uiTree);
      await writeJson(path.join(actionRoot, `${phase}-route.json`), evidence.route);
      await writeJson(path.join(actionRoot, `${phase}-network.json`), evidence.network.map((entry) => ({ ...entry, url: sanitizeUrl(entry.url) })));
    },
    async execution(execution) {
      const actionRoot = path.join(directory, execution.actionId);
      await ensureDir(actionRoot);
      await writeJson(path.join(actionRoot, "execution.json"), execution);
    },
  };
}
