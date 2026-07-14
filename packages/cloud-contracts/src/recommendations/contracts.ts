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
export const RecommendationReasonCodeSchema = z.enum(["good_for_commute", "good_for_business", "good_for_travel", "weather_fit", "rain_ready", "activity_comfort", "historical_success", "rotation_value", "new_combination", "shoe_rationality", "outerwear_rationality", "needs_evening_layer", "rule_fallback"]);
export const CanonicalizerReviewReasonSchema = z.enum(["missing_required_field", "unknown_category", "unknown_subcategory", "unknown_color", "conflicting_season", "invalid_temperature_range", "low_confidence"]);
export const RecommendationMissingFieldCodeSchema = z.enum(["primary_image", "category", "color", "season_or_thermal", "formality"]);
export const RecommendationExclusionCodeSchema = z.enum(["not_current_user", "deleted", "unavailable_status", "missing_primary_image", "missing_required_field", "invalid_formality", "temperature_mismatch", "formality_mismatch", "avoid_rule", "recommendation_blocked"]);
export const Score0To100Schema = z.number().finite().min(0).max(100);
export const RecommendationObjectiveSchema = z.enum(["safe", "fresh", "comfort"]);
export const RecommendationReadinessSchema = z.enum(["ready", "limited", "not_ready"]);
export const RecommendationGenerationModeSchema = z.enum(["rule_only", "paw_enhanced", "rule_fallback"]);

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
export const RecommendationEngineInputSchema = z.object({
  requestId: z.string().uuid(), userId: z.string().uuid(), ruleVersion: z.string().trim().min(1).max(80), asOfDate: RealDateSchema, dateContextInput: DateContextInputSchema, garments: z.array(RecommendationGarmentSchema).max(5000), savedOutfits: z.array(RecommendationSavedOutfitSchema).max(1000), wearHistory: z.array(RecommendationWearHistorySchema).max(5000), feedback: z.array(RecommendationFeedbackSchema).max(5000), anchorGarmentIds: z.array(z.string().uuid()).max(9), pawCandidateEvaluatorEnabled: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (!unique(value.garments.map((garment) => garment.id))) issue(ctx, ["garments"], "garment id must be unique");
  if (!unique(value.savedOutfits.map((outfit) => outfit.id))) issue(ctx, ["savedOutfits"], "outfit id must be unique");
  if (!unique(value.anchorGarmentIds)) issue(ctx, ["anchorGarmentIds"], "anchor garment id must be unique");
  if (value.dateContextInput.date < value.asOfDate) issue(ctx, ["dateContextInput", "date"], "target date must not precede asOfDate");
});

export const RecommendationObjectiveScoresSchema = z.object({ safe: Score0To100Schema, fresh: Score0To100Schema, comfort: Score0To100Schema }).strict();
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

export const RecommendationPayloadSchema = z.object({ engineOutput: RecommendationEngineOutputSchema, dateContextInput: DateContextInputSchema }).strict().superRefine((value, ctx) => {
  if (value.engineOutput.readiness.status === "not_ready" && value.engineOutput.recommendations.length !== 0) issue(ctx, ["engineOutput", "recommendations"], "not_ready output must not display recommendations");
});
export const RecommendationPawProgramVersionsSchema = z.object({ dateContext: z.union([z.literal("disabled"), z.string().trim().min(1).max(80)]), candidateEvaluator: z.union([z.literal("disabled"), z.string().trim().min(1).max(80)]) }).strict();
export const PublishDailyRecommendationCommandSchema = z.object({
  userId: z.string().uuid(), targetDate: RealDateSchema, targetTimezone: TimeZoneSchema, generationBatchId: z.string().uuid(), generationRequestId: z.string().uuid(), readiness: RecommendationReadinessSchema, generationMode: RecommendationGenerationModeSchema, payload: RecommendationPayloadSchema, algorithmVersion: z.string().trim().min(1).max(80), ruleVersion: z.string().trim().min(1).max(80), pawProgramVersions: RecommendationPawProgramVersionsSchema, generatedAt: z.string().datetime(), expiresAt: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  if (value.readiness !== value.payload.engineOutput.readiness.status) issue(ctx, ["readiness"], "readiness must match payload");
  if (value.ruleVersion !== value.payload.engineOutput.ruleVersion) issue(ctx, ["ruleVersion"], "ruleVersion must match payload");
  if (value.targetDate !== value.payload.dateContextInput.date) issue(ctx, ["targetDate"], "targetDate must match payload DateContext input");
  if (value.targetTimezone !== value.payload.dateContextInput.timezone) issue(ctx, ["targetTimezone"], "targetTimezone must match payload DateContext input");
  if (Date.parse(value.expiresAt) <= Date.parse(value.generatedAt)) issue(ctx, ["expiresAt"], "expiresAt must be after generatedAt");
});
export const DailyRecommendationRecordSchema = z.object({
  id: z.string().uuid(), userId: z.string().uuid(), targetDate: RealDateSchema, targetTimezone: TimeZoneSchema, revision: z.number().int().positive(), generationBatchId: z.string().uuid(), generationRequestId: z.string().uuid(), payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/), readiness: RecommendationReadinessSchema, generationMode: RecommendationGenerationModeSchema, isCurrent: z.boolean(), lifecycle: z.enum(["current", "superseded"]), supersededAt: z.string().datetime().nullable(), payload: RecommendationPayloadSchema, algorithmVersion: z.string().trim().min(1).max(80), ruleVersion: z.string().trim().min(1).max(80), pawProgramVersions: RecommendationPawProgramVersionsSchema, generatedAt: z.string().datetime(), expiresAt: z.string().datetime(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  if (value.lifecycle !== (value.isCurrent ? "current" : "superseded")) issue(ctx, ["lifecycle"], "lifecycle must match isCurrent");
  if (value.isCurrent !== (value.supersededAt === null)) issue(ctx, ["supersededAt"], "current records must not have supersededAt");
  if (Date.parse(value.expiresAt) <= Date.parse(value.generatedAt)) issue(ctx, ["expiresAt"], "expiresAt must be after generatedAt");
});

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
export type RecommendationAuditCandidate = z.infer<typeof RecommendationAuditCandidateSchema>;
export type DisplayRecommendation = z.infer<typeof DisplayRecommendationSchema>;
export type RecommendationEngineOutput = z.infer<typeof RecommendationEngineOutputSchema>;
export type RecommendationPayload = z.infer<typeof RecommendationPayloadSchema>;
export type PublishDailyRecommendationCommand = z.infer<typeof PublishDailyRecommendationCommandSchema>;
export type DailyRecommendationRecord = z.infer<typeof DailyRecommendationRecordSchema>;
