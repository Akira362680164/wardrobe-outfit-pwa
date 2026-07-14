import { describe, expect, it } from "vitest";

import {
  DailyRecommendationRecordSchema,
  PublishDailyRecommendationCommandSchema,
  RecommendationEngineInputV2Schema,
  RecommendationPayloadSchema,
  RecommendationPayloadV1Schema,
  RecommendationPayloadV2Schema,
} from "@wardrobe/cloud-contracts";

import {
  calculateCandidateAdaptabilityFit,
  calculateItemAdaptabilityFit,
  canonicalizeOutput,
  generateRecommendations,
  generateRecommendationsV2,
} from "../src/recommendations/index.js";
import { buildFixtureInput } from "./fixtures/recommendations/scenarios.js";
import {
  candidateAdaptabilityVectors,
  CONTEXT_RESOLVED_AT,
  buildFallbackInput,
  buildForecastInput,
  buildLocationlessInput,
  fallbackContext,
  itemAdaptabilityVectors,
  locationlessContext,
  LOCATIONLESS_SUMMARY,
  v2ScenarioFixtures,
  WEATHER_FALLBACK_SUMMARY,
} from "./fixtures/recommendations/v2-scenarios.js";

const clone = <T>(value: T): T => structuredClone(value);

describe("recommendation 1D-A hand-reviewed fixtures", () => {
  it("keeps the new fixture corpus explicit and separate from the 24 V1 fixtures", () => {
    expect(v2ScenarioFixtures).toHaveLength(6);
    expect(itemAdaptabilityVectors).toHaveLength(5);
    expect(candidateAdaptabilityVectors).toHaveLength(3);
    expect(new Set(v2ScenarioFixtures.map((fixture) => fixture.id)).size).toBe(6);
  });

  it.each(itemAdaptabilityVectors)("matches frozen item vector $id", ({ garment, expected }) => {
    expect(calculateItemAdaptabilityFit(garment)).toBe(expected);
  });

  it.each(candidateAdaptabilityVectors)("matches frozen candidate vector $id", ({ garments, template, expected }) => {
    expect(calculateCandidateAdaptabilityFit(garments, template)).toBe(expected);
  });

  it.each(v2ScenarioFixtures)("matches V2 readiness $id", async ({ input, expectedStatus }) => {
    const output = await generateRecommendationsV2(input);
    expect(output.readiness.status).toBe(expectedStatus);
    if (input.garments.length === 0) {
      expect(output.recommendations).toEqual([]);
      expect(output.readiness.missingSlotCodes).toEqual(["shoes", "tops", "pants"]);
    }
  });
});

describe("V2 context modes and deterministic algorithm", () => {
  it("delegates forecast to V1 with deeply equal engineOutput", async () => {
    const v2Input = buildForecastInput();
    const v1Input = clone(v2Input) as any;
    delete v1Input.resolvedContext;
    expect(await generateRecommendationsV2(v2Input)).toEqual(await generateRecommendations(v1Input));
  });

  it("does not create temperature or rain conclusions in locationless mode", async () => {
    const input = buildLocationlessInput({
      garments: buildFixtureInput().garments.map((garment, index) => index === 0
        ? { ...garment, temperatureMinC: -30, temperatureMaxC: -20 }
        : garment),
    });
    const output = await generateRecommendationsV2(input);
    expect(input.dateContextInput.weatherEvidence).not.toHaveProperty("temperatureMinC");
    expect(input.dateContextInput.weatherEvidence).not.toHaveProperty("temperatureMaxC");
    expect(input.dateContextInput.weatherEvidence).not.toHaveProperty("rainProbability");
    expect(output.exclusions.flatMap((entry) => entry.codes)).not.toContain("temperature_mismatch");
    const reasons = output.shortlist.flatMap((candidate) => candidate.reasonCodes);
    const risks = output.shortlist.flatMap((candidate) => candidate.riskCodes);
    const pawReasons = output.shortlist.flatMap((candidate) => candidate.pawEvaluation.reasonCodes);
    const pawRisks = output.shortlist.flatMap((candidate) => candidate.pawEvaluation.sceneRisks);
    for (const code of ["weather_fit", "rain_ready", "needs_evening_layer"]) {
      expect(reasons).not.toContain(code);
      expect(pawReasons).not.toContain(code);
    }
    for (const code of ["too_hot", "too_cold", "rain_exposure", "wind_exposure", "missing_required_layer"]) {
      expect(risks).not.toContain(code);
      expect(pawRisks).not.toContain(code);
    }
  });

  it("is month-agnostic in locationless heat handling", async () => {
    const extreme = { ...buildFixtureInput().garments[0]!, id: "94000000-0000-4000-8000-000000000001", temperatureMinC: 35, temperatureMaxC: 45, warmth: 1 as const };
    const july = buildLocationlessInput({ garments: [...buildFixtureInput().garments, extreme] });
    const january = buildLocationlessInput({
      asOfDate: "2027-01-13",
      resolvedContext: locationlessContext("2027-01-14"),
      dateContextInput: { ...buildLocationlessInput().dateContextInput, date: "2027-01-14", weekday: 4 },
      garments: [...buildFixtureInput().garments, extreme],
    });
    const julyOutput = await generateRecommendationsV2(july);
    const januaryOutput = await generateRecommendationsV2(january);
    expect(julyOutput.exclusions.find((entry) => entry.garmentId === extreme.id)?.codes ?? []).not.toContain("temperature_mismatch");
    expect(januaryOutput.exclusions.find((entry) => entry.garmentId === extreme.id)?.codes ?? []).toEqual(julyOutput.exclusions.find((entry) => entry.garmentId === extreme.id)?.codes ?? []);
    expect(calculateItemAdaptabilityFit(extreme)).toBe(calculateItemAdaptabilityFit({ ...extreme }));
  });

  it("keeps fallback algorithm equal to locationless apart from audited context evidence", async () => {
    const locationless = await generateRecommendationsV2(buildLocationlessInput());
    const fallback = await generateRecommendationsV2(buildFallbackInput());
    expect(fallback).toEqual(locationless);
  });

  it("adds adaptable_conditions only at the frozen 75 threshold", async () => {
    const output = await generateRecommendationsV2(buildLocationlessInput());
    for (const candidate of output.shortlist) {
      expect(candidate.reasonCodes.includes("adaptable_conditions")).toBe(candidate.ruleScores.weatherFit >= 75);
    }
  });

  it("is byte-equivalent across 100 runs and invariant to all V1 input array order", async () => {
    const input = buildLocationlessInput();
    const expected = canonicalizeOutput(await generateRecommendationsV2(input));
    for (let run = 0; run < 100; run += 1) {
      expect(canonicalizeOutput(await generateRecommendationsV2(input))).toBe(expected);
    }
    const reversed = {
      ...input,
      garments: [...input.garments].reverse(),
      savedOutfits: [...input.savedOutfits].reverse(),
      wearHistory: [...input.wearHistory].reverse(),
      feedback: [...input.feedback].reverse(),
      anchorGarmentIds: [...input.anchorGarmentIds].reverse(),
    };
    expect(await generateRecommendationsV2(reversed)).toEqual(await generateRecommendationsV2(input));
  });
});

describe("V1/V2 strict payload compatibility", () => {
  it("accepts old V1 and strict schemaVersion=2 V2 payloads", async () => {
    const v1Input = buildFixtureInput();
    const v1Output = await generateRecommendations(v1Input);
    const v1Payload = { engineOutput: v1Output, dateContextInput: v1Input.dateContextInput };
    expect(RecommendationPayloadV1Schema.parse(v1Payload)).toEqual(v1Payload);
    expect(RecommendationPayloadSchema.parse(v1Payload)).toEqual(v1Payload);

    const v2Input = buildLocationlessInput();
    const v2Output = await generateRecommendationsV2(v2Input);
    const v2Payload = { schemaVersion: 2, resolvedContext: v2Input.resolvedContext, dateContextInput: v2Input.dateContextInput, engineOutput: v2Output };
    expect(RecommendationPayloadV2Schema.parse(v2Payload)).toEqual(v2Payload);
    expect(RecommendationPayloadSchema.parse(v2Payload)).toEqual(v2Payload);
  });

  it("rejects adaptable_conditions in V1 and forecast payloads", async () => {
    const v1Input = buildFixtureInput();
    const v1Payload: any = {
      engineOutput: await generateRecommendations(v1Input),
      dateContextInput: v1Input.dateContextInput,
    };
    v1Payload.engineOutput.shortlist[0].reasonCodes.push("adaptable_conditions");
    const v1Display = v1Payload.engineOutput.recommendations.find(
      (candidate: any) => candidate.candidateId === v1Payload.engineOutput.shortlist[0].candidateId,
    );
    if (v1Display) v1Display.reasonCodes.push("adaptable_conditions");
    expect(() => RecommendationPayloadV1Schema.parse(v1Payload)).toThrow();

    const forecastInput = buildForecastInput();
    const forecastPayload: any = {
      schemaVersion: 2,
      resolvedContext: forecastInput.resolvedContext,
      dateContextInput: forecastInput.dateContextInput,
      engineOutput: await generateRecommendationsV2(forecastInput),
    };
    forecastPayload.engineOutput.shortlist[0].reasonCodes.push("adaptable_conditions");
    const forecastDisplay = forecastPayload.engineOutput.recommendations.find(
      (candidate: any) => candidate.candidateId === forecastPayload.engineOutput.shortlist[0].candidateId,
    );
    if (forecastDisplay) forecastDisplay.reasonCodes.push("adaptable_conditions");
    expect(() => RecommendationPayloadV2Schema.parse(forecastPayload)).toThrow();
  });

  it("rejects generic fake weather in outer and nested audits", async () => {
    const input = buildLocationlessInput();
    const output = await generateRecommendationsV2(input);
    const base: any = {
      schemaVersion: 2,
      resolvedContext: input.resolvedContext,
      dateContextInput: input.dateContextInput,
      engineOutput: output,
    };
    const mutations: Array<[string, (candidate: any) => void]> = [
      ...["weather_fit", "rain_ready", "needs_evening_layer"].flatMap((code) => [
        [`outer reason ${code}`, (candidate: any) => candidate.reasonCodes.push(code)],
        [`nested reason ${code}`, (candidate: any) => candidate.pawEvaluation.reasonCodes.push(code)],
      ] as Array<[string, (candidate: any) => void]>),
      ...["too_hot", "too_cold", "rain_exposure", "wind_exposure", "missing_required_layer"].flatMap((code) => [
        [`outer risk ${code}`, (candidate: any) => candidate.riskCodes.push(code)],
        [`nested risk ${code}`, (candidate: any) => candidate.pawEvaluation.sceneRisks.push(code)],
      ] as Array<[string, (candidate: any) => void]>),
    ];
    for (const [_name, mutate] of mutations) {
      const invalid = clone(base);
      const audit = invalid.engineOutput.shortlist[0];
      mutate(audit);
      const display = invalid.engineOutput.recommendations.find(
        (candidate: any) => candidate.candidateId === audit.candidateId,
      );
      if (display) mutate(display);
      expect(() => RecommendationPayloadV2Schema.parse(invalid)).toThrow();
    }
  });

  it("rejects generic weather-derived DateContext conclusions", async () => {
    const input = buildLocationlessInput();
    const base: any = {
      schemaVersion: 2,
      resolvedContext: input.resolvedContext,
      dateContextInput: input.dateContextInput,
      engineOutput: await generateRecommendationsV2(input),
    };
    for (const mutate of [
      (value: any) => { value.engineOutput.dateContext.thermalStrategy = "cooling"; },
      (value: any) => { value.engineOutput.dateContext.rainStrategy = "full_rain_protection"; },
      (value: any) => { value.engineOutput.dateContext.confidence = "high"; },
      ...["avoid_suede", "avoid_heavy_outerwear", "avoid_non_breathable", "avoid_open_toe_shoes"].map(
        (code) => (value: any) => { value.engineOutput.dateContext.avoidRules.push(code); },
      ),
    ]) {
      const invalid = clone(base);
      mutate(invalid);
      expect(() => RecommendationPayloadV2Schema.parse(invalid)).toThrow();
    }
    const activityRule = clone(base);
    activityRule.engineOutput.dateContext.avoidRules.push("avoid_high_heels");
    expect(() => RecommendationPayloadV2Schema.parse(activityRule)).not.toThrow();
  });

  it.each([
    ["locationless", buildLocationlessInput],
    ["weather_fallback", buildFallbackInput],
  ])("rejects fake weather contextSummary in %s", async (_mode, buildInput) => {
    const input = buildInput();
    const payload: any = {
      schemaVersion: 2,
      resolvedContext: input.resolvedContext,
      dateContextInput: input.dateContextInput,
      engineOutput: await generateRecommendationsV2(input),
    };
    payload.engineOutput.dateContext.contextSummary = "北京暴雨且气温 35°C";
    expect(() => RecommendationPayloadV2Schema.parse(payload)).toThrow();
  });

  it.each([
    ["business", () => {
      const input = clone(buildLocationlessInput());
      input.dateContextInput.userProfile.workdayScene = "business";
      return input;
    }],
    ["casual", () => {
      const input = clone(buildFallbackInput());
      input.dateContextInput.dayType = "rest_day";
      input.dateContextInput.userProfile.restDayScene = "casual";
      return input;
    }],
  ])("accepts deterministic generic contextSummary for %s scene", async (sceneType, buildInput) => {
    const input = buildInput();
    const engineOutput = await generateRecommendationsV2(input);
    expect(engineOutput.dateContext.sceneType).toBe(sceneType);
    expect(engineOutput.dateContext.contextSummary).toBe(`${sceneType}:layer:none`);
    expect(() => RecommendationPayloadV2Schema.parse({
      schemaVersion: 2,
      resolvedContext: input.resolvedContext,
      dateContextInput: input.dateContextInput,
      engineOutput,
    })).not.toThrow();
  });

  it.each([
    ["locationless with location", (input: any) => { input.resolvedContext = fallbackContext(); input.resolvedContext.contextMode = "locationless"; }],
    ["locationless temperature", (input: any) => { input.dateContextInput.weatherEvidence.temperatureMinC = 10; input.dateContextInput.weatherEvidence.temperatureMaxC = 20; }],
    ["locationless rain", (input: any) => { input.dateContextInput.weatherEvidence.rainProbability = 10; }],
    ["wrong locationless summary", (input: any) => { input.dateContextInput.weatherEvidence.summary = "fallback"; }],
    ["wrong target date", (input: any) => { input.resolvedContext.targetDate = "2026-07-15"; }],
    ["wrong target timezone", (input: any) => { input.resolvedContext.targetTimezone = "Asia/Tokyo"; }],
    ["wrong locationless rule", (input: any) => { input.ruleVersion = "wardora-rules-1a"; }],
    ["weather fallback stale fields", (input: any) => { input.resolvedContext = fallbackContext(); input.dateContextInput.weatherEvidence.summary = WEATHER_FALLBACK_SUMMARY; input.dateContextInput.weatherEvidence.temperatureMinC = 10; input.dateContextInput.weatherEvidence.temperatureMaxC = 20; }],
  ])("rejects contradictory V2 engine input: %s", (_name, mutate) => {
    const input: any = clone(buildLocationlessInput());
    mutate(input);
    expect(() => RecommendationEngineInputV2Schema.parse(input)).toThrow();
  });

  it("rejects contradictory forecast evidence and timestamps", () => {
    const wrongSource: any = clone(buildForecastInput());
    wrongSource.dateContextInput.weatherEvidence.weatherSource = "layering_default";
    expect(() => RecommendationEngineInputV2Schema.parse(wrongSource)).toThrow();
    const futureEvidence: any = clone(buildForecastInput());
    futureEvidence.dateContextInput.weatherEvidence.weatherUpdatedAt = "2026-07-14T00:31:00.000Z";
    expect(() => RecommendationEngineInputV2Schema.parse(futureEvidence)).toThrow();
  });

  it("cross-checks V2 publish dates, timezone and algorithm version while old records remain readable", async () => {
    const input = buildLocationlessInput();
    const output = await generateRecommendationsV2(input);
    const command: any = {
      userId: input.userId,
      targetDate: input.dateContextInput.date,
      targetTimezone: input.dateContextInput.timezone,
      generationBatchId: "93000000-0000-4000-8000-000000000001",
      generationRequestId: input.requestId,
      readiness: output.readiness.status,
      generationMode: "rule_only",
      payload: { schemaVersion: 2, resolvedContext: input.resolvedContext, engineOutput: output, dateContextInput: input.dateContextInput },
      algorithmVersion: "wardora-recommendation-1d-a-v2",
      ruleVersion: input.ruleVersion,
      pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" },
      generatedAt: CONTEXT_RESOLVED_AT,
      expiresAt: "2026-08-14T00:30:00.000Z",
    };
    expect(PublishDailyRecommendationCommandSchema.parse(command)).toEqual(command);
    for (const mutate of [
      (value: any) => { value.targetDate = "2026-07-15"; },
      (value: any) => { value.targetTimezone = "Asia/Tokyo"; },
      (value: any) => { value.algorithmVersion = "wardora-recommendation-1c"; },
    ]) {
      const invalid = clone(command); mutate(invalid);
      expect(() => PublishDailyRecommendationCommandSchema.parse(invalid)).toThrow();
    }
    expect(() => DailyRecommendationRecordSchema.parse({
      id: "93000000-0000-4000-8000-000000000002", ...command, revision: 1,
      payloadFingerprint: "a".repeat(64), isCurrent: false, lifecycle: "superseded",
      supersededAt: "2026-07-15T00:00:00.000Z", createdAt: CONTEXT_RESOLVED_AT, updatedAt: "2026-07-15T00:00:00.000Z",
    })).not.toThrow();
  });

  it("keeps the exact frozen summaries in fixtures", () => {
    expect(buildLocationlessInput().dateContextInput.weatherEvidence.summary).toBe(LOCATIONLESS_SUMMARY);
    expect(buildFallbackInput().dateContextInput.weatherEvidence.summary).toBe(WEATHER_FALLBACK_SUMMARY);
  });
});
