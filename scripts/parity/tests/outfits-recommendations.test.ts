import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadDomainManifests } from "../bfs-runner";
import { createOutfitsRecommendationsSpecs, summarizeMappings } from "../mappings/outfits-recommendations";

test("maps every outfits/recommendations manifest obligation or marks it missing", async () => {
  const manifests = await loadDomainManifests(path.join(process.cwd(), "scripts/parity/manifests"));
  const specs = createOutfitsRecommendationsSpecs(manifests);
  assert.equal(specs.length, 68);
  assert.ok(specs.every((spec) => spec.fixtureId && spec.operation.kind));
  assert.ok(specs.filter((spec) => !spec.semanticMappingMissing).every((spec) => spec.route));
  assert.ok(specs.every((spec) => Boolean(spec.semanticMappingMissing) === (spec.operation.kind === "semanticMappingMissing")));
  assert.deepEqual(summarizeMappings(specs), {
    mapped: 29,
    unmapped: 39,
    byPlatform: { app: { mapped: 14, unmapped: 20 }, mini: { mapped: 15, unmapped: 19 } },
  });
});

test("calendar mappings use source parity ids and preserve server assertions", async () => {
  const manifests = await loadDomainManifests(path.join(process.cwd(), "scripts/parity/manifests"));
  const specs = createOutfitsRecommendationsSpecs(manifests);
  const nextApp = specs.find((spec) => spec.id === "outfits.planning.calendar:outfits.calendar.next-month:app");
  assert.deepEqual(nextApp?.operation, { kind: "click", parityId: "parity.app.app.src.components.outfit.planning.calendar.view.60a1ddd8b9" });
  const cancelMini = specs.find((spec) => spec.id === "outfits.planning.calendar:outfits.calendar.cancel-worn:mini");
  assert.equal(cancelMini?.serverAssertion, "outfit-plan-cancel-worn-readback");
  assert.equal(cancelMini?.operation.kind, "tap");
});

test("unreliable multi-step destructive mappings stay explicitly unmapped", async () => {
  const manifests = await loadDomainManifests(path.join(process.cwd(), "scripts/parity/manifests"));
  const specs = createOutfitsRecommendationsSpecs(manifests);
  for (const id of [
    "outfits.detail:outfits.detail.delete:app",
    "outfits.detail:outfits.detail.delete:mini",
    "plans.detail:plans.detail.delete:app",
    "plans.detail:plans.detail.delete:mini",
  ]) {
    const spec = specs.find((item) => item.id === id);
    assert.equal(spec?.operation.kind, "semanticMappingMissing");
    assert.match(spec?.semanticMappingMissing ?? "", /No reliable/);
  }
});
