import type {
  CandidateEvaluation,
  CandidateRuleScores,
  CandidateSource,
  DateContext,
  DateContextInput,
  GarmentSlot,
  RecommendationExclusionCode,
  RecommendationReadinessReport,
  RecommendationReasonCode,
  SceneRiskCode,
  RecommendationGarment,
  RecommendationSavedOutfit,
  RecommendationWearHistory,
  RecommendationFeedback,
  RecommendationEngineInput,
  RecommendationAuditCandidate,
  DisplayRecommendation,
  RecommendationEngineOutput,
} from "@wardrobe/cloud-contracts";

export type { RecommendationGarment, RecommendationSavedOutfit, RecommendationWearHistory, RecommendationFeedback, RecommendationEngineInput, DisplayRecommendation, RecommendationEngineOutput };

export interface ScoredGarment extends RecommendationGarment {
  role: GarmentSlot;
  preScore: number;
  scoreAudit: {
    weatherFit: number;
    sceneFit: number;
    formalityFit: number;
    activityComfort: number;
    rotationValue: number;
    historicalPreference: number;
    informationCompleteness: number;
    repeatPenalty: number;
    negativeFeedbackPenalty: number;
  };
}

export type RecommendationCandidate = RecommendationAuditCandidate;

export interface RecommendationFixtureExpectation {
  status: "ready" | "limited" | "not_ready";
  recommendationCount: number;
  mustInclude: string[];
  mustExclude: string[];
  mustExcludeCandidate?: string[];
  reasonCodes?: RecommendationReasonCode[];
  expectedExclusions?: Record<string, RecommendationExclusionCode[]>;
  missingSlotCodes?: GarmentSlot[];
  scoreBounds?: { objective: "safe" | "fresh" | "comfort"; min: number; max: number };
}

export interface RecommendationScenarioFixture {
  id: string;
  title: string;
  input: RecommendationEngineInput;
  expected: RecommendationFixtureExpectation;
}

export interface ObjectiveScoreInput {
  ruleScore: number;
  pawSemanticFit: number;
  savedOrHistoricalSuccess: number;
  informationCompleteness: number;
  longUnwornValue: number;
  newCombinationValue: number;
  styleVariation: number;
  weatherAndActivityFit: number;
  historicalThermalAndDiscomfortFit: number;
  pawSceneRiskAvoidance: number;
  shoeAndOuterwearRationality: number;
}

export interface ObjectiveScoreInputV3 {
  ruleScore: number;
  savedOrHistoricalSuccess: number;
  informationCompleteness: number;
  rotationValue: number;
  combinationNovelty: number;
  styleVariation: number;
  weatherAndActivityFit: number;
  historicalThermalAndDiscomfortFit: number;
  shoeAndOuterwearRationality: number;
}
