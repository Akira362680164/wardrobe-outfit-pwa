import { describe, expect, it } from "vitest";
import {
  RecommendationPayloadSchema,
  RecommendationPayloadV1Schema,
  RecommendationPayloadV2Schema,
  RecommendationPayloadV3Schema,
} from "@wardrobe/cloud-contracts";
import {
  calculateObjectiveScoresV3,
  canonicalizeOutput,
  daysSinceBucketV3,
  generateRecommendations,
  generateRecommendationsV2,
  generateRecommendationsV3,
} from "../src/recommendations/index.js";
import { buildFixtureInput } from "./fixtures/recommendations/scenarios.js";
import {
  objectiveVectors,
  rotationVectors,
  V3_ALGORITHM_VERSION,
  V3_RULE_VERSION,
  v3ContextFixtures,
} from "./fixtures/recommendations/v3-scenarios.js";

describe("recommendation realtime V3 hand-written fixtures", () => {
  it.each(rotationVectors)("matches rotation boundary $days", ({ days, expected }) => {
    expect(daysSinceBucketV3(days)).toEqual(expected);
  });

  it.each(objectiveVectors)("matches normalized objective weights $id", ({ input, expected }) => {
    expect(calculateObjectiveScoresV3(input)).toEqual(expected);
  });

  it.each(v3ContextFixtures)("writes strict rule-only V3 for $id", async ({ input, expectedMode }) => {
    const output = await generateRecommendationsV3(input);
    const payload = {
      schemaVersion: 3,
      resolvedContext: input.resolvedContext,
      dateContextInput: input.dateContextInput,
      engineOutput: output,
    };
    expect(input.resolvedContext.contextMode).toBe(expectedMode);
    expect(output.algorithmVersion).toBe(V3_ALGORITHM_VERSION);
    expect(output.ruleVersion).toBe(V3_RULE_VERSION);
    for (const candidate of [...output.shortlist, ...output.recommendations]) {
      expect(candidate).not.toHaveProperty("pawEvaluation");
      expect(candidate).not.toHaveProperty("longUnwornValue");
      expect(candidate).toHaveProperty("rotationValue");
      expect(candidate).toHaveProperty("deterministicRiskAssessment");
    }
    expect(RecommendationPayloadV3Schema.parse(payload)).toEqual(payload);
    expect(RecommendationPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("keeps V1 and V2 read compatibility while V3 is additive", async () => {
    const v1Input = buildFixtureInput();
    const v1Payload = { engineOutput: await generateRecommendations(v1Input), dateContextInput: v1Input.dateContextInput };
    const v2Input = v3ContextFixtures[1].input;
    const v2Payload = { schemaVersion: 2, resolvedContext: v2Input.resolvedContext, dateContextInput: v2Input.dateContextInput, engineOutput: await generateRecommendationsV2(v2Input) };
    expect(RecommendationPayloadSchema.parse(v1Payload)).toEqual(RecommendationPayloadV1Schema.parse(v1Payload));
    expect(RecommendationPayloadSchema.parse(v2Payload)).toEqual(RecommendationPayloadV2Schema.parse(v2Payload));
  });

  it("is byte stable for 100 runs and invariant to input array order", async () => {
    const input = v3ContextFixtures[1].input;
    const expected = canonicalizeOutput(await generateRecommendationsV3(input));
    for (let run = 0; run < 100; run += 1) expect(canonicalizeOutput(await generateRecommendationsV3(input))).toBe(expected);
    const reversed = {
      ...input,
      garments: [...input.garments].reverse(),
      savedOutfits: [...input.savedOutfits].reverse(),
      wearHistory: [...input.wearHistory].reverse(),
      feedback: [...input.feedback].reverse(),
      anchorGarmentIds: [...input.anchorGarmentIds].reverse(),
    };
    expect(await generateRecommendationsV3(reversed)).toEqual(await generateRecommendationsV3(input));
  });
});
