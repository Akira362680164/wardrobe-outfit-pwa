import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { wardrobeIntakeActionSpecs, wardrobeIntakeMappingCoverage } from "./wardrobe-intake";

interface Manifest {
  screens: Array<{ id: string; domain: "wardrobe" | "intake"; requiredActions: Array<{ id: string; requiredOn: Array<"app" | "mini">; sideEffect: string; serverAssertion?: string }> }>;
}

function manifestObligations() {
  const files = ["wardrobe.yaml", "intake.yaml"];
  return files.flatMap((file) => {
    const manifest = JSON.parse(readFileSync(path.resolve("scripts/parity/manifests", file), "utf8")) as Manifest;
    return manifest.screens.flatMap((screen) => screen.requiredActions.flatMap((action) => action.requiredOn.map((platform) => ({
      key: `${platform}:${screen.id}:${action.id}`,
      sideEffect: action.sideEffect,
      serverAssertion: action.serverAssertion,
    }))));
  });
}

describe("wardrobe/intake semantic action mapping", () => {
  it("covers every manifest platform obligation exactly once", () => {
    const expected = manifestObligations();
    const actual = wardrobeIntakeActionSpecs.map((spec) => `${spec.platform}:${spec.screenId}:${spec.actionId}`);
    expect(actual).toHaveLength(38);
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.slice().sort()).toEqual(expected.map((item) => item.key).sort());
  });

  it("copies side effects and server assertions from manifests", () => {
    const expected = new Map(manifestObligations().map((item) => [item.key, item]));
    for (const spec of wardrobeIntakeActionSpecs) {
      const manifest = expected.get(`${spec.platform}:${spec.screenId}:${spec.actionId}`);
      expect(spec.sideEffect).toBe(manifest?.sideEffect);
      expect(spec.serverAssertion).toBe(manifest?.serverAssertion);
    }
  });

  it("never treats a missing semantic mapping as executable", () => {
    for (const spec of wardrobeIntakeActionSpecs) {
      if (spec.semanticMappingMissing) {
        expect(spec.operation).toBeUndefined();
        expect(spec.missingReason?.length).toBeGreaterThan(10);
      } else {
        expect(spec.operation).toBeDefined();
        expect(spec.source).toMatch(/:\d+$/u);
        if (spec.platform === "app" && spec.operation?.kind === "click") expect(spec.operation.parityId).toMatch(/^parity\.app\./u);
        if (spec.platform === "mini" && spec.operation?.kind === "call") expect(spec.operation.callMethod.length).toBeGreaterThan(1);
      }
    }
  });

  it("reports the audited mapped/unmapped obligation totals", () => {
    expect(wardrobeIntakeMappingCoverage()).toEqual({ total: 38, mapped: 26, unmapped: 12 });
  });
});
