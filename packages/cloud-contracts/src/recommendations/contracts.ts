import { z } from "zod";
import {
  GARMENT_CATEGORY_IDS,
  SEASON_VALUES,
  STYLE_VALUES,
  getSubcategoryById,
  isSystemColor,
} from "@wardrobe/domain-catalog";

export const SceneTypeSchema = z.enum(["business", "commute", "travel", "casual", "daily", "date", "formal"]);
export const GarmentSlotSchema = z.enum(["tops", "pants", "skirts", "one_piece", "outerwear", "shoes", "bag", "hat", "accessory"]);
export const ThermalStrategySchema = z.enum(["cooling", "light", "balanced", "layer", "warm"]);
export const RainStrategySchema = z.enum(["none", "umbrella", "quick_dry", "waterproof_shoes", "full_rain_protection"]);
export const AvoidRuleSchema = z.enum(["avoid_suede", "avoid_heavy_outerwear", "avoid_light_colors", "avoid_high_heels", "avoid_non_breathable", "avoid_open_toe_shoes"]);
export const SceneRiskCodeSchema = z.enum(["too_cold", "too_hot", "rain_exposure", "wind_exposure", "shoe_discomfort", "formality_mismatch", "activity_mismatch", "missing_required_layer", "style_conflict"]);
export const RecommendationReasonCodeSchema = z.enum(["good_for_commute", "good_for_business", "good_for_travel", "weather_fit", "rain_ready", "activity_comfort", "historical_success", "rotation_value", "new_combination", "shoe_rationality", "outerwear_rationality", "needs_evening_layer", "rule_fallback"]);
export const CanonicalizerReviewReasonSchema = z.enum(["missing_required_field", "unknown_category", "unknown_subcategory", "unknown_color", "conflicting_season", "invalid_temperature_range", "low_confidence"]);
export const RecommendationMissingFieldCodeSchema = z.enum(["primary_image", "category", "color", "season_or_thermal", "formality"]);
export const RecommendationExclusionCodeSchema = z.enum(["not_current_user", "deleted", "unavailable_status", "missing_primary_image", "missing_required_field", "invalid_formality", "temperature_mismatch", "formality_mismatch", "avoid_rule", "recommendation_blocked"]);
export const Score0To100Schema = z.number().finite().min(0).max(100);

export const WeatherEvidenceSchema = z.object({
  weatherSource: z.enum(["forecast", "historical_climate", "seasonal_inference", "plan_semantic_inference", "layering_default"]),
  weatherConfidence: z.number().finite().min(0).max(1),
  weatherUpdatedAt: z.string().datetime(),
  temperatureMinC: z.number().finite().min(-60).max(60).optional(),
  temperatureMaxC: z.number().finite().min(-60).max(60).optional(),
  feelsLikeMinC: z.number().finite().min(-80).max(80).optional(),
  feelsLikeMaxC: z.number().finite().min(-80).max(80).optional(),
  rainProbability: z.number().finite().min(0).max(100).optional(),
  windLevel: z.number().int().min(0).max(12).optional(),
  summary: z.string().trim().min(1).max(120),
}).strict().superRefine((value, ctx) => {
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "temperatureMinC must be <= temperatureMaxC" });
  }
});

export const DateContextInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekday: z.number().int().min(1).max(7),
  dayType: z.enum(["workday", "rest_day"]),
  timezone: z.string().trim().min(1).max(64),
  weatherEvidence: WeatherEvidenceSchema,
  travelPlan: z.object({ name: z.string().trim().min(1).max(80), destination: z.string().trim().min(1).max(120), activities: z.array(z.string().trim().min(1).max(40)).max(12), notes: z.string().trim().max(300).optional() }).strict().optional(),
  userProfile: z.object({ workdayScene: SceneTypeSchema.optional(), restDayScene: SceneTypeSchema.optional(), thermalBias: z.enum(["cold_sensitive", "normal", "heat_sensitive"]).optional(), stylePreferences: z.array(z.string().trim().min(1).max(40)).max(12) }).strict(),
}).strict();

export const DateContextSchema = z.object({
  sceneType: SceneTypeSchema,
  formalityTarget: z.number().int().min(1).max(5),
  activityIntensity: z.number().int().min(1).max(5),
  thermalStrategy: ThermalStrategySchema,
  rainStrategy: RainStrategySchema,
  requiredSlots: z.array(GarmentSlotSchema).min(1).max(9),
  optionalSlots: z.array(GarmentSlotSchema).max(9),
  avoidRules: z.array(AvoidRuleSchema).max(12),
  confidence: z.enum(["low", "medium", "high"]),
  contextSummary: z.string().trim().min(1).max(60),
}).strict();

export const CandidateSourceSchema = z.enum(["saved_outfit", "adapted_outfit", "generated", "anchor_generated"]);
export const CandidateRuleScoresSchema = z.object({
  weatherFit: Score0To100Schema,
  sceneFit: Score0To100Schema,
  structure: Score0To100Schema,
  colorHarmony: Score0To100Schema,
  styleCoherence: Score0To100Schema,
  activityComfort: Score0To100Schema,
  rotationValue: Score0To100Schema,
  informationCompleteness: Score0To100Schema,
  ruleTotal: Score0To100Schema,
}).strict();

export const CandidateEvaluationItemSchema = z.object({
  garmentId: z.string().uuid(), role: GarmentSlotSchema, category: z.string().trim().min(1).max(64), subcategory: z.string().trim().max(64).optional(),
  colors: z.array(z.string().trim().min(1).max(40)).min(1).max(4), styles: z.array(z.string().trim().min(1).max(40)).max(8), seasons: z.array(z.string().trim().min(1).max(24)).max(4),
  formality: z.number().int().min(1).max(5), warmth: z.number().int().min(1).max(5), material: z.string().trim().max(64).optional(), temperatureMinC: z.number().finite().min(-60).max(60).optional(), temperatureMaxC: z.number().finite().min(-60).max(60).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "temperatureMinC must be <= temperatureMaxC" });
});

export const CandidateEvaluationInputSchema = z.object({
  requestId: z.string().uuid(), dateContext: DateContextSchema, weatherEvidence: WeatherEvidenceSchema,
  candidates: z.array(z.object({ candidateId: z.string().uuid(), source: CandidateSourceSchema, items: z.array(CandidateEvaluationItemSchema).min(2).max(9), ruleScores: CandidateRuleScoresSchema }).strict()).min(1).max(4),
}).strict();

export const CandidateEvaluationSchema = z.object({
  candidateId: z.string().uuid(), semanticFit: Score0To100Schema, styleCoherence: Score0To100Schema, sceneRisks: z.array(SceneRiskCodeSchema).max(12), missingSlots: z.array(GarmentSlotSchema).max(9), reasonCodes: z.array(RecommendationReasonCodeSchema).max(12), fallbackUsed: z.boolean(),
}).strict();
export const CandidateEvaluationBatchSchema = z.object({ results: z.array(CandidateEvaluationSchema).min(1).max(4) }).strict();

const LooseStringOrArraySchema = z.union([z.string().trim().max(240), z.array(z.string().trim().max(80)).max(12)]);
export const CanonicalizerInputSchema = z.object({
  requestId: z.string().uuid(), locale: z.enum(["zh-CN", "en-US"]), domainCatalogVersion: z.string().trim().min(1).max(80),
  parsedObservation: z.object({ name: z.string().trim().max(120).optional(), category: LooseStringOrArraySchema.optional(), subcategory: LooseStringOrArraySchema.optional(), colors: LooseStringOrArraySchema.optional(), styles: LooseStringOrArraySchema.optional(), seasons: LooseStringOrArraySchema.optional(), material: LooseStringOrArraySchema.optional(), formality: z.union([z.number(), z.string().trim().max(16)]).optional(), warmth: z.union([z.number(), z.string().trim().max(16)]).optional(), temperatureMinC: z.union([z.number(), z.string().trim().max(16)]).optional(), temperatureMaxC: z.union([z.number(), z.string().trim().max(16)]).optional() }).strict(),
  parseWarnings: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict();

export const CanonicalGarmentObservationSchema = z.object({
  name: z.string().trim().min(1).max(80), category: z.enum(GARMENT_CATEGORY_IDS), subcategory: z.string().trim().min(1).max(64).optional(), colors: z.array(z.string().refine(isSystemColor, "color must exist in COLOR_CATALOG")).min(1).max(4), styles: z.array(z.enum(STYLE_VALUES)).max(8), seasons: z.array(z.enum(SEASON_VALUES)).max(4), material: z.string().trim().max(64).optional(), formality: z.number().int().min(1).max(5), warmth: z.number().int().min(1).max(5), temperatureMinC: z.number().finite().min(-60).max(60).optional(), temperatureMaxC: z.number().finite().min(-60).max(60).optional(), needsReview: z.boolean(), reviewReasonCodes: z.array(CanonicalizerReviewReasonSchema).max(12), sourceConfidence: z.number().finite().min(0).max(1),
}).strict().superRefine((value, ctx) => {
  if (value.subcategory && !getSubcategoryById(value.category, value.subcategory)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subcategory"], message: "subcategory must belong to category" });
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "temperatureMinC must be <= temperatureMaxC" });
});

export const RecommendationReadinessReportSchema = z.object({
  userId: z.string().uuid(), generatedAt: z.string().datetime(), completeness: z.object({ primaryImageRate: z.number().finite().min(0).max(1), categoryRate: z.number().finite().min(0).max(1), colorRate: z.number().finite().min(0).max(1), seasonRate: z.number().finite().min(0).max(1), formalityRate: z.number().finite().min(0).max(1), warmthRate: z.number().finite().min(0).max(1), temperatureRangeRate: z.number().finite().min(0).max(1) }).strict(), eligibleGarmentsBySlot: z.record(GarmentSlotSchema, z.number().int().nonnegative()), validCandidateCount: z.number().int().nonnegative(), displayableCandidateCount: z.number().int().nonnegative(), status: z.enum(["ready", "limited", "not_ready"]), missingFieldCodes: z.array(RecommendationMissingFieldCodeSchema), missingSlotCodes: z.array(GarmentSlotSchema),
}).strict();

export type SceneType = z.infer<typeof SceneTypeSchema>;
export type GarmentSlot = z.infer<typeof GarmentSlotSchema>;
export type AvoidRule = z.infer<typeof AvoidRuleSchema>;
export type RecommendationReasonCode = z.infer<typeof RecommendationReasonCodeSchema>;
export type SceneRiskCode = z.infer<typeof SceneRiskCodeSchema>;
export type RecommendationExclusionCode = z.infer<typeof RecommendationExclusionCodeSchema>;
export type WeatherEvidence = z.infer<typeof WeatherEvidenceSchema>;
export type DateContextInput = z.infer<typeof DateContextInputSchema>;
export type DateContext = z.infer<typeof DateContextSchema>;
export type CandidateSource = z.infer<typeof CandidateSourceSchema>;
export type CandidateRuleScores = z.infer<typeof CandidateRuleScoresSchema>;
export type CandidateEvaluationInput = z.infer<typeof CandidateEvaluationInputSchema>;
export type CandidateEvaluation = z.infer<typeof CandidateEvaluationSchema>;
export type CanonicalizerInput = z.infer<typeof CanonicalizerInputSchema>;
export type CanonicalGarmentObservation = z.infer<typeof CanonicalGarmentObservationSchema>;
export type RecommendationReadinessReport = z.infer<typeof RecommendationReadinessReportSchema>;
