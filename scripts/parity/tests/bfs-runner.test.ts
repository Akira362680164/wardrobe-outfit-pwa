import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createObligations, evidenceRequirements, importEvidence, loadDomainManifests, resumeResults } from "../bfs-runner";

const cwd = process.cwd();
const manifestsRoot = path.join(cwd, "scripts/parity/manifests");

async function evidenceRootFor(obligations: ReturnType<typeof createObligations>, statuses: Record<string, "PASS" | "DEFECT">) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wardrobe-parity-bfs-"));
  for (const obligation of obligations) {
    const directory = path.join(root, obligation.platform, obligation.actionId.replaceAll(".", "-"));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "execution.json"), JSON.stringify({ screenId: obligation.screenId, actionId: obligation.actionId, platform: obligation.platform, status: statuses[obligation.platform] ?? "PASS" }));
    for (const required of evidenceRequirements(obligation)) {
      await fs.writeFile(path.join(directory, required), required.endsWith(".png") ? Buffer.from("png") : "{}");
    }
  }
  return root;
}

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
  const evidenceRoot = await evidenceRootFor(obligations, { app: "PASS", mini: "PASS" });
  const results = await importEvidence(obligations, evidenceRoot);
  assert.deepEqual(results.map((item) => item.status), ["PASS", "PASS"]);
  assert.ok(results.every((item) => item.missingEvidence.length === 0));
});

test("imports complete detail evidence without converting a recorded defect to PASS", async () => {
  const manifests = await loadDomainManifests(manifestsRoot);
  const obligations = createObligations(manifests, {
    screens: ["wardrobe.garment.detail"],
  }).filter((item) => item.actionId === "garment.detail.more");
  const evidenceRoot = await evidenceRootFor(obligations, { app: "PASS", mini: "DEFECT" });
  const results = await importEvidence(obligations, evidenceRoot);
  assert.equal(results.find((item) => item.platform === "app")?.status, "PASS");
  assert.equal(results.find((item) => item.platform === "mini")?.status, "DEFECT");
});

test("does not pass backend assertions without execution evidence", async () => {
  const manifests = await loadDomainManifests(manifestsRoot);
  const obligation = createObligations(manifests, {
    screens: ["settings.diagnostics.upload"],
    platforms: ["mini"],
  }).find((item) => item.actionId === "diagnostics.upload.confirm");
  assert.ok(obligation);
  const [result] = await importEvidence([obligation], path.join(cwd, "artifacts/parity/__missing-evidence__"));
  assert.equal(result.status, "NOT_EXECUTED");
  assert.ok(result.missingEvidence.includes("execution.json"));
});

test("requires four screenshot stages plus route and UI tree evidence", () => {
  const required = evidenceRequirements({ id: "s:a:mini", domain: "d", screenId: "s", actionId: "a", platform: "mini", sideEffect: "NONE", fixtures: [] });
  assert.equal(required.filter((item) => item.endsWith(".png")).length, 4);
  assert.equal(required.filter((item) => item.endsWith("-ui-tree.json")).length, 4);
  assert.equal(required.filter((item) => item.endsWith("-route.json")).length, 4);
});

test("requires network and server readback for every server side effect", () => {
  for (const sideEffect of ["BACKEND_WRITE", "ASYNC_JOB", "OBJECT_UPLOAD"] as const) {
    const required = evidenceRequirements({ id: `s:${sideEffect}:mini`, domain: "d", screenId: "s", actionId: sideEffect, platform: "mini", sideEffect, fixtures: [] });
    assert.ok(required.includes("network.json"));
    assert.ok(required.includes("server-readback.json"));
  }
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
