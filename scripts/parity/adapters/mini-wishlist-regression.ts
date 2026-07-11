import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../lib/fs";
import type { GenericMiniCheckpoint, GenericMiniNetworkEntry } from "./generic-mini";

export type MiniWishlistRegressionStatus = "PASS" | "DEFECT" | "BLOCKED" | "NOT_EXECUTED";
export type MiniWishlistRegressionActionId =
  | "wishlist.convert.confirm"
  | "wishlist.undo.confirm"
  | "wishlist.edit.media.recrop-upload";

export interface MiniWishlistFixture {
  fixtureId: string;
  wishlistId: string;
  locationId: string;
}

export interface MiniWishlistRegressionDriver {
  connect(): Promise<void>;
  openWishlistDetail(wishlistId: string): Promise<void>;
  openWishlistEdit(wishlistId: string): Promise<void>;
  selectLocation(locationId: string): Promise<void>;
  confirmConversion(): Promise<void>;
  undoPurchase(): Promise<void>;
  recropAndUploadMedia(): Promise<void>;
  returnFromAction(): Promise<void>;
  waitForStable(): Promise<void>;
  capture(): Promise<GenericMiniCheckpoint>;
}

export interface MiniWishlistReadbackResult {
  passed: boolean;
  evidence: unknown;
  reason?: string;
}

export type MiniWishlistReadbackHook = (
  kind: "conversion" | "undo" | "media",
  fixture: MiniWishlistFixture,
) => Promise<MiniWishlistReadbackResult>;

export interface MiniWishlistRegressionExecution {
  schemaVersion: 1;
  platform: "mini";
  actionId: MiniWishlistRegressionActionId;
  fixtureId: string;
  status: MiniWishlistRegressionStatus;
  reason?: string;
  evidencePhases: string[];
  serverReadback?: { kind: "conversion" | "undo" | "media"; passed: boolean };
}

export interface MiniWishlistRegressionSink {
  checkpoint(actionId: MiniWishlistRegressionActionId, phase: string, evidence: GenericMiniCheckpoint): Promise<void>;
  serverReadback(actionId: MiniWishlistRegressionActionId, evidence: unknown): Promise<void>;
  execution(result: MiniWishlistRegressionExecution): Promise<void>;
}

export interface RunMiniWishlistRegressionOptions {
  driver: MiniWishlistRegressionDriver;
  fixture: MiniWishlistFixture;
  dangerousFixtureAllowlist: ReadonlySet<string>;
  readback: MiniWishlistReadbackHook;
  sink: MiniWishlistRegressionSink;
}

export class MiniWishlistConnectionError extends Error {}
export class MiniWishlistNativeMediaBlockedError extends Error {}

const PHASES = ["00-before", "01-immediate", "02-settled", "03-return-or-close"] as const;

interface CaseDefinition {
  actionId: MiniWishlistRegressionActionId;
  readbackKind: "conversion" | "undo" | "media";
  open(driver: MiniWishlistRegressionDriver, fixture: MiniWishlistFixture): Promise<void>;
  act(driver: MiniWishlistRegressionDriver, fixture: MiniWishlistFixture): Promise<void>;
}

const CASES: CaseDefinition[] = [
  {
    actionId: "wishlist.convert.confirm",
    readbackKind: "conversion",
    open: (driver, fixture) => driver.openWishlistDetail(fixture.wishlistId),
    act: async (driver, fixture) => {
      await driver.selectLocation(fixture.locationId);
      await driver.confirmConversion();
    },
  },
  {
    actionId: "wishlist.undo.confirm",
    readbackKind: "undo",
    open: (driver, fixture) => driver.openWishlistDetail(fixture.wishlistId),
    act: (driver) => driver.undoPurchase(),
  },
  {
    actionId: "wishlist.edit.media.recrop-upload",
    readbackKind: "media",
    open: (driver, fixture) => driver.openWishlistEdit(fixture.wishlistId),
    act: (driver) => driver.recropAndUploadMedia(),
  },
];

async function finish(
  sink: MiniWishlistRegressionSink,
  fixture: MiniWishlistFixture,
  definition: CaseDefinition,
  status: MiniWishlistRegressionStatus,
  evidencePhases: string[],
  reason?: string,
  readbackPassed?: boolean,
): Promise<MiniWishlistRegressionExecution> {
  const result: MiniWishlistRegressionExecution = {
    schemaVersion: 1,
    platform: "mini",
    actionId: definition.actionId,
    fixtureId: fixture.fixtureId,
    status,
    ...(reason ? { reason } : {}),
    evidencePhases,
    ...(readbackPassed === undefined ? {} : { serverReadback: { kind: definition.readbackKind, passed: readbackPassed } }),
  };
  await sink.execution(result);
  return result;
}

async function capture(
  options: RunMiniWishlistRegressionOptions,
  definition: CaseDefinition,
  phase: string,
  phases: string[],
): Promise<void> {
  await options.sink.checkpoint(definition.actionId, phase, await options.driver.capture());
  phases.push(phase);
}

async function runCase(
  options: RunMiniWishlistRegressionOptions,
  definition: CaseDefinition,
): Promise<MiniWishlistRegressionExecution> {
  const phases: string[] = [];
  let readback: MiniWishlistReadbackResult | undefined;
  try {
    await definition.open(options.driver, options.fixture);
    await options.driver.waitForStable();
    await capture(options, definition, PHASES[0], phases);
    await definition.act(options.driver, options.fixture);
    await capture(options, definition, PHASES[1], phases);
    await options.driver.waitForStable();
    await capture(options, definition, PHASES[2], phases);
    readback = await options.readback(definition.readbackKind, options.fixture);
    await options.sink.serverReadback(definition.actionId, readback.evidence);
    await options.driver.returnFromAction();
    await options.driver.waitForStable();
    await capture(options, definition, PHASES[3], phases);
    if (!readback.passed) {
      return finish(options.sink, options.fixture, definition, "DEFECT", phases, readback.reason ?? `${definition.readbackKind} server readback failed`, false);
    }
    return finish(options.sink, options.fixture, definition, "PASS", phases, undefined, true);
  } catch (error) {
    // Preserve the return/close checkpoint even when the operation or readback fails.
    if (!phases.includes(PHASES[3])) {
      try {
        await options.driver.returnFromAction();
        await options.driver.waitForStable();
        await capture(options, definition, PHASES[3], phases);
      } catch {
        // The result remains non-PASS and accurately lists partial evidence.
      }
    }
    const reason = error instanceof Error ? error.message : String(error);
    const status = error instanceof MiniWishlistNativeMediaBlockedError || error instanceof MiniWishlistConnectionError
      ? "BLOCKED"
      : "DEFECT";
    return finish(options.sink, options.fixture, definition, status, phases, reason, readback?.passed);
  }
}

/** Runs conversion, destructive undo, and edit-media regression in dependency order. */
export async function runMiniWishlistRegression(
  options: RunMiniWishlistRegressionOptions,
): Promise<MiniWishlistRegressionExecution[]> {
  if (!options.dangerousFixtureAllowlist.has(options.fixture.fixtureId)) {
    return Promise.all(CASES.map((definition) => finish(
      options.sink,
      options.fixture,
      definition,
      "BLOCKED",
      [],
      `Fixture ${options.fixture.fixtureId} is not allowlisted for wishlist regression writes`,
    )));
  }
  if (!options.fixture.wishlistId || !options.fixture.locationId) {
    return Promise.all(CASES.map((definition) => finish(
      options.sink,
      options.fixture,
      definition,
      "NOT_EXECUTED",
      [],
      "Fixture must provide a real wishlistId and locationId",
    )));
  }
  try {
    await options.driver.connect();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return Promise.all(CASES.map((definition) => finish(
      options.sink,
      options.fixture,
      definition,
      "BLOCKED",
      [],
      reason,
    )));
  }

  const results: MiniWishlistRegressionExecution[] = [];
  for (const definition of CASES) results.push(await runCase(options, definition));
  return results;
}

function sanitizeNetwork(entries: GenericMiniNetworkEntry[]): GenericMiniNetworkEntry[] {
  return entries.map((entry) => ({
    ...entry,
    url: entry.url.replace(/([?&](?:token|key|code|password)=)[^&]+/giu, "$1***"),
  }));
}

export function createMiniWishlistRegressionFileSink(directory: string): MiniWishlistRegressionSink {
  return {
    async checkpoint(actionId, phase, evidence) {
      const actionRoot = path.join(directory, actionId);
      await ensureDir(actionRoot);
      await fs.writeFile(path.join(actionRoot, `${phase}.png`), evidence.screenshot);
      await writeJson(path.join(actionRoot, `${phase}-ui-tree.json`), evidence.uiTree);
      await writeJson(path.join(actionRoot, `${phase}-route.json`), evidence.route);
      await writeJson(path.join(actionRoot, `${phase}-network.json`), sanitizeNetwork(evidence.network));
    },
    async serverReadback(actionId, evidence) {
      await writeJson(path.join(directory, actionId, "server-readback.json"), evidence);
    },
    async execution(result) {
      await writeJson(path.join(directory, result.actionId, "execution.json"), result);
    },
  };
}
