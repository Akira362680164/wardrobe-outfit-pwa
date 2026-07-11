import fs from "node:fs/promises";
import path from "node:path";
import type { DomainManifest, ManifestAction, Platform, ScreenManifest } from "./types";

export type BfsStatus = "PASS" | "DEFECT" | "NOT_EXECUTED";

export interface BfsFilters {
  domains?: string[];
  screens?: string[];
  platforms?: Platform[];
}

export interface BfsObligation {
  id: string;
  domain: string;
  screenId: string;
  actionId: string;
  platform: Platform;
  sideEffect: ManifestAction["sideEffect"];
  serverAssertion?: string;
  fixtures: string[];
}

export interface BfsResult extends BfsObligation {
  status: BfsStatus;
  evidenceDirectory?: string;
  missingEvidence: string[];
  importedExecutionStatus?: string;
}

export interface BfsCheckpoint {
  schemaVersion: 1;
  updatedAt: string;
  results: BfsResult[];
}

const STAGES = ["00-before-raw", "01-immediate", "02-settled", "03-return-or-close"] as const;

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadDomainManifests(manifestDirectory: string): Promise<DomainManifest[]> {
  const files = (await fs.readdir(manifestDirectory)).filter((file) => file.endsWith(".yaml")).sort();
  const manifests: DomainManifest[] = [];
  for (const file of files) {
    const parsed = JSON.parse(await fs.readFile(path.join(manifestDirectory, file), "utf8")) as Partial<DomainManifest>;
    if (parsed.schemaVersion === 1 && typeof parsed.domain === "string" && Array.isArray(parsed.screens)) {
      manifests.push(parsed as DomainManifest);
    }
  }
  return manifests;
}

function selected(value: string, filter?: string[]): boolean {
  return !filter?.length || filter.includes(value);
}

export function createObligations(manifests: DomainManifest[], filters: BfsFilters = {}): BfsObligation[] {
  const obligations: BfsObligation[] = [];
  for (const manifest of manifests) {
    for (const screen of manifest.screens) {
      if (!selected(manifest.domain, filters.domains) && !selected(screen.domain, filters.domains)) continue;
      if (!selected(screen.id, filters.screens)) continue;
      for (const action of screen.requiredActions) {
        for (const platform of action.requiredOn) {
          if (filters.platforms?.length && !filters.platforms.includes(platform)) continue;
          if (action.notApplicable?.[platform]) continue;
          obligations.push({
            id: `${screen.id}:${action.id}:${platform}`,
            domain: screen.domain,
            screenId: screen.id,
            actionId: action.id,
            platform,
            sideEffect: action.sideEffect,
            serverAssertion: action.serverAssertion,
            fixtures: screen.fixtures,
          });
        }
      }
    }
  }
  return obligations.sort((a, b) => a.id.localeCompare(b.id));
}

async function findExecutionFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const output: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.name === "execution.json") output.push(full);
    }
  }
  await visit(root);
  return output.sort();
}

export function evidenceRequirements(obligation: BfsObligation): string[] {
  const files = STAGES.flatMap((stage) => [`${stage}.png`, `${stage}-ui-tree.json`, `${stage}-route.json`]);
  if (obligation.serverAssertion || ["BACKEND_WRITE", "ASYNC_JOB", "OBJECT_UPLOAD"].includes(obligation.sideEffect)) {
    files.push("network.json", "server-readback.json");
  }
  return files;
}

export async function validateImportedEvidence(obligation: BfsObligation, executionFile?: string): Promise<BfsResult> {
  if (!executionFile) return { ...obligation, status: "NOT_EXECUTED", missingEvidence: ["execution.json", ...evidenceRequirements(obligation)] };
  const directory = path.dirname(executionFile);
  const execution = JSON.parse(await fs.readFile(executionFile, "utf8")) as Record<string, unknown>;
  const missingEvidence: string[] = [];
  const executionKey = `${execution.screenId}:${execution.actionId}:${execution.platform}`;
  if (executionKey !== obligation.id) missingEvidence.push("execution.identity");
  for (const required of evidenceRequirements(obligation)) {
    if (!(await exists(path.join(directory, required)))) missingEvidence.push(required);
  }
  const importedExecutionStatus = typeof execution.status === "string" ? execution.status : undefined;
  let status: BfsStatus = "NOT_EXECUTED";
  if (missingEvidence.length === 0) {
    if (importedExecutionStatus === "PASS") status = "PASS";
    else if (importedExecutionStatus === "DEFECT") status = "DEFECT";
  }
  return { ...obligation, status, evidenceDirectory: directory, missingEvidence, importedExecutionStatus };
}

export async function importEvidence(obligations: BfsObligation[], evidenceRoot: string): Promise<BfsResult[]> {
  const candidates = await findExecutionFiles(evidenceRoot);
  const indexed = new Map<string, string>();
  for (const file of candidates) {
    const execution = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    const key = `${execution.screenId}:${execution.actionId}:${execution.platform}`;
    if (indexed.has(key)) throw new Error(`Duplicate execution evidence for ${key}: ${indexed.get(key)} and ${file}`);
    indexed.set(key, file);
  }
  const results: BfsResult[] = [];
  for (const obligation of obligations) results.push(await validateImportedEvidence(obligation, indexed.get(obligation.id)));
  return results;
}

export async function loadCheckpoint(file: string): Promise<BfsCheckpoint | undefined> {
  if (!(await exists(file))) return undefined;
  const parsed = JSON.parse(await fs.readFile(file, "utf8")) as BfsCheckpoint;
  return parsed.schemaVersion === 1 && Array.isArray(parsed.results) ? parsed : undefined;
}

export function resumeResults(obligations: BfsObligation[], checkpoint?: BfsCheckpoint): BfsResult[] {
  const previous = new Map((checkpoint?.results ?? []).map((result) => [result.id, result]));
  return obligations.map((obligation) => previous.get(obligation.id) ?? {
    ...obligation,
    status: "NOT_EXECUTED",
    missingEvidence: ["execution.json"],
  });
}

export async function writeCheckpoint(file: string, results: BfsResult[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const checkpoint: BfsCheckpoint = { schemaVersion: 1, updatedAt: new Date().toISOString(), results };
  await fs.writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

export function screenForAction(screen: ScreenManifest, actionId: string): boolean {
  return screen.requiredActions.some((action) => action.id === actionId);
}
