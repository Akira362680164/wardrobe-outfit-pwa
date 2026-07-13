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
} from "@wardrobe/cloud-contracts";

export type RecommendationGarmentStatus = "active" | "laundry" | "repair" | "archived";

export interface RecommendationGarment {
  id: string;
  userId: string;
  deleted: boolean;
  status: RecommendationGarmentStatus;
  hasPrimaryImage: boolean;
  category?: "tops" | "pants" | "skirts" | "one_piece" | "shoes" | "bags" | "hats" | "jewelry" | "accessories";
  subcategory?: string;
  colors: string[];
  seasons: string[];
  styles: string[];
  formality?: number;
  warmth?: number;
  material?: string;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  recommendationBlocked?: boolean;
}

export interface RecommendationSavedOutfit {
  id: string;
  userId: string;
  garmentIds: string[];
  successfulWearCount: number;
}

export interface RecommendationWearHistory {
  garmentIds: string[];
  wornDate: string;
  sceneType: string;
}

export interface RecommendationFeedback {
  garmentIds: string[];
  sceneType: string;
  sentiment: "positive" | "moderate_negative" | "severe_negative";
}

export interface RecommendationEngineInput {
  requestId: string;
  userId: string;
  ruleVersion: string;
  asOfDate: string;
  dateContextInput: DateContextInput;
  garments: RecommendationGarment[];
  savedOutfits: RecommendationSavedOutfit[];
  wearHistory: RecommendationWearHistory[];
  feedback: RecommendationFeedback[];
  anchorGarmentIds: string[];
  pawCandidateEvaluatorEnabled: boolean;
}

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

export interface RecommendationCandidate {
  candidateId: string;
  garmentIds: string[];
  source: CandidateSource;
  sourceOutfitId?: string;
  template: `T${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
  ruleScores: CandidateRuleScores;
  combinationNovelty: number;
  longUnwornValue: number;
  savedOrHistoricalSuccess: number;
  styleVariation: number;
  historicalThermalAndDiscomfortFit: number;
  shoeAndOuterwearRationality: number;
  pawEvaluation: CandidateEvaluation;
  objectiveScores: { safe: number; fresh: number; comfort: number };
  reasonCodes: RecommendationReasonCode[];
  riskCodes: SceneRiskCode[];
  missingSlotCodes: GarmentSlot[];
}

export interface DisplayRecommendation extends RecommendationCandidate {
  objective: "safe" | "fresh" | "comfort";
  finalScore: number;
}

export interface RecommendationEngineOutput {
  ruleVersion: string;
  dateContext: DateContext;
  recommendations: DisplayRecommendation[];
  shortlist: RecommendationCandidate[];
  readiness: RecommendationReadinessReport;
  exclusions: Array<{ garmentId: string; codes: RecommendationExclusionCode[] }>;
  metrics: {
    eligibleGarmentCount: number;
    rawCandidateCount: number;
    ruleScoredCandidateCount: number;
    maxBeamObserved: number;
  };
}

export interface RecommendationFixtureExpectation {
  status: "ready" | "limited" | "not_ready";
  recommendationCount: number;
  mustInclude: string[];
  mustExclude: string[];
  mustExcludeCandidate?: string[];
  reasonCodes?: RecommendationReasonCode[];
  exclusionCodes?: RecommendationExclusionCode[];
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
