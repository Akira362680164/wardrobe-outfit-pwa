import { describe, expect, it } from "vitest";
import { buildWishlistSettingsActionSpecs, summarizeWishlistSettingsMappings } from "../mappings/wishlist-settings";

describe("wishlist/settings parity mappings", () => {
  it("creates one APP and mini obligation for every manifest requiredAction", () => {
    const specs = buildWishlistSettingsActionSpecs();
    expect(specs).toHaveLength(44);
    expect(new Set(specs.map((spec) => `${spec.platform}/${spec.actionId}`)).size).toBe(44);
    expect(specs.filter((spec) => spec.platform === "app")).toHaveLength(22);
    expect(specs.filter((spec) => spec.platform === "mini")).toHaveLength(22);
  });

  it("makes every obligation executable or explicitly semanticMappingMissing", () => {
    for (const spec of buildWishlistSettingsActionSpecs()) {
      expect(spec.route).toBeTruthy();
      expect(spec.fixtureId).toBeTruthy();
      expect(spec.sideEffect).toBeTruthy();
      expect(Boolean(spec.operation) !== Boolean(spec.semanticMappingMissing)).toBe(true);
      if (spec.operation && (spec.operation.kind === "click" || spec.operation.kind === "tap" || spec.operation.kind === "type" || spec.operation.kind === "input")) {
        expect(spec.operation.parityId).toMatch(/^parity\./u);
        expect(spec.source).toMatch(/:\d+$/u);
      }
      if (spec.sideEffect === "BACKEND_WRITE" || spec.sideEffect === "OBJECT_UPLOAD") {
        expect(spec.serverAssertion).toBeTruthy();
      }
    }
  });

  it("reports stable mapped and unmapped counts for both platforms", () => {
    expect(summarizeWishlistSettingsMappings()).toEqual([
      { platform: "app", obligations: 22, mapped: 17, unmapped: 5 },
      { platform: "mini", obligations: 22, mapped: 12, unmapped: 10 },
    ]);
  });

  it("does not pretend missing statistics or diagnostic semantics are mapped", () => {
    const specs = buildWishlistSettingsActionSpecs();
    for (const key of [
      "app/statistics.period.change",
      "app/statistics.refresh",
      "mini/statistics.period.change",
      "mini/statistics.refresh",
      "mini/diagnostics.upload.confirm",
      "mini/diagnostics.upload.retry",
    ]) {
      const spec = specs.find((candidate) => `${candidate.platform}/${candidate.actionId}` === key);
      expect(spec?.operation).toBeUndefined();
      expect(spec?.semanticMappingMissing).toBeTruthy();
    }
  });
});
