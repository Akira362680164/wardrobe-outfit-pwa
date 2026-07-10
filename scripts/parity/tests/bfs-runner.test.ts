import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createObligations, importEvidence, loadDomainManifests, resumeResults } from "../bfs-runner";

const cwd = process.cwd();
const manifestsRoot = path.join(cwd, "scripts/parity/manifests");
const evidenceRoot = path.join(cwd, "artifacts/parity/parity-build-20260711-001");

test("creates platform obligations with domain, screen and platform filters", async () => {
  const manifests = await loadDomainManifests(manifestsRoot);
  const obligations = createObligations(manifests, {
    domains: ["outfits"],
    screens: ["outfits.planning.calendar"],
    platforms: ["mini"],
  });
  assert.equal(obligations.length, 7);
  assert.ok(obligations.every((item) => item.platform === "mini"));
  assert.ok(obligations.some((item) => item.actionId === "outfits.calendar.cancel-worn" && item.serverAssertion));
});

test("imports complete calendar evidence as PASS", async () => {
  const manifests = await loadDomainManifests(manifestsRoot);
  const obligations = createObligations(manifests, {
    screens: ["outfits.planning.calendar"],
  }).filter((item) => item.actionId === "outfits.calendar.next-month");
  const results = await importEvidence(obligations, evidenceRoot);
  assert.deepEqual(results.map((item) => item.status), ["PASS", "PASS"]);
  assert.ok(results.every((item) => item.missingEvidence.length === 0));
});

test("imports complete detail evidence without converting a recorded defect to PASS", async () => {
  const manifests = await loadDomainManifests(manifestsRoot);
  const obligations = createObligations(manifests, {
    screens: ["wardrobe.garment.detail"],
  }).filter((item) => item.actionId === "garment.detail.more");
  const results = await importEvidence(obligations, evidenceRoot);
  assert.equal(results.find((item) => item.platform === "app")?.status, "PASS");
  assert.equal(results.find((item) => item.platform === "mini")?.status, "DEFECT");
});

test("does not pass backend assertions without network and server readback evidence", async () => {
  const manifests = await loadDomainManifests(manifestsRoot);
  const obligation = createObligations(manifests, {
    screens: ["settings.diagnostics.upload"],
    platforms: ["mini"],
  }).find((item) => item.actionId === "diagnostics.upload.confirm");
  assert.ok(obligation);
  const [result] = await importEvidence([obligation], evidenceRoot);
  assert.equal(result.status, "NOT_EXECUTED");
  assert.ok(result.missingEvidence.includes("server-readback.json"));
});

test("resume keeps matching terminal results and initializes new obligations", () => {
  const first = {
    id: "screen:action:app",
    domain: "d",
    screenId: "screen",
    actionId: "action",
    platform: "app" as const,
    sideEffect: "NONE" as const,
    fixtures: [],
  };
  const second = { ...first, id: "screen:other:mini", actionId: "other", platform: "mini" as const };
  const resumed = resumeResults([first, second], {
    schemaVersion: 1,
    updatedAt: "2026-07-11T00:00:00.000Z",
    results: [{ ...first, status: "PASS", missingEvidence: [] }],
  });
  assert.equal(resumed[0].status, "PASS");
  assert.equal(resumed[1].status, "NOT_EXECUTED");
});
