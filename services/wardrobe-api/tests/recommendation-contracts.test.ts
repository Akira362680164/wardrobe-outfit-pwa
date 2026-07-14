import { beforeAll, describe, expect, it } from "vitest";
import {
  DailyRecommendationRecordSchema,
  PublishDailyRecommendationCommandSchema,
  RecommendationEngineInputSchema,
  RecommendationEngineOutputSchema,
  type PublishDailyRecommendationCommand,
  type RecommendationEngineOutput,
} from "@wardrobe/cloud-contracts";

import { generateRecommendations } from "../src/recommendations/index.js";
import { buildFixtureInput } from "./fixtures/recommendations/scenarios.js";

const clone = <T>(value: T): T => structuredClone(value);
let output: RecommendationEngineOutput;
let command: PublishDailyRecommendationCommand;

beforeAll(async () => {
  const input = buildFixtureInput();
  output = await generateRecommendations(input);
  command = PublishDailyRecommendationCommandSchema.parse({
    userId: input.userId,
    targetDate: input.dateContextInput.date,
    targetTimezone: input.dateContextInput.timezone,
    generationBatchId: "50000000-0000-4000-8000-000000000001",
    generationRequestId: input.requestId,
    readiness: output.readiness.status,
    generationMode: "rule_only",
    payload: { engineOutput: output, dateContextInput: input.dateContextInput },
    algorithmVersion: "wardora-recommendation-1b.1",
    ruleVersion: output.ruleVersion,
    pawProgramVersions: { dateContext: "disabled", candidateEvaluator: "disabled" },
    generatedAt: "2026-07-13T23:30:00.000Z",
    expiresAt: "2026-08-13T23:30:00.000Z",
  });
});

describe("strict recommendation contracts", () => {
  it("accepts the controlled engine output, publish command, and persisted record", () => {
    expect(RecommendationEngineOutputSchema.parse(output)).toEqual(output);
    expect(PublishDailyRecommendationCommandSchema.parse(command)).toEqual(command);
    expect(() => DailyRecommendationRecordSchema.parse({
      id: "60000000-0000-4000-8000-000000000001", ...command, revision: 1,
      payloadFingerprint: "a".repeat(64), isCurrent: true, lifecycle: "current", supersededAt: null,
      createdAt: command.generatedAt, updatedAt: command.generatedAt,
    })).not.toThrow();
  });

  it.each([
    ["unknown root field", (value: any) => { value.unknown = true; }],
    ["invalid UUID", (value: any) => { value.userId = "not-a-uuid"; }],
    ["invalid real date", (value: any) => { value.targetDate = "2026-02-30"; }],
    ["invalid timezone", (value: any) => { value.targetTimezone = "Mars/Olympus"; value.payload.dateContextInput.timezone = "Mars/Olympus"; }],
    ["invalid readiness enum", (value: any) => { value.readiness = "fallback"; }],
    ["free itemIds", (value: any) => { value.payload.engineOutput.recommendations[0].itemIds = [1]; }],
    ["free pawScores", (value: any) => { value.payload.engineOutput.shortlist[0].pawScores = { arbitrary: 90 }; }],
    ["out of range score", (value: any) => { value.payload.engineOutput.shortlist[0].ruleScores.ruleTotal = 101; }],
  ])("rejects %s", (_title, mutate) => {
    const invalid: any = clone(command);
    mutate(invalid);
    expect(() => PublishDailyRecommendationCommandSchema.parse(invalid)).toThrow();
  });

  it("rejects invalid engine dates and unknown engine input fields before generation", () => {
    const invalidDate: any = clone(buildFixtureInput());
    invalidDate.dateContextInput.date = "2026-02-30";
    expect(() => RecommendationEngineInputSchema.parse(invalidDate)).toThrow();
    const unknown: any = clone(buildFixtureInput());
    unknown.itemIds = [1, 2];
    expect(() => RecommendationEngineInputSchema.parse(unknown)).toThrow();
  });

  it("requires unique candidate, objective, garment, and exclusion identities", () => {
    const duplicateCandidate: any = clone(output);
    duplicateCandidate.shortlist.push(clone(duplicateCandidate.shortlist[0]));
    expect(() => RecommendationEngineOutputSchema.parse(duplicateCandidate)).toThrow();

    const duplicateObjective: any = clone(output);
    duplicateObjective.recommendations[1].objective = duplicateObjective.recommendations[0].objective;
    duplicateObjective.recommendations[1].finalScore = duplicateObjective.recommendations[1].objectiveScores[duplicateObjective.recommendations[1].objective];
    expect(() => RecommendationEngineOutputSchema.parse(duplicateObjective)).toThrow();

    const duplicateGarment: any = clone(output);
    duplicateGarment.shortlist[0].garmentIds.push(duplicateGarment.shortlist[0].garmentIds[0]);
    expect(() => RecommendationEngineOutputSchema.parse(duplicateGarment)).toThrow();

    const withExclusion: any = clone(output);
    withExclusion.exclusions = [{ garmentId: "20000000-0000-4000-8000-000000000099", codes: ["deleted"] }, { garmentId: "20000000-0000-4000-8000-000000000099", codes: ["deleted"] }];
    expect(() => RecommendationEngineOutputSchema.parse(withExclusion)).toThrow();
  });

  it("requires every display candidate to exist in shortlist with identical controlled audit fields", () => {
    const missing: any = clone(output);
    missing.recommendations[0].candidateId = "70000000-0000-4000-8000-000000000001";
    missing.recommendations[0].pawEvaluation.candidateId = missing.recommendations[0].candidateId;
    expect(() => RecommendationEngineOutputSchema.parse(missing)).toThrow();

    const mismatch: any = clone(output);
    mismatch.recommendations[0].garmentIds = [...mismatch.recommendations[0].garmentIds].reverse();
    expect(() => RecommendationEngineOutputSchema.parse(mismatch)).toThrow();
  });
});
