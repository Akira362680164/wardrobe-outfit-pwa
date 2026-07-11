import assert from "node:assert/strict";
import test from "node:test";
import { computeParityGates } from "../report";
import type { BfsResult } from "../bfs-runner";
import type { StaticDefect } from "../types";

const obligation = (status: BfsResult["status"], missingEvidence: string[] = []): BfsResult => ({
  id: "screen:action:mini", domain: "domain", screenId: "screen", actionId: "action", platform: "mini",
  sideEffect: "NONE", fixtures: [], status, missingEvidence,
});
const defect = (status: StaticDefect["status"], severity: StaticDefect["severity"] = "P1"): StaticDefect => ({
  defectId: "STATIC-TEST-001", severity, category: "TEST", screenId: "screen", confirmation: "STATIC_CONFIRMED",
  expected: "expected", actual: "actual", sourceEvidence: ["file:1"], acceptanceCriteria: ["accepted"], suspectedFiles: ["file"], status,
});

test("audit gate fails on missing execution or evidence", () => {
  const gates = computeParityGates({ obligations: [obligation("NOT_EXECUTED", ["execution.json"])], unmappedScreens: 0, unclassifiedDifferences: 0, defects: [] });
  assert.equal(gates.auditGate.status, "FAIL");
  assert.match(gates.auditGate.failures.join(" "), /not executed/);
  assert.match(gates.auditGate.failures.join(" "), /missing evidence/);
});

test("product gate fails on open P0-P2 and fixed unverified", () => {
  const gates = computeParityGates({ obligations: [obligation("PASS")], unmappedScreens: 0, unclassifiedDifferences: 0, defects: [defect("OPEN", "P0"), defect("FIXED_UNVERIFIED", "P2")] });
  assert.equal(gates.productGate.status, "FAIL");
  assert.match(gates.productGate.failures.join(" "), /OPEN P0/);
  assert.match(gates.productGate.failures.join(" "), /FIXED_UNVERIFIED/);
});

test("both gates pass only with complete evidence and no pending defects", () => {
  const gates = computeParityGates({ obligations: [obligation("PASS")], unmappedScreens: 0, unclassifiedDifferences: 0, defects: [defect("VERIFIED")] });
  assert.equal(gates.auditGate.status, "PASS");
  assert.equal(gates.productGate.status, "PASS");
});
