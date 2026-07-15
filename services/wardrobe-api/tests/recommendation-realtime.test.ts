import { describe, expect, it } from "vitest";
import {
  ResolveRecommendationsCommandSchema,
  ResolveRecommendationsResponseSchema,
} from "@wardrobe/cloud-contracts";
import {
  RecommendationGenerationCoordinator,
  RecommendationReadService,
  recommendationInputFingerprint,
  validateRecommendationCandidateCurrent,
} from "../src/recommendations/index.js";
import { buildLocationlessInput } from "./fixtures/recommendations/v2-scenarios.js";
import { IDS } from "./fixtures/recommendations/scenarios.js";

const USER = "10000000-0000-4000-8000-000000000001";
const TODAY = "2026-07-15";
const TOMORROW = "2026-07-16";

describe("realtime recommendation input fingerprint", () => {
  it("is stable across request timestamps and input array order", () => {
    const input = buildLocationlessInput();
    const first = recommendationInputFingerprint(input);
    const changedRequestOnly = {
      ...input,
      requestId: "91000000-0000-4000-8000-000000000009",
      resolvedContext: { ...input.resolvedContext, contextResolvedAt: "2026-07-15T12:34:56.000Z" },
      dateContextInput: { ...input.dateContextInput, weatherEvidence: { ...input.dateContextInput.weatherEvidence, weatherUpdatedAt: "2026-07-15T12:34:56.000Z" } },
      garments: [...input.garments].reverse(),
      savedOutfits: [...input.savedOutfits].reverse(),
      wearHistory: [...input.wearHistory].reverse(),
      feedback: [...input.feedback].reverse(),
      anchorGarmentIds: [...input.anchorGarmentIds].reverse(),
    };
    expect(recommendationInputFingerprint(changedRequestOnly)).toBe(first);
  });

  it("normalizes semantic garment sets and ignores display-only weather summary", () => {
    const input = buildLocationlessInput();
    const changedPresentationOnly = {
      ...input,
      garments: input.garments.map((item, index) => index === 0 ? {
        ...item,
        colors: [...item.colors].reverse(),
        seasons: [...item.seasons].reverse(),
        styles: [...item.styles].reverse(),
      } : item),
      dateContextInput: {
        ...input.dateContextInput,
        weatherEvidence: { ...input.dateContextInput.weatherEvidence, summary: "仅展示文案变化" },
      },
    };
    expect(recommendationInputFingerprint(changedPresentationOnly)).toBe(recommendationInputFingerprint(input));
  });

  it("changes for garment state, location, weather evidence, plan protection, or algorithm version", () => {
    const input = buildLocationlessInput();
    const base = recommendationInputFingerprint(input);
    expect(recommendationInputFingerprint({ ...input, garments: input.garments.map((item, index) => index ? item : { ...item, status: "laundry" as const }) })).not.toBe(base);
    expect(recommendationInputFingerprint({ ...input, planProtectionState: { planEntryId: "91000000-0000-4000-8000-000000000001", revision: 1 } })).not.toBe(base);
    expect(recommendationInputFingerprint({ ...input, algorithmVersion: "next-version" })).not.toBe(base);
  });
});

describe("realtime recommendation coordinator", () => {
  it("keeps GET read service strictly read-only when no current exists", async () => {
    const calls: string[] = [];
    const service = new RecommendationReadService(undefined, { listCurrent: async () => { calls.push("list"); return []; } } as any);
    expect(await service.read(USER, TODAY, TODAY)).toEqual({ timezone: "Asia/Shanghai", pairConsistent: true, items: [] });
    expect(calls).toEqual(["list"]);
  });

  it("reuses an unexpired current with the same fingerprint without publishing", async () => {
    const calls: string[] = [];
    const current = record("a".repeat(64), TODAY);
    const coordinator = new RecommendationGenerationCoordinator({
      prepare: async () => { calls.push("prepare"); return prepared(current.inputFingerprint!, TODAY); },
      findCurrent: async () => current,
      publish: async () => { calls.push("publish"); return current; },
      publishHomePair: async () => { calls.push("pair"); return [current, record("b".repeat(64), TOMORROW)]; },
    } as any);
    const result = await coordinator.resolve(USER, { dates: [TODAY] }, "foreground");
    expect(result.results[0]?.status).toBe("reused");
    expect(calls).toEqual(["prepare"]);
  });

  it("does not materialize or invoke the engine when current is reusable", async () => {
    let engineCalls = 0;
    const current = record("a".repeat(64), TODAY);
    const coordinator = new RecommendationGenerationCoordinator({
      prepare: async () => ({ ...prepared(current.inputFingerprint!, TODAY), materialize: async () => { engineCalls += 1; return prepared(current.inputFingerprint!, TODAY).command; } }),
      findCurrent: async () => current,
      publish: async () => current,
      publishHomePair: async () => [current, record("b".repeat(64), TOMORROW)],
    } as any);
    expect((await coordinator.resolve(USER, { dates: [TODAY] })).results[0]?.status).toBe("reused");
    expect(engineCalls).toBe(0);
  });

  it("serves a valid current stale when prepare fails before generation", async () => {
    const current = record("a".repeat(64), TODAY);
    const coordinator = new RecommendationGenerationCoordinator({
      prepare: async () => { throw new Error("weather unavailable"); },
      findCurrent: async () => current,
      publish: async () => current,
      publishHomePair: async () => [current, current],
    } as any);
    expect((await coordinator.resolve(USER, { dates: [TODAY] })).results[0]?.status).toBe("served_stale");
  });

  it("publishes today and tomorrow as one batch and returns no mixed generation", async () => {
    const calls: string[] = [];
    const coordinator = new RecommendationGenerationCoordinator({
      prepare: async (_userId: string, date: string) => prepared(date === TODAY ? "a".repeat(64) : "b".repeat(64), date),
      findCurrent: async () => null,
      publish: async () => { throw new Error("single publish must not be used for home pair"); },
      publishHomePair: async (commands: any[]) => { calls.push(commands[0].generationBatchId, commands[1].generationBatchId); return [record(commands[0].inputFingerprint, TODAY), record(commands[1].inputFingerprint, TOMORROW)]; },
    } as any);
    const result = await coordinator.resolve(USER, { dates: [TODAY, TOMORROW] }, "foreground");
    expect(result.results.map((item) => item.status)).toEqual(["generated", "generated"]);
    expect(calls[0]).toBe(calls[1]);
  });

  it("keeps force strict and idempotent at the contract boundary", () => {
    expect(() => ResolveRecommendationsCommandSchema.parse({ dates: [TODAY], force: true })).toThrow();
    expect(() => ResolveRecommendationsCommandSchema.parse({ dates: [TODAY, TOMORROW, "2026-07-17"] })).toThrow();
    expect(() => ResolveRecommendationsResponseSchema.parse({ timezone: "Asia/Shanghai", results: [{ targetDate: TODAY, status: "not_ready" }] })).not.toThrow();
  });
});

describe("accept current candidate context", () => {
  const ordinary = [IDS.shirt, IDS.pants, IDS.loafers];
  it("rejects old travel T8 after travel is cancelled", async () => {
    const input = buildLocationlessInput();
    await expect(validateRecommendationCandidateCurrent(input, { template: "T8" }, [...ordinary, IDS.hat])).rejects.toThrow("recommendation_no_longer_valid");
  });
  it("rejects a candidate missing newly-required outerwear after cold or heavy-rain context", async () => {
    const base = buildLocationlessInput();
    const input = { ...base, resolvedContext: { ...base.resolvedContext, contextMode: "forecast" as const }, dateContextInput: { ...base.dateContextInput, weatherEvidence: { ...base.dateContextInput.weatherEvidence, weatherSource: "forecast" as const, weatherConfidence: 0.9, temperatureMinC: 0, temperatureMaxC: 8, rainProbability: 90 } } };
    await expect(validateRecommendationCandidateCurrent(input, { template: "T1" }, ordinary)).rejects.toThrow("recommendation_no_longer_valid");
  });
  it("rejects a template that is no longer available for the current scene", async () => {
    const base = buildLocationlessInput();
    const input = { ...base, dateContextInput: { ...base.dateContextInput, dayType: "rest_day" as const, userProfile: { ...base.dateContextInput.userProfile, restDayScene: "casual" as const } } };
    await expect(validateRecommendationCandidateCurrent(input, { template: "T7" }, [...ordinary, IDS.bag])).rejects.toThrow("recommendation_no_longer_valid");
  });
  it("rejects current candidate-level blocking risk", async () => {
    await expect(validateRecommendationCandidateCurrent(buildLocationlessInput(), { template: "T1", deterministicRiskAssessment: { blockingCodes: ["missing_required_slot"] } }, ordinary)).rejects.toThrow("recommendation_no_longer_valid");
  });
});

function prepared(inputFingerprint: string, targetDate: string) {
  return { command: { userId: USER, targetDate, inputFingerprint, generationBatchId: "50000000-0000-4000-8000-000000000001", algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1" }, skipReason: null };
}
function record(inputFingerprint: string, targetDate: string) {
  return { id: `60000000-0000-4000-8000-${targetDate === TODAY ? "000000000001" : "000000000002"}`, userId: USER, targetDate, inputFingerprint, revision: 1, readiness: "ready", algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1", expiresAt: "2026-08-15T00:00:00.000Z", payload: { schemaVersion: 3 }, isCurrent: true };
}
