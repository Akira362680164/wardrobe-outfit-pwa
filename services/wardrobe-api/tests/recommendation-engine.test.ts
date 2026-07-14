import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CandidateEvaluationBatchSchema,
  DateContextSchema,
  RecommendationReadinessReportSchema,
} from "@wardrobe/cloud-contracts";

import {
  BEAM_WIDTH,
  MAX_RAW_CANDIDATES,
  MAX_RULE_SCORED_CANDIDATES,
  SLOT_LIMITS,
  RuleDateContextResolver,
  DeterministicGarmentCanonicalizer,
  RECOMMENDATION_FEATURE_DEFAULTS,
  adaptDateContextResolver,
  adaptGarmentCanonicalizer,
  adaptCandidateEvaluator,
  calculateObjectiveScores,
  canonicalizeOutput,
  createNeutralEvaluation,
  daysSinceBucket,
  generateRecommendations,
  jaccardSimilarity,
  pruneGarmentsBySlot,
} from "../src/recommendations/index.js";
import {
  buildFixtureGarment,
  buildFixtureInput,
  IDS,
  recommendationScenarioFixtures,
  USER,
} from "./fixtures/recommendations/scenarios.js";

function reversed<T>(values: readonly T[]): T[] {
  return [...values].reverse();
}

describe("recommendation fixture baseline", () => {
  it("contains at least 24 hand-reviewed structured scenarios", () => {
    expect(recommendationScenarioFixtures.length).toBeGreaterThanOrEqual(24);
    expect(new Set(recommendationScenarioFixtures.map((item) => item.id)).size).toBe(recommendationScenarioFixtures.length);
    for (const fixture of recommendationScenarioFixtures) {
      expect(fixture.expected.status).toMatch(/^(ready|limited|not_ready)$/);
      expect(fixture.expected.recommendationCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(fixture.expected.mustInclude)).toBe(true);
      expect(Array.isArray(fixture.expected.mustExclude)).toBe(true);
    }
  });

  it.each(recommendationScenarioFixtures)("matches $id expectations", async (fixture) => {
    const output = await generateRecommendations(fixture.input);
    const selectedIds = new Set(output.recommendations.flatMap((candidate) => candidate.garmentIds));
    const selectedKeys = new Set(output.recommendations.map((candidate) => [...candidate.garmentIds].sort().join("|")));

    expect(output.readiness.status).toBe(fixture.expected.status);
    expect(output.recommendations).toHaveLength(fixture.expected.recommendationCount);
    for (const id of fixture.expected.mustInclude) expect(selectedIds.has(id), `must include ${id}`).toBe(true);
    for (const id of fixture.expected.mustExclude) expect(selectedIds.has(id), `must exclude ${id}`).toBe(false);
    if (fixture.expected.mustExcludeCandidate) {
      expect(selectedKeys.has([...fixture.expected.mustExcludeCandidate].sort().join("|"))).toBe(false);
    }
    for (const code of fixture.expected.reasonCodes ?? []) {
      expect(output.recommendations.some((candidate) => candidate.reasonCodes.includes(code))).toBe(true);
    }
    for (const [garmentId, codes] of Object.entries(fixture.expected.expectedExclusions ?? {})) {
      const exclusion = output.exclusions.find((entry) => entry.garmentId === garmentId);
      expect(exclusion?.codes, `exact exclusion codes for ${garmentId}`).toEqual(codes);
    }
    for (const code of fixture.expected.missingSlotCodes ?? []) {
      expect(output.readiness.missingSlotCodes).toContain(code);
    }
    if (fixture.expected.scoreBounds) {
      const candidate = output.recommendations.find((item) => item.objective === fixture.expected.scoreBounds!.objective);
      expect(candidate).toBeDefined();
      expect(candidate!.finalScore).toBeGreaterThanOrEqual(fixture.expected.scoreBounds.min);
      expect(candidate!.finalScore).toBeLessThanOrEqual(fixture.expected.scoreBounds.max);
    }
  });
});

describe("deterministic invariants", () => {
  it("returns byte-equivalent canonical output across 100 runs", async () => {
    const fixture = recommendationScenarioFixtures[0]!;
    const expected = canonicalizeOutput(await generateRecommendations(fixture.input));
    for (let run = 0; run < 100; run += 1) {
      expect(canonicalizeOutput(await generateRecommendations(fixture.input))).toBe(expected);
    }
  });

  it("forbids ambient time, host timezone and randomness in the pure engine", () => {
    const source = ["engine.ts", "scoring.ts"].map((file) => readFileSync(new URL(`../src/recommendations/${file}`, import.meta.url), "utf8")).join("\n");
    expect(source).not.toMatch(/Date\.now|Math\.random|new\s+Date\s*\(/);
    expect(source).not.toMatch(/process\.env\.TZ|Intl\.DateTimeFormat/);
  });

  it("is invariant to garments, outfits, history, feedback and anchor input order", async () => {
    const source = buildFixtureInput({
      savedOutfits: [
        { id: "40000000-0000-4000-8000-000000000001", userId: USER, garmentIds: [IDS.shirt, IDS.pants, IDS.loafers], successfulWearCount: 2 },
        { id: "40000000-0000-4000-8000-000000000002", userId: USER, garmentIds: [IDS.tee, IDS.shorts, IDS.sneakers], successfulWearCount: 1 },
      ],
      wearHistory: [
        { garmentIds: [IDS.tee, IDS.shorts, IDS.sneakers], wornDate: "2026-06-01", sceneType: "casual" },
        { garmentIds: [IDS.shirt, IDS.pants, IDS.loafers], wornDate: "2026-05-01", sceneType: "commute" },
      ],
      feedback: [
        { garmentIds: [IDS.tee], sceneType: "casual", sentiment: "positive" },
        { garmentIds: [IDS.heels], sceneType: "commute", sentiment: "moderate_negative" },
      ],
      anchorGarmentIds: [IDS.dress, IDS.shirt],
    });
    const shuffled = {
      ...source,
      garments: reversed(source.garments),
      savedOutfits: reversed(source.savedOutfits),
      wearHistory: reversed(source.wearHistory),
      feedback: reversed(source.feedback),
      anchorGarmentIds: reversed(source.anchorGarmentIds),
    };
    expect(canonicalizeOutput(await generateRecommendations(shuffled))).toBe(canonicalizeOutput(await generateRecommendations(source)));
  });

  it("only emits eligible current-user UUIDs, unique garments/candidates and legal templates", async () => {
    for (const fixture of recommendationScenarioFixtures) {
      const output = await generateRecommendations(fixture.input);
      const eligible = new Set(fixture.input.garments.filter((item) => item.userId === fixture.input.userId).map((item) => item.id));
      const candidateIds = output.shortlist.map((candidate) => candidate.candidateId);
      expect(new Set(candidateIds).size).toBe(candidateIds.length);
      for (const candidate of output.shortlist) {
        expect(candidate.candidateId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(new Set(candidate.garmentIds).size).toBe(candidate.garmentIds.length);
        for (const id of candidate.garmentIds) {
          expect(id).toMatch(/^[0-9a-f-]{36}$/);
          expect(eligible.has(id)).toBe(true);
        }
        expect(candidate.template).toMatch(/^T[1-8]$/);
      }
    }
  });
});

describe("frozen scoring boundaries", () => {
  it("freezes exact day buckets at 0-2, 3-6, 7-13, 14-30 and >30", () => {
    expect(daysSinceBucket(0)).toEqual({ rotationValue: 0, repeatPenalty: 15 });
    expect(daysSinceBucket(2)).toEqual({ rotationValue: 0, repeatPenalty: 15 });
    expect(daysSinceBucket(3)).toEqual({ rotationValue: 25, repeatPenalty: 8 });
    expect(daysSinceBucket(6)).toEqual({ rotationValue: 25, repeatPenalty: 8 });
    expect(daysSinceBucket(7)).toEqual({ rotationValue: 50, repeatPenalty: 0 });
    expect(daysSinceBucket(13)).toEqual({ rotationValue: 50, repeatPenalty: 0 });
    expect(daysSinceBucket(14)).toEqual({ rotationValue: 70, repeatPenalty: 0 });
    expect(daysSinceBucket(30)).toEqual({ rotationValue: 70, repeatPenalty: 0 });
    expect(daysSinceBucket(31)).toEqual({ rotationValue: 90, repeatPenalty: 0 });
    expect(daysSinceBucket(undefined)).toEqual({ rotationValue: 100, repeatPenalty: 0 });
  });

  it("freezes temperature 8C and formality difference 3 hard-filter edges through fixtures", async () => {
    const base = buildFixtureInput();
    const exactEight = buildFixtureGarment("50000000-0000-4000-8000-000000000001", "tops", { temperatureMinC: 35, temperatureMaxC: 40, formality: 3 });
    const beyondEight = buildFixtureGarment("50000000-0000-4000-8000-000000000002", "tops", { temperatureMinC: 36, temperatureMaxC: 40, formality: 3 });
    const output = await generateRecommendations({ ...base, garments: [...base.garments, exactEight, beyondEight] });
    expect(output.exclusions.find((entry) => entry.garmentId === exactEight.id)).toBeUndefined();
    expect(output.exclusions.find((entry) => entry.garmentId === beyondEight.id)?.codes).toContain("temperature_mismatch");
    const formalityTwo = buildFixtureGarment("50000000-0000-4000-8000-000000000003", "tops", { formality: 2, temperatureMinC: 18, temperatureMaxC: 27 });
    const formalityThree = buildFixtureGarment("50000000-0000-4000-8000-000000000004", "tops", { formality: 1, temperatureMinC: 18, temperatureMaxC: 27 });
    const formalInput = buildFixtureInput({ dateContextInput: { ...base.dateContextInput, travelPlan: { name: "Business", destination: "Shanghai", activities: ["business meeting"] } } });
    const formalOutput = await generateRecommendations({ ...formalInput, garments: [...formalInput.garments, formalityTwo, formalityThree] });
    expect(formalOutput.exclusions.find((entry) => entry.garmentId === formalityTwo.id)).toBeUndefined();
    expect(formalOutput.exclusions.find((entry) => entry.garmentId === formalityThree.id)?.codes).toContain("formality_mismatch");
  });

  it("freezes Jaccard 0.50 and 0.67 boundaries", () => {
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "d"])).toBe(0.5);
    expect(jaccardSimilarity(["a", "b", "c", "d", "e"], ["a", "b", "c", "d", "f"])).toBeCloseTo(2 / 3, 12);
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });
});

describe("caps, shortlist and score auditability", () => {
  it("enforces slot limits, beam width and raw/rule-scored caps", async () => {
    expect(BEAM_WIDTH).toBe(48);
    expect(MAX_RAW_CANDIDATES).toBe(120);
    expect(MAX_RULE_SCORED_CANDIDATES).toBe(60);
    const base = buildFixtureInput();
    const many = Array.from({ length: 30 }, (_, index) =>
      buildFixtureGarment(`60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, "tops", { subcategory: "shirt", formality: 3 }),
    );
    const pruned = pruneGarmentsBySlot([...base.garments, ...many], await new RuleDateContextResolver().resolve(base.dateContextInput), base);
    for (const [slot, limit] of Object.entries(SLOT_LIMITS)) expect(pruned[slot as keyof typeof SLOT_LIMITS]?.length ?? 0).toBeLessThanOrEqual(limit);
    const output = await generateRecommendations({ ...base, garments: [...base.garments, ...many] });
    expect(output.metrics.maxBeamObserved).toBeLessThanOrEqual(BEAM_WIDTH);
    expect(output.metrics.rawCandidateCount).toBeLessThanOrEqual(MAX_RAW_CANDIDATES);
    expect(output.metrics.ruleScoredCandidateCount).toBeLessThanOrEqual(MAX_RULE_SCORED_CANDIDATES);
    expect(output.shortlist.length).toBeGreaterThanOrEqual(12);
    expect(output.shortlist.length).toBeLessThanOrEqual(18);
  });

  it("keeps all objective components finite, clamped and algebraically reversible", () => {
    const scores = calculateObjectiveScores({
      ruleScore: 80,
      pawSemanticFit: 60,
      savedOrHistoricalSuccess: 40,
      informationCompleteness: 100,
      longUnwornValue: 70,
      newCombinationValue: 90,
      styleVariation: 30,
      weatherAndActivityFit: 75,
      historicalThermalAndDiscomfortFit: 65,
      pawSceneRiskAvoidance: 50,
      shoeAndOuterwearRationality: 85,
    });
    expect(scores.safe).toBe(70);
    expect(scores.fresh).toBe(72.5);
    expect(scores.comfort).toBe(69);
    for (const value of Object.values(scores)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe("PAW adapter fallback", () => {
  const input = {
    requestId: "70000000-0000-4000-8000-000000000001",
    dateContext: DateContextSchema.parse({
      sceneType: "commute",
      formalityTarget: 3,
      activityIntensity: 2,
      thermalStrategy: "balanced",
      rainStrategy: "none",
      requiredSlots: ["tops", "pants", "shoes"],
      optionalSlots: ["outerwear", "bag"],
      avoidRules: [],
      confidence: "high",
      contextSummary: "commute",
    }),
    weatherEvidence: buildFixtureInput().dateContextInput.weatherEvidence,
    candidates: [
      { candidateId: "71000000-0000-4000-8000-000000000001", source: "generated" as const, items: [], ruleScores: {} },
      { candidateId: "71000000-0000-4000-8000-000000000002", source: "generated" as const, items: [], ruleScores: {} },
    ],
  };

  it.each([
    ["disabled", undefined],
    ["timeout", async () => { throw new Error("timeout"); }],
    ["invalid json", async () => ({ nope: true })],
    ["invalid enum", async () => ({ results: input.candidates.map((candidate) => ({ ...createNeutralEvaluation(candidate.candidateId), fallbackUsed: false, sceneRisks: ["invented"] })) })],
    ["invalid score", async () => ({ results: input.candidates.map((candidate) => ({ ...createNeutralEvaluation(candidate.candidateId), fallbackUsed: false, semanticFit: 101 })) })],
    ["unknown candidate", async () => ({ results: [{ ...createNeutralEvaluation("71000000-0000-4000-8000-000000000099"), fallbackUsed: false }] })],
    ["missing candidate", async () => ({ results: [{ ...createNeutralEvaluation(input.candidates[0]!.candidateId), fallbackUsed: false }] })],
    ["duplicate candidate", async () => ({ results: input.candidates.map(() => ({ ...createNeutralEvaluation(input.candidates[0]!.candidateId), fallbackUsed: false })) })],
  ])("uses whole-batch neutral fallback for %s", async (_case, evaluator) => {
    const result = await adaptCandidateEvaluator(input, evaluator as never);
    expect(result).toEqual(input.candidates.map((candidate) => createNeutralEvaluation(candidate.candidateId)));
    expect(CandidateEvaluationBatchSchema.safeParse({ results: result }).success).toBe(true);
  });

  it("falls back the whole batch on a real hard timeout", async () => {
    const never = async () => new Promise<unknown>(() => undefined);
    const result = await adaptCandidateEvaluator(input, never, 5);
    expect(result).toEqual(input.candidates.map((candidate) => createNeutralEvaluation(candidate.candidateId)));
  });

  it("splits an enabled shortlist into sequential batches of at most four", async () => {
    const batchSizes: number[] = [];
    let concurrent = 0;
    let maximumConcurrent = 0;
    const evaluator = async (raw: unknown) => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      const batch = raw as { candidates: Array<{ candidateId: string }> };
      batchSizes.push(batch.candidates.length);
      const results = batch.candidates.map((candidate) => ({ ...createNeutralEvaluation(candidate.candidateId), fallbackUsed: false, reasonCodes: [] }));
      concurrent -= 1;
      return { results };
    };
    const output = await generateRecommendations(buildFixtureInput({ pawCandidateEvaluatorEnabled: true }), evaluator);
    expect(batchSizes.length).toBeGreaterThanOrEqual(3);
    expect(batchSizes.length).toBeLessThanOrEqual(5);
    expect(batchSizes.every((size) => size >= 1 && size <= 4)).toBe(true);
    expect(maximumConcurrent).toBe(1);
    expect(output.recommendations).toHaveLength(3);
    expect(output.shortlist.every((candidate) => !candidate.pawEvaluation.fallbackUsed)).toBe(true);
  });
});

describe("DateContext and canonicalizer port boundaries", () => {
  it("keeps all production recommendation and PAW flags disabled by default", () => {
    expect(RECOMMENDATION_FEATURE_DEFAULTS).toEqual({
      DAILY_RECOMMENDATIONS_ENABLED: false,
      RECOMMENDATION_V2_SHADOW_ENABLED: false,
      RECOMMENDATION_V2_CURRENT_ENABLED: false,
      RECOMMENDATION_V2_WORKER_ENABLED: false,
      PAW_DATE_CONTEXT_ENABLED: false,
      PAW_CANDIDATE_EVALUATOR_ENABLED: false,
      PAW_INTAKE_CANONICALIZER_ENABLED: false,
    });
  });

  it("discards the whole PAW DateContext on strict-object or enum failure", async () => {
    const input = buildFixtureInput().dateContextInput;
    const rules = new RuleDateContextResolver();
    const expected = await rules.resolve(input);
    const invalid = { resolve: async () => ({ ...expected, sceneType: "invented", extra: true }) as never };
    expect(await adaptDateContextResolver(input, rules, invalid)).toEqual(expected);
  });

  it("discards the whole PAW canonicalizer result and marks deterministic output for review", async () => {
    const input = {
      requestId: "72000000-0000-4000-8000-000000000001",
      locale: "zh-CN" as const,
      domainCatalogVersion: "1",
      parsedObservation: { name: "White shirt", category: "tops", subcategory: "shirt", colors: "白", styles: "commute", seasons: "all", formality: 4, warmth: 2 },
      parseWarnings: [],
    };
    const deterministic = new DeterministicGarmentCanonicalizer();
    const paw = { canonicalize: async () => ({ ...(await deterministic.canonicalize(input)), category: "invented", needsReview: false }) as never };
    const result = await adaptGarmentCanonicalizer(input, deterministic, paw);
    expect(result.category).toBe("tops");
    expect(result.needsReview).toBe(true);
    expect(result.reviewReasonCodes).toContain("low_confidence");
  });
});

describe("readiness and stable performance guard", () => {
  it("returns honest 1-2 candidates and never restores ineligible garments", async () => {
    const limited = recommendationScenarioFixtures.find((item) => item.id === "limited_two_candidates")!;
    const output = await generateRecommendations(limited.input);
    expect(output.readiness.status).toBe("limited");
    expect(output.recommendations).toHaveLength(2);
    expect(RecommendationReadinessReportSchema.safeParse(output.readiness).success).toBe(true);
  });

  it("reports a fixed large-wardrobe benchmark while using count caps as the CI gate", async () => {
    const base = buildFixtureInput();
    const categories = ["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "accessories"] as const;
    const large = Array.from({ length: 800 }, (_, index) =>
      buildFixtureGarment(`80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, categories[index % categories.length]!, { formality: 2 + (index % 2), colors: index % 3 === 0 ? ["黑"] : ["白"] }),
    );
    const started = performance.now();
    const output = await generateRecommendations({ ...base, garments: large });
    const elapsedMs = Number((performance.now() - started).toFixed(2));
    expect(output.metrics.rawCandidateCount).toBeLessThanOrEqual(MAX_RAW_CANDIDATES);
    expect(output.metrics.ruleScoredCandidateCount).toBeLessThanOrEqual(MAX_RULE_SCORED_CANDIDATES);
    expect(output.metrics.maxBeamObserved).toBeLessThanOrEqual(BEAM_WIDTH);
    console.info(`recommendation-large-fixture benchmark: ${elapsedMs}ms for ${large.length} garments`);
  });
});
