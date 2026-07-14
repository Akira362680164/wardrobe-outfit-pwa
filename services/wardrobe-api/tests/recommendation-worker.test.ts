import { describe, expect, it } from "vitest";
import { BoundedAsyncQueue } from "../src/recommendations/bounded-queue.js";
import { inferWeatherEvidence } from "../src/recommendations/workspace-adapter.js";
import { nextShanghaiSchedule } from "../src/recommendations/worker.js";
import { RecommendationReadQuerySchema, RecommendationReadResponseSchema } from "@wardrobe/cloud-contracts";

describe("recommendation worker scheduling and bounded queue", () => {
  it("computes the next 03:30 Asia/Shanghai boundary before and after today's trigger", () => {
    expect(nextShanghaiSchedule(new Date("2026-07-13T19:29:00.000Z")).toISOString()).toBe("2026-07-13T19:30:00.000Z");
    expect(nextShanghaiSchedule(new Date("2026-07-13T19:31:00.000Z")).toISOString()).toBe("2026-07-14T19:30:00.000Z");
  });

  it("applies producer backpressure at capacity 64 with concurrency one and loses no tasks", async () => {
    const queue = new BoundedAsyncQueue<number>(64);
    const consumed: number[] = [];
    let produced = 0;
    const producer = (async () => { for (let index = 0; index < 200; index++) { await queue.push(index); produced++; } queue.close(); })();
    const consumer = (async () => { for (;;) { const item = await queue.shift(); if (item === null) break; consumed.push(item); await Promise.resolve(); } })();
    await Promise.all([producer, consumer]);
    expect(produced).toBe(200); expect(consumed).toEqual(Array.from({ length: 200 }, (_, index) => index)); expect(queue.peakSize).toBeLessThanOrEqual(64);
  });

  it("uses honest non-forecast evidence for plans and ordinary dates", () => {
    expect(inferWeatherEvidence("2026-07-14", { activities: ["business meeting"] }, "2026-07-14T00:00:00.000Z")).toMatchObject({ weatherSource: "plan_semantic_inference", weatherConfidence: 0.45 });
    expect(inferWeatherEvidence("2026-12-14", null, "2026-07-14T00:00:00.000Z")).toMatchObject({ weatherSource: "seasonal_inference", temperatureMinC: 0, temperatureMaxC: 12 });
  });
});

describe("recommendation read contract", () => {
  it("rejects inverted and overlong ranges", () => {
    expect(() => RecommendationReadQuerySchema.parse({ startDate: "2026-07-15", endDate: "2026-07-14" })).toThrow();
    expect(() => RecommendationReadQuerySchema.parse({ startDate: "2026-07-01", endDate: "2026-08-02" })).toThrow();
  });
  it("cannot claim a mixed generation pair is consistent", () => {
    const base = { recommendationId: "10000000-0000-4000-8000-000000000001", targetDate: "2026-07-14", generationBatchId: "20000000-0000-4000-8000-000000000001", readiness: "not_ready", generationMode: "rule_only", generatedAt: "2026-07-14T00:00:00.000Z", expiresAt: "2026-08-14T00:00:00.000Z", weatherEvidence: { weatherSource: "seasonal_inference", weatherConfidence: 0.3, weatherUpdatedAt: "2026-07-14T00:00:00.000Z", summary: "季节推断" }, recommendations: [] };
    expect(() => RecommendationReadResponseSchema.parse({ timezone: "Asia/Shanghai", pairConsistent: true, items: [base, { ...base, recommendationId: "10000000-0000-4000-8000-000000000002", targetDate: "2026-07-15", generationBatchId: "20000000-0000-4000-8000-000000000002" }] })).toThrow();
  });
  it("keeps old V1 display rows parseable while accepting the strict V2 display union", () => {
    const v1 = { recommendationId: "10000000-0000-4000-8000-000000000001", targetDate: "2026-07-14", generationBatchId: "20000000-0000-4000-8000-000000000001", readiness: "not_ready", generationMode: "rule_only", generatedAt: "2026-07-14T00:00:00.000Z", expiresAt: "2026-08-14T00:00:00.000Z", weatherEvidence: { weatherSource: "seasonal_inference", weatherConfidence: 0.3, weatherUpdatedAt: "2026-07-14T00:00:00.000Z", summary: "季节推断" }, recommendations: [] };
    const v2 = { ...v1, recommendationId: "10000000-0000-4000-8000-000000000002", contextMode: "locationless", targetTimezone: "Asia/Shanghai", contextResolvedAt: "2026-07-14T00:00:00.000Z", algorithmVersion: "wardora-recommendation-1d-a-v2", ruleVersion: "wardora-rules-locationless-1", availabilityReason: "locationless", endpointFreshness: [] };
    const parsed = RecommendationReadResponseSchema.parse({ timezone: "Asia/Shanghai", pairConsistent: false, items: [v1, v2] });
    expect(parsed.items).toHaveLength(2);
  });
});
