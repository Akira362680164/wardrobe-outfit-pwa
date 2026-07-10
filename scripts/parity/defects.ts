import path from "node:path";
import { readJson, writeJson } from "./lib/fs";
import type { ScreenMapManifest, StaticDefect } from "./types";
import type { ValidationResult } from "./validate";

export async function validateStaticDefects(options: {
  cwd: string;
  runRoot: string;
}): Promise<ValidationResult> {
  const [defects, screenMap] = await Promise.all([
    readJson<StaticDefect[]>(path.join(options.cwd, "scripts", "parity", "config", "static-defects.json")),
    readJson<ScreenMapManifest>(path.join(options.cwd, "scripts", "parity", "manifests", "screen-map.yaml")),
  ]);
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const screenIds = new Set(screenMap.screens.map((screen) => screen.id));
  for (const defect of defects) {
    if (seen.has(defect.defectId)) errors.push(`duplicate defectId ${defect.defectId}`);
    seen.add(defect.defectId);
    if (!screenIds.has(defect.screenId) && !defect.screenId.startsWith("infrastructure.")) {
      errors.push(`${defect.defectId}: unknown screenId ${defect.screenId}`);
    }
    if (defect.sourceEvidence.length === 0) errors.push(`${defect.defectId}: sourceEvidence is empty`);
    if (defect.acceptanceCriteria.length === 0) errors.push(`${defect.defectId}: acceptanceCriteria is empty`);
    if (defect.suspectedFiles.length === 0) errors.push(`${defect.defectId}: suspectedFiles is empty`);
    if (defect.status !== "OPEN") warnings.push(`${defect.defectId}: static seed status is ${defect.status}`);
  }
  const metrics = {
    defects: defects.length,
    p0: defects.filter((defect) => defect.severity === "P0").length,
    p1: defects.filter((defect) => defect.severity === "P1").length,
    p2: defects.filter((defect) => defect.severity === "P2").length,
    p3: defects.filter((defect) => defect.severity === "P3").length,
    staticConfirmed: defects.filter((defect) => defect.confirmation === "STATIC_CONFIRMED").length,
    runtimeConfirmationRequired: defects.filter((defect) => defect.confirmation === "RUNTIME_CONFIRMATION_REQUIRED").length,
  };
  const result = { valid: errors.length === 0, errors, warnings, metrics };
  await writeJson(path.join(options.runRoot, "inventory", "static-defects-validation.json"), result);
  return result;
}
