import { z } from "zod";
import {
  GARMENT_CATEGORY_IDS,
  SEASON_VALUES,
  STYLE_VALUES,
  getSubcategoryById,
  isSystemColor,
} from "@wardrobe/domain-catalog";

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
const realDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
};
const realTimezone = (value: string) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
};
const issue = (ctx: z.RefinementCtx, path: Array<string | number>, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

export const RealDateSchema = z.string().refine(realDate, "date must be a real YYYY-MM-DD calendar date");
export const TimeZoneSchema = z.string().trim().min(1).max(64).refine(realTimezone, "timezone must be a valid IANA timezone");
export const SceneTypeSchema = z.enum(["business", "commute", "travel", "casual", "daily", "date", "formal"]);
export const GarmentSlotSchema = z.enum(["tops", "pants", "skirts", "one_piece", "outerwear", "shoes", "bag", "hat", "accessory"]);
export const ThermalStrategySchema = z.enum(["cooling", "light", "balanced", "layer", "warm"]);
export const RainStrategySchema = z.enum(["none", "umbrella", "quick_dry", "waterproof_shoes", "full_rain_protection"]);
export const AvoidRuleSchema = z.enum(["avoid_suede", "avoid_heavy_outerwear", "avoid_light_colors", "avoid_high_heels", "avoid_non_breathable", "avoid_open_toe_shoes"]);
export const SceneRiskCodeSchema = z.enum(["too_cold", "too_hot", "rain_exposure", "wind_exposure", "shoe_discomfort", "formality_mismatch", "activity_mismatch", "missing_required_layer", "style_conflict"]);
export const RecommendationReasonCodeSchema = z.enum(["good_for_commute", "good_for_business", "good_for_travel", "weather_fit", "rain_ready", "activity_comfort", "historical_success", "rotation_value", "new_combination", "shoe_rationality", "outerwear_rationality", "needs_evening_layer", "adaptable_conditions", "rule_fallback"]);
export const CanonicalizerReviewReasonSchema = z.enum(["missing_required_field", "unknown_category", "unknown_subcategory", "unknown_color", "conflicting_season", "invalid_temperature_range", "low_confidence"]);
export const RecommendationMissingFieldCodeSchema = z.enum(["primary_image", "category", "color", "season_or_thermal", "formality"]);
export const RecommendationExclusionCodeSchema = z.enum(["not_current_user", "deleted", "unavailable_status", "missing_primary_image", "missing_required_field", "invalid_formality", "temperature_mismatch", "formality_mismatch", "avoid_rule", "recommendation_blocked"]);
export const Score0To100Schema = z.number().finite().min(0).max(100);
export const RecommendationObjectiveSchema = z.enum(["safe", "fresh", "comfort"]);
export const RecommendationReadinessSchema = z.enum(["ready", "limited", "not_ready"]);
export const RecommendationGenerationModeSchema = z.enum(["rule_only", "paw_enhanced", "rule_fallback"]);

export const RECOMMENDATION_ALGORITHM_VERSION_V1 = "wardora-recommendation-1c";
export const RECOMMENDATION_ALGORITHM_VERSION_V2 = "wardora-recommendation-1d-a-v2";
export const RECOMMENDATION_ALGORITHM_VERSION_V3 = "wardora-recommendation-realtime-v1";
export const RECOMMENDATION_FORECAST_RULE_VERSION = "wardora-rules-1a";
export const RECOMMENDATION_LOCATIONLESS_RULE_VERSION = "wardora-rules-locationless-1";
export const RECOMMENDATION_REALTIME_RULE_VERSION = "wardora-rules-realtime-1";
export const RecommendationContextModeSchema = z.enum(["forecast", "locationless", "weather_fallback"]);
export const RecommendationLocationSourceSchema = z.enum(["travel", "temporary_override", "home_city"]);
export const WeatherLocationRefSchema = z.object({
  locationId: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120),
  timezone: TimeZoneSchema,
  centroidLatitude: z.number().finite().min(-90).max(90).optional(),
  centroidLongitude: z.number().finite().min(-180).max(180).optional(),
}).strict();
export const ResolvedRecommendationContextSchema = z.object({
  targetDate: RealDateSchema,
  targetTimezone: TimeZoneSchema,
  contextResolvedAt: z.string().datetime(),
  contextMode: RecommendationContextModeSchema,
  resolvedLocation: WeatherLocationRefSchema.optional(),
  locationSource: RecommendationLocationSourceSchema.optional(),
}).strict();

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
  weatherCode: z.string().regex(/^\d{3}$/).optional(),
  summary: z.string().trim().min(1).max(120),
}).strict().superRefine((value, ctx) => {
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) issue(ctx, ["temperatureMinC"], "temperatureMinC must be <= temperatureMaxC");
});

export const DateContextInputSchema = z.object({
  date: RealDateSchema,
  weekday: z.number().int().min(1).max(7),
  dayType: z.enum(["workday", "rest_day"]),
  timezone: TimeZoneSchema,
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
}).strict().superRefine((value, ctx) => {
  if (!unique(value.requiredSlots)) issue(ctx, ["requiredSlots"], "requiredSlots must be unique");
  if (!unique(value.optionalSlots)) issue(ctx, ["optionalSlots"], "optionalSlots must be unique");
  if (!unique(value.avoidRules)) issue(ctx, ["avoidRules"], "avoidRules must be unique");
});

export const CandidateSourceSchema = z.enum(["saved_outfit", "adapted_outfit", "generated", "anchor_generated"]);
export const CandidateRuleScoresSchema = z.object({
  weatherFit: Score0To100Schema, sceneFit: Score0To100Schema, structure: Score0To100Schema, colorHarmony: Score0To100Schema, styleCoherence: Score0To100Schema, activityComfort: Score0To100Schema, rotationValue: Score0To100Schema, informationCompleteness: Score0To100Schema, ruleTotal: Score0To100Schema,
}).strict();

export const CandidateEvaluationItemSchema = z.object({
  garmentId: z.string().uuid(), role: GarmentSlotSchema, category: z.enum(GARMENT_CATEGORY_IDS), subcategory: z.string().trim().max(64).optional(),
  colors: z.array(z.string().refine(isSystemColor, "color must exist in COLOR_CATALOG")).min(1).max(4), styles: z.array(z.enum(STYLE_VALUES)).max(8), seasons: z.array(z.enum(SEASON_VALUES)).max(4),
  formality: z.number().int().min(1).max(5), warmth: z.number().int().min(1).max(5), material: z.string().trim().max(64).optional(), temperatureMinC: z.number().finite().min(-60).max(60).optional(), temperatureMaxC: z.number().finite().min(-60).max(60).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) issue(ctx, ["temperatureMinC"], "temperatureMinC must be <= temperatureMaxC");
  if (value.subcategory && !getSubcategoryById(value.category, value.subcategory)) issue(ctx, ["subcategory"], "subcategory must belong to category");
  if (!unique(value.colors)) issue(ctx, ["colors"], "colors must be unique");
  if (!unique(value.styles)) issue(ctx, ["styles"], "styles must be unique");
  if (!unique(value.seasons)) issue(ctx, ["seasons"], "seasons must be unique");
});

export const CandidateEvaluationInputSchema = z.object({
  requestId: z.string().uuid(), dateContext: DateContextSchema, weatherEvidence: WeatherEvidenceSchema,
  candidates: z.array(z.object({ candidateId: z.string().uuid(), source: CandidateSourceSchema, items: z.array(CandidateEvaluationItemSchema).min(2).max(9), ruleScores: CandidateRuleScoresSchema }).strict()).min(1).max(4),
}).strict().superRefine((value, ctx) => {
  if (!unique(value.candidates.map((candidate) => candidate.candidateId))) issue(ctx, ["candidates"], "candidateId must be unique");
  value.candidates.forEach((candidate, index) => {
    if (!unique(candidate.items.map((item) => item.garmentId))) issue(ctx, ["candidates", index, "items"], "garmentId must be unique within a candidate");
  });
});

export const CandidateEvaluationSchema = z.object({
  candidateId: z.string().uuid(), semanticFit: Score0To100Schema, styleCoherence: Score0To100Schema, sceneRisks: z.array(SceneRiskCodeSchema).max(12), missingSlots: z.array(GarmentSlotSchema).max(9), reasonCodes: z.array(RecommendationReasonCodeSchema).max(12), fallbackUsed: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (!unique(value.sceneRisks)) issue(ctx, ["sceneRisks"], "sceneRisks must be unique");
  if (!unique(value.missingSlots)) issue(ctx, ["missingSlots"], "missingSlots must be unique");
  if (!unique(value.reasonCodes)) issue(ctx, ["reasonCodes"], "reasonCodes must be unique");
});
export const CandidateEvaluationBatchSchema = z.object({ results: z.array(CandidateEvaluationSchema).min(1).max(4) }).strict().superRefine((value, ctx) => {
  if (!unique(value.results.map((result) => result.candidateId))) issue(ctx, ["results"], "candidateId must be unique");
});

const LooseStringOrArraySchema = z.union([z.string().trim().max(240), z.array(z.string().trim().max(80)).max(12)]);
export const CanonicalizerInputSchema = z.object({
  requestId: z.string().uuid(), locale: z.enum(["zh-CN", "en-US"]), domainCatalogVersion: z.string().trim().min(1).max(80),
  parsedObservation: z.object({ name: z.string().trim().max(120).optional(), category: LooseStringOrArraySchema.optional(), subcategory: LooseStringOrArraySchema.optional(), colors: LooseStringOrArraySchema.optional(), styles: LooseStringOrArraySchema.optional(), seasons: LooseStringOrArraySchema.optional(), material: LooseStringOrArraySchema.optional(), formality: z.union([z.number(), z.string().trim().max(16)]).optional(), warmth: z.union([z.number(), z.string().trim().max(16)]).optional(), temperatureMinC: z.union([z.number(), z.string().trim().max(16)]).optional(), temperatureMaxC: z.union([z.number(), z.string().trim().max(16)]).optional() }).strict(),
  parseWarnings: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict();

export const CanonicalGarmentObservationSchema = z.object({
  name: z.string().trim().min(1).max(80), category: z.enum(GARMENT_CATEGORY_IDS), subcategory: z.string().trim().min(1).max(64).optional(), colors: z.array(z.string().refine(isSystemColor, "color must exist in COLOR_CATALOG")).min(1).max(4), styles: z.array(z.enum(STYLE_VALUES)).max(8), seasons: z.array(z.enum(SEASON_VALUES)).max(4), material: z.string().trim().max(64).optional(), formality: z.number().int().min(1).max(5), warmth: z.number().int().min(1).max(5), temperatureMinC: z.number().finite().min(-60).max(60).optional(), temperatureMaxC: z.number().finite().min(-60).max(60).optional(), needsReview: z.boolean(), reviewReasonCodes: z.array(CanonicalizerReviewReasonSchema).max(12), sourceConfidence: z.number().finite().min(0).max(1),
}).strict().superRefine((value, ctx) => {
  if (value.subcategory && !getSubcategoryById(value.category, value.subcategory)) issue(ctx, ["subcategory"], "subcategory must belong to category");
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) issue(ctx, ["temperatureMinC"], "temperatureMinC must be <= temperatureMaxC");
});

export const RecommendationReadinessReportSchema = z.object({
  userId: z.string().uuid(), generatedAt: z.string().datetime(),
  completeness: z.object({ primaryImageRate: z.number().finite().min(0).max(1), categoryRate: z.number().finite().min(0).max(1), colorRate: z.number().finite().min(0).max(1), seasonRate: z.number().finite().min(0).max(1), formalityRate: z.number().finite().min(0).max(1), warmthRate: z.number().finite().min(0).max(1), temperatureRangeRate: z.number().finite().min(0).max(1) }).strict(),
  eligibleGarmentsBySlot: z.record(GarmentSlotSchema, z.number().int().nonnegative()), validCandidateCount: z.number().int().nonnegative(), displayableCandidateCount: z.number().int().nonnegative(), status: RecommendationReadinessSchema, missingFieldCodes: z.array(RecommendationMissingFieldCodeSchema), missingSlotCodes: z.array(GarmentSlotSchema),
}).strict().superRefine((value, ctx) => {
  if (!unique(value.missingFieldCodes)) issue(ctx, ["missingFieldCodes"], "missingFieldCodes must be unique");
  if (!unique(value.missingSlotCodes)) issue(ctx, ["missingSlotCodes"], "missingSlotCodes must be unique");
});

export const RecommendationGarmentStatusSchema = z.enum(["active", "laundry", "repair", "archived"]);
export const RecommendationGarmentCategorySchema = z.enum(["tops", "pants", "skirts", "one_piece", "shoes", "bags", "hats", "jewelry", "accessories"]);
export const RecommendationGarmentSchema = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), deleted: z.boolean(), status: RecommendationGarmentStatusSchema, hasPrimaryImage: z.boolean(), category: RecommendationGarmentCategorySchema.optional(), subcategory: z.string().trim().min(1).max(64).optional(), colors: z.array(z.string().refine(isSystemColor, "color must exist in COLOR_CATALOG")).max(4), seasons: z.array(z.enum(SEASON_VALUES)).max(4), styles: z.array(z.enum(STYLE_VALUES)).max(8), formality: z.number().int().min(1).max(5).optional(), warmth: z.number().int().min(1).max(5).optional(), material: z.string().trim().min(1).max(64).optional(), temperatureMinC: z.number().finite().min(-60).max(60).optional(), temperatureMaxC: z.number().finite().min(-60).max(60).optional(), recommendationBlocked: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (!unique(value.colors)) issue(ctx, ["colors"], "colors must be unique");
  if (!unique(value.seasons)) issue(ctx, ["seasons"], "seasons must be unique");
  if (!unique(value.styles)) issue(ctx, ["styles"], "styles must be unique");
  if (value.temperatureMinC !== undefined && value.temperatureMaxC !== undefined && value.temperatureMinC > value.temperatureMaxC) issue(ctx, ["temperatureMinC"], "temperatureMinC must be <= temperatureMaxC");
});
export const RecommendationSavedOutfitSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid(), garmentIds: z.array(z.string().uuid()).min(2).max(9), successfulWearCount: z.number().int().nonnegative() }).strict().superRefine((value, ctx) => {
  if (!unique(value.garmentIds)) issue(ctx, ["garmentIds"], "garmentIds must be unique");
});
export const RecommendationWearHistorySchema = z.object({ garmentIds: z.array(z.string().uuid()).min(1).max(5000), wornDate: RealDateSchema, sceneType: SceneTypeSchema }).strict().superRefine((value, ctx) => {
  if (!unique(value.garmentIds)) issue(ctx, ["garmentIds"], "garmentIds must be unique");
});
export const RecommendationFeedbackSchema = z.object({ garmentIds: z.array(z.string().uuid()).min(1).max(9), sceneType: SceneTypeSchema, sentiment: z.enum(["positive", "moderate_negative", "severe_negative"]) }).strict().superRefine((value, ctx) => {
  if (!unique(value.garmentIds)) issue(ctx, ["garmentIds"], "garmentIds must be unique");
});
const RecommendationEngineInputObjectSchema = z.object({
  requestId: z.string().uuid(), userId: z.string().uuid(), ruleVersion: z.string().trim().min(1).max(80), asOfDate: RealDateSchema, dateContextInput: DateContextInputSchema, garments: z.array(RecommendationGarmentSchema).max(5000), savedOutfits: z.array(RecommendationSavedOutfitSchema).max(1000), wearHistory: z.array(RecommendationWearHistorySchema).max(5000), feedback: z.array(RecommendationFeedbackSchema).max(5000), anchorGarmentIds: z.array(z.string().uuid()).max(9), pawCandidateEvaluatorEnabled: z.boolean(),
}).strict();
const refineEngineInput = (value: z.infer<typeof RecommendationEngineInputObjectSchema>, ctx: z.RefinementCtx) => {
  if (!unique(value.garments.map((garment) => garment.id))) issue(ctx, ["garments"], "garment id must be unique");
  if (!unique(value.savedOutfits.map((outfit) => outfit.id))) issue(ctx, ["savedOutfits"], "outfit id must be unique");
  if (!unique(value.anchorGarmentIds)) issue(ctx, ["anchorGarmentIds"], "anchor garment id must be unique");
  if (value.dateContextInput.date < value.asOfDate) issue(ctx, ["dateContextInput", "date"], "target date must not precede asOfDate");
};
export const RecommendationEngineInputSchema = RecommendationEngineInputObjectSchema.superRefine(refineEngineInput);

const forbiddenWeatherFields = ["temperatureMinC", "temperatureMaxC", "feelsLikeMinC", "feelsLikeMaxC", "rainProbability", "windLevel", "weatherCode"] as const;
const refineV2Context = (value: { resolvedContext: z.infer<typeof ResolvedRecommendationContextSchema>; dateContextInput: z.infer<typeof DateContextInputSchema> }, ctx: z.RefinementCtx) => {
  const resolved = value.resolvedContext;
  const dateInput = value.dateContextInput;
  const weather = dateInput.weatherEvidence;
  const hasLocation = resolved.resolvedLocation !== undefined;
  const hasLocationSource = resolved.locationSource !== undefined;
  if (resolved.targetDate !== dateInput.date) issue(ctx, ["resolvedContext", "targetDate"], "resolved targetDate must match DateContext input");
  if (resolved.targetTimezone !== dateInput.timezone) issue(ctx, ["resolvedContext", "targetTimezone"], "resolved targetTimezone must match DateContext input");
  if (hasLocation !== hasLocationSource) issue(ctx, ["resolvedContext"], "resolvedLocation and locationSource must appear together");
  if (resolved.contextMode === "forecast") {
    if (!hasLocation || !hasLocationSource) issue(ctx, ["resolvedContext", "resolvedLocation"], "forecast requires a resolved location and source");
    if (resolved.resolvedLocation?.timezone !== resolved.targetTimezone) issue(ctx, ["resolvedContext", "resolvedLocation", "timezone"], "forecast location timezone must match targetTimezone");
    if (weather.weatherSource !== "forecast") issue(ctx, ["dateContextInput", "weatherEvidence", "weatherSource"], "forecast mode requires forecast evidence");
    if (!(weather.weatherConfidence > 0 && weather.weatherConfidence <= 1)) issue(ctx, ["dateContextInput", "weatherEvidence", "weatherConfidence"], "forecast confidence must be greater than zero");
    if (weather.temperatureMinC === undefined || weather.temperatureMaxC === undefined) issue(ctx, ["dateContextInput", "weatherEvidence"], "forecast temperature range must be complete");
    if ((weather.feelsLikeMinC === undefined) !== (weather.feelsLikeMaxC === undefined)) issue(ctx, ["dateContextInput", "weatherEvidence"], "forecast feels-like range must be complete when present");
    if (Date.parse(weather.weatherUpdatedAt) > Date.parse(resolved.contextResolvedAt)) issue(ctx, ["dateContextInput", "weatherEvidence", "weatherUpdatedAt"], "forecast evidence cannot postdate context resolution");
    return;
  }
  if (resolved.contextMode === "locationless") {
    if (hasLocation || hasLocationSource) issue(ctx, ["resolvedContext"], "locationless mode forbids resolved location and source");
    if (resolved.targetTimezone !== "Asia/Shanghai" || dateInput.timezone !== "Asia/Shanghai") issue(ctx, ["resolvedContext", "targetTimezone"], "locationless mode uses Asia/Shanghai");
  } else {
    if (!hasLocation || !hasLocationSource) issue(ctx, ["resolvedContext", "resolvedLocation"], "weather fallback requires a resolved location and source");
    if (resolved.resolvedLocation?.timezone !== resolved.targetTimezone) issue(ctx, ["resolvedContext", "resolvedLocation", "timezone"], "fallback location timezone must match targetTimezone");
  }
  if (weather.weatherSource !== "layering_default") issue(ctx, ["dateContextInput", "weatherEvidence", "weatherSource"], "generic modes require layering_default evidence");
  if (weather.weatherConfidence !== 0) issue(ctx, ["dateContextInput", "weatherEvidence", "weatherConfidence"], "generic modes require zero weather confidence");
  const expectedSummary = resolved.contextMode === "locationless" ? "未设置城市，采用通用分层推荐" : "天气暂不可用，采用通用分层推荐";
  if (weather.summary !== expectedSummary) issue(ctx, ["dateContextInput", "weatherEvidence", "summary"], "generic mode summary must use the frozen copy");
  if (weather.weatherUpdatedAt !== resolved.contextResolvedAt) issue(ctx, ["dateContextInput", "weatherEvidence", "weatherUpdatedAt"], "generic evidence timestamp must equal contextResolvedAt");
  for (const field of forbiddenWeatherFields) if (weather[field] !== undefined) issue(ctx, ["dateContextInput", "weatherEvidence", field], `generic mode forbids ${field}`);
};

export const RecommendationEngineInputV2Schema = RecommendationEngineInputObjectSchema.extend({
  resolvedContext: ResolvedRecommendationContextSchema,
}).strict().superRefine((value, ctx) => {
  refineEngineInput(value, ctx);
  refineV2Context(value, ctx);
  const expectedRuleVersion = value.resolvedContext.contextMode === "forecast" ? RECOMMENDATION_FORECAST_RULE_VERSION : RECOMMENDATION_LOCATIONLESS_RULE_VERSION;
  if (value.ruleVersion !== expectedRuleVersion) issue(ctx, ["ruleVersion"], "ruleVersion must match V2 context mode");
  if (value.pawCandidateEvaluatorEnabled) issue(ctx, ["pawCandidateEvaluatorEnabled"], "PAW remains disabled for 1D-A V2");
});

export const RecommendationObjectiveScoresSchema = z.object({ safe: Score0To100Schema, fresh: Score0To100Schema, comfort: Score0To100Schema }).strict();
export const DeterministicRiskCodeSchema = z.enum([
  "missing_required_slot",
  "severe_temperature_mismatch",
  "severe_formality_mismatch",
  "rain_incompatible",
  "shoe_activity_mismatch",
  "wind_rain_exposure",
  "outerwear_recommended",
  "evening_layer_recommended",
]);
export const DeterministicRiskAssessmentSchema = z.object({
  blockingCodes: z.array(DeterministicRiskCodeSchema).max(8),
  warningCodes: z.array(DeterministicRiskCodeSchema).max(8),
  advisoryCodes: z.array(DeterministicRiskCodeSchema).max(8),
}).strict().superRefine((value, ctx) => {
  const all = [...value.blockingCodes, ...value.warningCodes, ...value.advisoryCodes];
  if (!unique(all)) issue(ctx, [], "deterministic risk codes must be unique across severities");
});
const RecommendationAuditCandidateObjectSchema = z.object({
  candidateId: z.string().uuid(), garmentIds: z.array(z.string().uuid()).min(2).max(9), source: CandidateSourceSchema, sourceOutfitId: z.string().uuid().optional(), template: z.enum(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]), ruleScores: CandidateRuleScoresSchema, combinationNovelty: Score0To100Schema, longUnwornValue: Score0To100Schema, savedOrHistoricalSuccess: Score0To100Schema, styleVariation: Score0To100Schema, historicalThermalAndDiscomfortFit: Score0To100Schema, shoeAndOuterwearRationality: Score0To100Schema, pawEvaluation: CandidateEvaluationSchema, objectiveScores: RecommendationObjectiveScoresSchema, reasonCodes: z.array(RecommendationReasonCodeSchema).max(12), riskCodes: z.array(SceneRiskCodeSchema).max(12), missingSlotCodes: z.array(GarmentSlotSchema).max(9),
}).strict();
const refineAuditCandidate = (value: z.infer<typeof RecommendationAuditCandidateObjectSchema>, ctx: z.RefinementCtx) => {
  if (!unique(value.garmentIds)) issue(ctx, ["garmentIds"], "garmentIds must be unique");
  if (value.pawEvaluation.candidateId !== value.candidateId) issue(ctx, ["pawEvaluation", "candidateId"], "PAW candidateId must match candidateId");
  if (!unique(value.reasonCodes)) issue(ctx, ["reasonCodes"], "reasonCodes must be unique");
  if (!unique(value.riskCodes)) issue(ctx, ["riskCodes"], "riskCodes must be unique");
  if (!unique(value.missingSlotCodes)) issue(ctx, ["missingSlotCodes"], "missingSlotCodes must be unique");
};
export const RecommendationAuditCandidateSchema = RecommendationAuditCandidateObjectSchema.superRefine(refineAuditCandidate);
export const DisplayRecommendationSchema = RecommendationAuditCandidateObjectSchema.extend({ objective: RecommendationObjectiveSchema, finalScore: Score0To100Schema }).strict().superRefine(refineAuditCandidate);
export const RecommendationExclusionSchema = z.object({ garmentId: z.string().uuid(), codes: z.array(RecommendationExclusionCodeSchema).min(1).max(12) }).strict().superRefine((value, ctx) => {
  if (!unique(value.codes)) issue(ctx, ["codes"], "exclusion codes must be unique");
});
export const RecommendationEngineOutputSchema = z.object({
  ruleVersion: z.string().trim().min(1).max(80), dateContext: DateContextSchema, recommendations: z.array(DisplayRecommendationSchema).max(3), shortlist: z.array(RecommendationAuditCandidateSchema).max(18), readiness: RecommendationReadinessReportSchema, exclusions: z.array(RecommendationExclusionSchema).max(5000), metrics: z.object({ eligibleGarmentCount: z.number().int().nonnegative(), rawCandidateCount: z.number().int().nonnegative().max(120), ruleScoredCandidateCount: z.number().int().nonnegative().max(60), maxBeamObserved: z.number().int().nonnegative().max(48) }).strict(),
}).strict().superRefine((value, ctx) => {
  const shortlist = new Map(value.shortlist.map((candidate) => [candidate.candidateId, candidate]));
  if (shortlist.size !== value.shortlist.length) issue(ctx, ["shortlist"], "shortlist candidateId must be unique");
  if (!unique(value.recommendations.map((display) => display.candidateId))) issue(ctx, ["recommendations"], "display candidateId must be unique");
  if (!unique(value.recommendations.map((display) => display.objective))) issue(ctx, ["recommendations"], "display objective must be unique");
  if (!unique(value.exclusions.map((entry) => entry.garmentId))) issue(ctx, ["exclusions"], "excluded garmentId must be unique");
  value.recommendations.forEach((display, index) => {
    const audit = shortlist.get(display.candidateId);
    if (!audit) return issue(ctx, ["recommendations", index, "candidateId"], "display candidate must exist in shortlist");
    for (const key of ["garmentIds", "source", "sourceOutfitId", "template", "ruleScores", "pawEvaluation", "objectiveScores", "reasonCodes", "riskCodes", "missingSlotCodes"] as const) {
      if (JSON.stringify(display[key]) !== JSON.stringify(audit[key])) issue(ctx, ["recommendations", index, key], `display ${key} must match shortlist audit`);
    }
    if (display.finalScore !== display.objectiveScores[display.objective]) issue(ctx, ["recommendations", index, "finalScore"], "finalScore must equal selected objective score");
  });
});

const RecommendationAuditCandidateV3ObjectSchema = z.object({
  candidateId: z.string().uuid(), garmentIds: z.array(z.string().uuid()).min(2).max(9), source: CandidateSourceSchema, sourceOutfitId: z.string().uuid().optional(), template: z.enum(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]), ruleScores: CandidateRuleScoresSchema, combinationNovelty: Score0To100Schema, rotationValue: Score0To100Schema, savedOrHistoricalSuccess: Score0To100Schema, styleVariation: Score0To100Schema, historicalThermalAndDiscomfortFit: Score0To100Schema, shoeAndOuterwearRationality: Score0To100Schema, deterministicRiskAssessment: DeterministicRiskAssessmentSchema, objectiveScores: RecommendationObjectiveScoresSchema, reasonCodes: z.array(RecommendationReasonCodeSchema).max(12), missingSlotCodes: z.array(GarmentSlotSchema).max(9),
}).strict();
const refineV3Candidate = (value: z.infer<typeof RecommendationAuditCandidateV3ObjectSchema>, ctx: z.RefinementCtx) => {
  if (!unique(value.garmentIds)) issue(ctx, ["garmentIds"], "garmentIds must be unique");
  if (!unique(value.reasonCodes)) issue(ctx, ["reasonCodes"], "reasonCodes must be unique");
  if (!unique(value.missingSlotCodes)) issue(ctx, ["missingSlotCodes"], "missingSlotCodes must be unique");
};
export const RecommendationAuditCandidateV3Schema = RecommendationAuditCandidateV3ObjectSchema.superRefine(refineV3Candidate);
export const DisplayRecommendationV3Schema = RecommendationAuditCandidateV3ObjectSchema.extend({ objective: RecommendationObjectiveSchema, finalScore: Score0To100Schema }).strict().superRefine(refineV3Candidate);
export const RecommendationEngineOutputV3Schema = z.object({
  algorithmVersion: z.literal(RECOMMENDATION_ALGORITHM_VERSION_V3),
  ruleVersion: z.literal(RECOMMENDATION_REALTIME_RULE_VERSION),
  dateContext: DateContextSchema,
  recommendations: z.array(DisplayRecommendationV3Schema).max(3),
  shortlist: z.array(RecommendationAuditCandidateV3Schema).max(18),
  readiness: RecommendationReadinessReportSchema,
  exclusions: z.array(RecommendationExclusionSchema).max(5000),
  metrics: z.object({ eligibleGarmentCount: z.number().int().nonnegative(), rawCandidateCount: z.number().int().nonnegative().max(120), ruleScoredCandidateCount: z.number().int().nonnegative().max(60), maxBeamObserved: z.number().int().nonnegative().max(48) }).strict(),
}).strict().superRefine((value, ctx) => {
  const shortlist = new Map(value.shortlist.map((candidate) => [candidate.candidateId, candidate]));
  if (shortlist.size !== value.shortlist.length) issue(ctx, ["shortlist"], "shortlist candidateId must be unique");
  if (!unique(value.recommendations.map((display) => display.candidateId))) issue(ctx, ["recommendations"], "display candidateId must be unique");
  if (!unique(value.recommendations.map((display) => display.objective))) issue(ctx, ["recommendations"], "display objective must be unique");
  value.recommendations.forEach((display, index) => {
    const audit = shortlist.get(display.candidateId);
    if (!audit) return issue(ctx, ["recommendations", index, "candidateId"], "display candidate must exist in shortlist");
    for (const key of ["garmentIds", "source", "sourceOutfitId", "template", "ruleScores", "rotationValue", "deterministicRiskAssessment", "objectiveScores", "reasonCodes", "missingSlotCodes"] as const) {
      if (JSON.stringify(display[key]) !== JSON.stringify(audit[key])) issue(ctx, ["recommendations", index, key], `display ${key} must match shortlist audit`);
    }
    if (display.finalScore !== display.objectiveScores[display.objective]) issue(ctx, ["recommendations", index, "finalScore"], "finalScore must equal selected objective score");
  });
});

type RecommendationEngineOutputValue = z.infer<typeof RecommendationEngineOutputSchema>;
const refineForbiddenAuditCodes = (
  engineOutput: RecommendationEngineOutputValue,
  ctx: z.RefinementCtx,
  forbiddenReasonCodes: ReadonlySet<string>,
  forbiddenRiskCodes: ReadonlySet<string>,
) => {
  for (const [collectionName, candidates] of [
    ["shortlist", engineOutput.shortlist],
    ["recommendations", engineOutput.recommendations],
  ] as const) {
    candidates.forEach((candidate, index) => {
      if (candidate.reasonCodes.some((code) => forbiddenReasonCodes.has(code))) issue(ctx, ["engineOutput", collectionName, index, "reasonCodes"], "context mode forbids these reason codes");
      if (candidate.pawEvaluation.reasonCodes.some((code) => forbiddenReasonCodes.has(code))) issue(ctx, ["engineOutput", collectionName, index, "pawEvaluation", "reasonCodes"], "context mode forbids these PAW reason codes");
      if (candidate.riskCodes.some((code) => forbiddenRiskCodes.has(code))) issue(ctx, ["engineOutput", collectionName, index, "riskCodes"], "context mode forbids these risk codes");
      if (candidate.pawEvaluation.sceneRisks.some((code) => forbiddenRiskCodes.has(code))) issue(ctx, ["engineOutput", collectionName, index, "pawEvaluation", "sceneRisks"], "context mode forbids these PAW risk codes");
    });
  }
};

const adaptableConditionsReasonCodes = new Set(["adaptable_conditions"]);
const noRiskCodes = new Set<string>();
export const RecommendationPayloadV1Schema = z.object({ engineOutput: RecommendationEngineOutputSchema, dateContextInput: DateContextInputSchema }).strict().superRefine((value, ctx) => {
  if (value.engineOutput.readiness.status === "not_ready" && value.engineOutput.recommendations.length !== 0) issue(ctx, ["engineOutput", "recommendations"], "not_ready output must not display recommendations");
  refineForbiddenAuditCodes(value.engineOutput, ctx, adaptableConditionsReasonCodes, noRiskCodes);
});
const genericWeatherReasonCodes = new Set(["weather_fit", "rain_ready", "needs_evening_layer"]);
const genericWeatherRiskCodes = new Set(["too_hot", "too_cold", "rain_exposure", "wind_exposure", "missing_required_layer"]);
const genericWeatherAvoidRules = new Set(["avoid_suede", "avoid_heavy_outerwear", "avoid_non_breathable", "avoid_open_toe_shoes"]);
export const RecommendationPayloadV2Schema = z.object({
  schemaVersion: z.literal(2),
  resolvedContext: ResolvedRecommendationContextSchema,
  dateContextInput: DateContextInputSchema,
  engineOutput: RecommendationEngineOutputSchema,
  weatherContext: z.object({
    availabilityReason: z.enum(["available", "locationless", "forecast_out_of_range", "provider_unavailable", "insufficient_evidence"]),
    endpointFreshness: z.array(z.object({ endpoint: z.enum(["now", "hourly", "daily"]), freshness: z.enum(["fresh", "stale"]), providerUpdatedAt: z.string().datetime(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), staleUntil: z.string().datetime() }).strict()).max(3),
    attribution: z.object({ label: z.literal("天气服务由 QWeather 提供"), url: z.literal("https://www.qweather.com"), sources: z.array(z.string().trim().min(1).max(160)).max(16), license: z.array(z.string().trim().min(1).max(160)).max(16) }).strict().optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  refineV2Context(value, ctx);
  if (value.engineOutput.readiness.status === "not_ready" && value.engineOutput.recommendations.length !== 0) issue(ctx, ["engineOutput", "recommendations"], "not_ready output must not display recommendations");
  const expectedRuleVersion = value.resolvedContext.contextMode === "forecast" ? RECOMMENDATION_FORECAST_RULE_VERSION : RECOMMENDATION_LOCATIONLESS_RULE_VERSION;
  if (value.engineOutput.ruleVersion !== expectedRuleVersion) issue(ctx, ["engineOutput", "ruleVersion"], "engine ruleVersion must match V2 context mode");
  if (value.resolvedContext.contextMode === "forecast") {
    refineForbiddenAuditCodes(value.engineOutput, ctx, adaptableConditionsReasonCodes, noRiskCodes);
  } else {
    refineForbiddenAuditCodes(value.engineOutput, ctx, genericWeatherReasonCodes, genericWeatherRiskCodes);
    const dateContext = value.engineOutput.dateContext;
    if (dateContext.thermalStrategy !== "layer") issue(ctx, ["engineOutput", "dateContext", "thermalStrategy"], "generic modes require layer thermal strategy");
    if (dateContext.rainStrategy !== "none") issue(ctx, ["engineOutput", "dateContext", "rainStrategy"], "generic modes require no rain strategy");
    if (dateContext.confidence !== "low") issue(ctx, ["engineOutput", "dateContext", "confidence"], "generic modes require low confidence");
    if (dateContext.contextSummary !== `${dateContext.sceneType}:layer:none`) issue(ctx, ["engineOutput", "dateContext", "contextSummary"], "generic modes require deterministic context summary");
    if (dateContext.avoidRules.some((code) => genericWeatherAvoidRules.has(code))) issue(ctx, ["engineOutput", "dateContext", "avoidRules"], "generic modes forbid weather-derived avoid rules");
  }
});
export const RecommendationPayloadV3Schema = z.object({
  schemaVersion: z.literal(3),
  resolvedContext: ResolvedRecommendationContextSchema,
  dateContextInput: DateContextInputSchema,
  engineOutput: RecommendationEngineOutputV3Schema,
  weatherContext: z.object({
    availabilityReason: z.enum(["available", "locationless", "forecast_out_of_range", "provider_unavailable", "insufficient_evidence"]),
    endpointFreshness: z.array(z.object({ endpoint: z.enum(["now", "hourly", "daily"]), freshness: z.enum(["fresh", "stale"]), providerUpdatedAt: z.string().datetime(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), staleUntil: z.string().datetime() }).strict()).max(3),
    attribution: z.object({ label: z.literal("天气服务由 QWeather 提供"), url: z.literal("https://www.qweather.com"), sources: z.array(z.string().trim().min(1).max(160)).max(16), license: z.array(z.string().trim().min(1).max(160)).max(16) }).strict().optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  refineV2Context(value, ctx);
  if (value.engineOutput.readiness.status === "not_ready" && value.engineOutput.recommendations.length !== 0) issue(ctx, ["engineOutput", "recommendations"], "not_ready output must not display recommendations");
  if (value.resolvedContext.contextMode !== "forecast") {
    const context = value.engineOutput.dateContext;
    if (context.thermalStrategy !== "layer" || context.rainStrategy !== "none" || context.confidence !== "low") issue(ctx, ["engineOutput", "dateContext"], "generic V3 context must use deterministic layering fallback");
    if (context.contextSummary !== `${context.sceneType}:layer:none`) issue(ctx, ["engineOutput", "dateContext", "contextSummary"], "generic V3 context summary must be deterministic");
  }
});
export const RecommendationPayloadSchema = z.union([RecommendationPayloadV3Schema, RecommendationPayloadV2Schema, RecommendationPayloadV1Schema]);
export const RecommendationPawProgramVersionsSchema = z.object({ dateContext: z.union([z.literal("disabled"), z.string().trim().min(1).max(80)]), candidateEvaluator: z.union([z.literal("disabled"), z.string().trim().min(1).max(80)]) }).strict();
export const PublishDailyRecommendationCommandSchema = z.object({
  userId: z.string().uuid(), targetDate: RealDateSchema, targetTimezone: TimeZoneSchema, generationBatchId: z.string().uuid(), generationRequestId: z.string().uuid(), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), generationSource: z.enum(["foreground", "worker"]).optional(), forceRefresh: z.boolean().optional(), readiness: RecommendationReadinessSchema, generationMode: RecommendationGenerationModeSchema, payload: RecommendationPayloadSchema, algorithmVersion: z.string().trim().min(1).max(80), ruleVersion: z.string().trim().min(1).max(80), pawProgramVersions: RecommendationPawProgramVersionsSchema, generatedAt: z.string().datetime(), expiresAt: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  if (value.readiness !== value.payload.engineOutput.readiness.status) issue(ctx, ["readiness"], "readiness must match payload");
  if (value.ruleVersion !== value.payload.engineOutput.ruleVersion) issue(ctx, ["ruleVersion"], "ruleVersion must match payload");
  if (value.targetDate !== value.payload.dateContextInput.date) issue(ctx, ["targetDate"], "targetDate must match payload DateContext input");
  if (value.targetTimezone !== value.payload.dateContextInput.timezone) issue(ctx, ["targetTimezone"], "targetTimezone must match payload DateContext input");
  if ("schemaVersion" in value.payload && value.payload.schemaVersion === 3) {
    if (value.algorithmVersion !== RECOMMENDATION_ALGORITHM_VERSION_V3 || value.ruleVersion !== RECOMMENDATION_REALTIME_RULE_VERSION) issue(ctx, ["algorithmVersion"], "V3 command must use realtime versions");
    if (value.generationMode !== "rule_only") issue(ctx, ["generationMode"], "V3 writes must be rule_only");
    if (value.pawProgramVersions.dateContext !== "disabled" || value.pawProgramVersions.candidateEvaluator !== "disabled") issue(ctx, ["pawProgramVersions"], "V3 writes require PAW disabled");
    if (!value.inputFingerprint || !value.generationSource) issue(ctx, ["inputFingerprint"], "V3 writes require input fingerprint and generation source");
  } else if ("schemaVersion" in value.payload) {
    if (value.targetDate !== value.payload.resolvedContext.targetDate) issue(ctx, ["targetDate"], "targetDate must match resolved context");
    if (value.targetTimezone !== value.payload.resolvedContext.targetTimezone) issue(ctx, ["targetTimezone"], "targetTimezone must match resolved context");
    if (value.algorithmVersion !== RECOMMENDATION_ALGORITHM_VERSION_V2) issue(ctx, ["algorithmVersion"], "V2 command must use the frozen V2 algorithm version");
  }
  if (Date.parse(value.expiresAt) <= Date.parse(value.generatedAt)) issue(ctx, ["expiresAt"], "expiresAt must be after generatedAt");
});
export const DailyRecommendationRecordSchema = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), targetDate: RealDateSchema, targetTimezone: TimeZoneSchema, revision: z.number().int().positive(), generationBatchId: z.string().uuid(), generationRequestId: z.string().uuid(), payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(), generationSource: z.enum(["foreground", "worker"]).optional(), readiness: RecommendationReadinessSchema, generationMode: RecommendationGenerationModeSchema, isCurrent: z.boolean(), lifecycle: z.enum(["current", "superseded"]), supersededAt: z.string().datetime().nullable(), payload: RecommendationPayloadSchema, algorithmVersion: z.string().trim().min(1).max(80), ruleVersion: z.string().trim().min(1).max(80), pawProgramVersions: RecommendationPawProgramVersionsSchema, generatedAt: z.string().datetime(), expiresAt: z.string().datetime(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  if (value.lifecycle !== (value.isCurrent ? "current" : "superseded")) issue(ctx, ["lifecycle"], "lifecycle must match isCurrent");
  if (value.isCurrent !== (value.supersededAt === null)) issue(ctx, ["supersededAt"], "current records must not have supersededAt");
  if (value.readiness !== value.payload.engineOutput.readiness.status) issue(ctx, ["readiness"], "readiness must match payload");
  if (value.ruleVersion !== value.payload.engineOutput.ruleVersion) issue(ctx, ["ruleVersion"], "ruleVersion must match payload");
  if (value.targetDate !== value.payload.dateContextInput.date) issue(ctx, ["targetDate"], "targetDate must match payload DateContext input");
  if (value.targetTimezone !== value.payload.dateContextInput.timezone) issue(ctx, ["targetTimezone"], "targetTimezone must match payload DateContext input");
  if ("schemaVersion" in value.payload && value.payload.schemaVersion === 3) {
    if (value.algorithmVersion !== RECOMMENDATION_ALGORITHM_VERSION_V3 || value.ruleVersion !== RECOMMENDATION_REALTIME_RULE_VERSION) issue(ctx, ["algorithmVersion"], "V3 record must use realtime versions");
    if (value.generationMode !== "rule_only" || !value.inputFingerprint || !value.generationSource) issue(ctx, ["inputFingerprint"], "V3 record must be a fingerprinted rule-only write");
  } else if ("schemaVersion" in value.payload) {
    if (value.targetDate !== value.payload.resolvedContext.targetDate) issue(ctx, ["targetDate"], "targetDate must match resolved context");
    if (value.targetTimezone !== value.payload.resolvedContext.targetTimezone) issue(ctx, ["targetTimezone"], "targetTimezone must match resolved context");
    if (value.algorithmVersion !== RECOMMENDATION_ALGORITHM_VERSION_V2) issue(ctx, ["algorithmVersion"], "V2 record must use the frozen V2 algorithm version");
  }
  if (Date.parse(value.expiresAt) <= Date.parse(value.generatedAt)) issue(ctx, ["expiresAt"], "expiresAt must be after generatedAt");
});

export const RecommendationJobRunStatusSchema = z.enum(["running", "completed", "completed_with_errors", "failed"]);
export const RecommendationJobErrorCodeSchema = z.enum(["weather_unavailable", "wardrobe_not_ready", "date_context_failed", "candidate_generation_failed", "paw_timeout", "persistence_failed", "unknown"]);
export const RecommendationJobRunSummarySchema = z.object({
  id: z.string().uuid(), scheduledFor: z.string().datetime(), startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(), status: RecommendationJobRunStatusSchema,
  targetTaskCount: z.number().int().nonnegative(), readyCount: z.number().int().nonnegative(), fallbackCount: z.number().int().nonnegative(), failedCount: z.number().int().nonnegative(),
  algorithmVersion: z.string().trim().min(1).max(80), pawProgramVersions: RecommendationPawProgramVersionsSchema,
  errorCodeCounts: z.record(RecommendationJobErrorCodeSchema, z.number().int().nonnegative()),
}).strict();

export const RecommendationReadQuerySchema = z.object({
  startDate: RealDateSchema, endDate: RealDateSchema,
}).strict().superRefine((value, ctx) => {
  if (value.endDate < value.startDate) issue(ctx, ["endDate"], "endDate must not precede startDate");
  const days = Math.round((Date.parse(`${value.endDate}T00:00:00Z`) - Date.parse(`${value.startDate}T00:00:00Z`)) / 86_400_000);
  if (days > 31) issue(ctx, ["endDate"], "date range must not exceed 31 days");
});
export const RecommendationDisplayItemSchema = z.object({
  recommendationId: z.string().uuid(), targetDate: RealDateSchema, generationBatchId: z.string().uuid(), readiness: RecommendationReadinessSchema, generationMode: RecommendationGenerationModeSchema,
  generatedAt: z.string().datetime(), expiresAt: z.string().datetime(), weatherEvidence: WeatherEvidenceSchema,
  recommendations: z.array(z.object({ candidateId: z.string().uuid(), objective: RecommendationObjectiveSchema, garmentIds: z.array(z.string().uuid()).min(2).max(9), source: CandidateSourceSchema, reasonCodes: z.array(RecommendationReasonCodeSchema).max(12), riskCodes: z.array(SceneRiskCodeSchema).max(12), finalScore: Score0To100Schema }).strict()).max(3),
}).strict();
export const RecommendationDisplayItemV2Schema = RecommendationDisplayItemSchema.extend({
  contextMode: RecommendationContextModeSchema,
  targetTimezone: TimeZoneSchema,
  contextResolvedAt: z.string().datetime(),
  resolvedLocation: WeatherLocationRefSchema.optional(),
  locationSource: RecommendationLocationSourceSchema.optional(),
  algorithmVersion: z.literal(RECOMMENDATION_ALGORITHM_VERSION_V2),
  ruleVersion: z.union([z.literal(RECOMMENDATION_FORECAST_RULE_VERSION), z.literal(RECOMMENDATION_LOCATIONLESS_RULE_VERSION)]),
  availabilityReason: z.enum(["available", "locationless", "forecast_out_of_range", "provider_unavailable", "insufficient_evidence"]),
  endpointFreshness: z.array(z.object({ endpoint: z.enum(["now", "hourly", "daily"]), freshness: z.enum(["fresh", "stale"]), providerUpdatedAt: z.string().datetime(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), staleUntil: z.string().datetime() }).strict()).max(3),
  attribution: z.object({ label: z.literal("天气服务由 QWeather 提供"), url: z.literal("https://www.qweather.com"), sources: z.array(z.string().trim().min(1).max(160)).max(16), license: z.array(z.string().trim().min(1).max(160)).max(16) }).strict().optional(),
}).strict();
export const RecommendationDisplayItemV3Schema = z.object({
  recommendationId: z.string().uuid(), recommendationRevision: z.number().int().positive(), inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/), targetDate: RealDateSchema, generationBatchId: z.string().uuid(), readiness: RecommendationReadinessSchema, generationMode: z.literal("rule_only"), generatedAt: z.string().datetime(), expiresAt: z.string().datetime(), weatherEvidence: WeatherEvidenceSchema,
  recommendations: z.array(z.object({ candidateId: z.string().uuid(), objective: RecommendationObjectiveSchema, garmentIds: z.array(z.string().uuid()).min(2).max(9), source: CandidateSourceSchema, reasonCodes: z.array(RecommendationReasonCodeSchema).max(12), riskCodes: z.array(DeterministicRiskCodeSchema).max(24), finalScore: Score0To100Schema }).strict()).max(3),
  contextMode: RecommendationContextModeSchema, targetTimezone: TimeZoneSchema, contextResolvedAt: z.string().datetime(), resolvedLocation: WeatherLocationRefSchema.optional(), locationSource: RecommendationLocationSourceSchema.optional(), algorithmVersion: z.literal(RECOMMENDATION_ALGORITHM_VERSION_V3), ruleVersion: z.literal(RECOMMENDATION_REALTIME_RULE_VERSION), availabilityReason: z.enum(["available", "locationless", "forecast_out_of_range", "provider_unavailable", "insufficient_evidence"]), endpointFreshness: z.array(z.object({ endpoint: z.enum(["now", "hourly", "daily"]), freshness: z.enum(["fresh", "stale"]), providerUpdatedAt: z.string().datetime(), fetchedAt: z.string().datetime(), expiresAt: z.string().datetime(), staleUntil: z.string().datetime() }).strict()).max(3), attribution: z.object({ label: z.literal("天气服务由 QWeather 提供"), url: z.literal("https://www.qweather.com"), sources: z.array(z.string().trim().min(1).max(160)).max(16), license: z.array(z.string().trim().min(1).max(160)).max(16) }).strict().optional(),
}).strict();
export const RecommendationReadResponseSchema = z.object({
  timezone: TimeZoneSchema, pairConsistent: z.boolean(), items: z.array(z.union([RecommendationDisplayItemV3Schema, RecommendationDisplayItemV2Schema, RecommendationDisplayItemSchema])).max(32),
}).strict().superRefine((value, ctx) => {
  const firstTwo = value.items.slice(0, 2);
  if (value.pairConsistent && firstTwo.length === 2 && firstTwo[0]!.generationBatchId !== firstTwo[1]!.generationBatchId) issue(ctx, ["items"], "consistent pair must share generationBatchId");
});
export const ResolveRecommendationsCommandSchema = z.object({
  dates: z.array(RealDateSchema).min(1).max(2),
  force: z.boolean().optional(),
  clientMutationId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (!unique(value.dates)) issue(ctx, ["dates"], "resolve dates must be unique");
  if (value.force === true && !value.clientMutationId) issue(ctx, ["clientMutationId"], "force resolve requires clientMutationId");
  if (value.force !== true && value.clientMutationId) issue(ctx, ["clientMutationId"], "clientMutationId is only valid for force resolve");
});
export const ResolveStatusSchema = z.enum(["reused", "generated", "served_stale", "protected_plan", "actual_wear", "not_ready"]);
export const ResolveRecommendationsResponseSchema = z.object({
  timezone: z.literal("Asia/Shanghai"),
  results: z.array(z.object({
    targetDate: RealDateSchema,
    status: ResolveStatusSchema,
    recommendation: RecommendationDisplayItemV3Schema.optional(),
    protectedPlanEntryId: z.string().uuid().optional(),
    planRiskCodes: z.array(DeterministicRiskCodeSchema).max(24).optional(),
  }).strict()).min(1).max(2),
}).strict();
export const RecommendationRegenerationReasonSchema = z.enum(["home_city_changed", "temporary_city_changed", "travel_changed", "garment_changed", "weather_changed", "explicit_reassess"]);
export const RecommendationRegenerationStatusSchema = z.enum(["pending", "processing", "completed", "failed"]);
export const ReassessRecommendationCommandSchema = z.object({ clientMutationId: z.string().uuid() }).strict();
export const RecommendationRegenerationRequestSchema = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), targetDate: RealDateSchema,
  reasons: z.array(RecommendationRegenerationReasonSchema).min(1).max(6),
  clientMutationIds: z.array(z.string().uuid()).max(32), status: RecommendationRegenerationStatusSchema,
  attemptCount: z.number().int().nonnegative(), maxAttempts: z.number().int().min(1).max(10),
  nextAttemptAt: z.string().datetime(), lockedAt: z.string().datetime().nullable(), lastErrorCode: z.enum(["weather_unavailable", "wardrobe_not_ready", "candidate_generation_failed", "persistence_failed", "protected_plan", "unknown"]).nullable(),
  resultRecommendationId: z.string().uuid().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
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
export type RecommendationGarment = z.infer<typeof RecommendationGarmentSchema>;
export type RecommendationSavedOutfit = z.infer<typeof RecommendationSavedOutfitSchema>;
export type RecommendationWearHistory = z.infer<typeof RecommendationWearHistorySchema>;
export type RecommendationFeedback = z.infer<typeof RecommendationFeedbackSchema>;
export type RecommendationEngineInput = z.infer<typeof RecommendationEngineInputSchema>;
export type RecommendationEngineInputV2 = z.infer<typeof RecommendationEngineInputV2Schema>;
export type RecommendationContextMode = z.infer<typeof RecommendationContextModeSchema>;
export type RecommendationLocationSource = z.infer<typeof RecommendationLocationSourceSchema>;
export type WeatherLocationRef = z.infer<typeof WeatherLocationRefSchema>;
export type ResolvedRecommendationContext = z.infer<typeof ResolvedRecommendationContextSchema>;
export type RecommendationAuditCandidate = z.infer<typeof RecommendationAuditCandidateSchema>;
export type DisplayRecommendation = z.infer<typeof DisplayRecommendationSchema>;
export type RecommendationEngineOutput = z.infer<typeof RecommendationEngineOutputSchema>;
export type DeterministicRiskCode = z.infer<typeof DeterministicRiskCodeSchema>;
export type DeterministicRiskAssessment = z.infer<typeof DeterministicRiskAssessmentSchema>;
export type RecommendationAuditCandidateV3 = z.infer<typeof RecommendationAuditCandidateV3Schema>;
export type DisplayRecommendationV3 = z.infer<typeof DisplayRecommendationV3Schema>;
export type RecommendationEngineOutputV3 = z.infer<typeof RecommendationEngineOutputV3Schema>;
export type RecommendationPayload = z.infer<typeof RecommendationPayloadSchema>;
export type RecommendationPayloadV1 = z.infer<typeof RecommendationPayloadV1Schema>;
export type RecommendationPayloadV2 = z.infer<typeof RecommendationPayloadV2Schema>;
export type RecommendationPayloadV3 = z.infer<typeof RecommendationPayloadV3Schema>;
export type PublishDailyRecommendationCommand = z.infer<typeof PublishDailyRecommendationCommandSchema>;
export type DailyRecommendationRecord = z.infer<typeof DailyRecommendationRecordSchema>;
export type RecommendationJobRunSummary = z.infer<typeof RecommendationJobRunSummarySchema>;
export type RecommendationJobErrorCode = z.infer<typeof RecommendationJobErrorCodeSchema>;
export type RecommendationReadResponse = z.infer<typeof RecommendationReadResponseSchema>;
export type RecommendationDisplayItemV3 = z.infer<typeof RecommendationDisplayItemV3Schema>;
export type ResolveRecommendationsCommand = z.infer<typeof ResolveRecommendationsCommandSchema>;
export type ResolveRecommendationsResponse = z.infer<typeof ResolveRecommendationsResponseSchema>;
export type RecommendationRegenerationRequest = z.infer<typeof RecommendationRegenerationRequestSchema>;
export type ReassessRecommendationCommand = z.infer<typeof ReassessRecommendationCommandSchema>;
