import { describe, expect, it } from "vitest";
import {
  ResolveRecommendationsCommandSchema,
  ResolveRecommendationsResponseSchema,
} from "@wardrobe/cloud-contracts";
import {
  RecommendationGenerationCoordinator,
  RecommendationReadService,
  recommendationInputFingerprint,
} from "../src/recommendations/index.js";
import { buildLocationlessInput } from "./fixtures/recommendations/v2-scenarios.js";

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

function prepared(inputFingerprint: string, targetDate: string) {
  return { command: { userId: USER, targetDate, inputFingerprint, generationBatchId: "50000000-0000-4000-8000-000000000001", algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1" }, skipReason: null };
}
function record(inputFingerprint: string, targetDate: string) {
  return { id: `60000000-0000-4000-8000-${targetDate === TODAY ? "000000000001" : "000000000002"}`, userId: USER, targetDate, inputFingerprint, revision: 1, readiness: "ready", algorithmVersion: "wardora-recommendation-realtime-v1", ruleVersion: "wardora-rules-realtime-1", expiresAt: "2026-08-15T00:00:00.000Z", payload: { schemaVersion: 3 }, isCurrent: true };
}
