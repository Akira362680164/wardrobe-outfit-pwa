import { createHash } from "node:crypto";

import {
  CandidateEvaluationInputSchema,
  CandidateRuleScoresSchema,
  RecommendationEngineInputSchema,
  RecommendationEngineInputV2Schema,
  RecommendationEngineOutputSchema,
  RecommendationEngineOutputV3Schema,
  RecommendationReadinessReportSchema,
  RECOMMENDATION_ALGORITHM_VERSION_V3,
  RECOMMENDATION_REALTIME_RULE_VERSION,
  type CandidateEvaluation,
  type DateContext,
  type GarmentSlot,
  type RecommendationExclusionCode,
  type RecommendationReasonCode,
  type RecommendationEngineInputV2,
  type RecommendationAuditCandidateV3,
  type DisplayRecommendationV3,
  type RecommendationEngineOutputV3,
} from "@wardrobe/cloud-contracts";

import { adaptCandidateEvaluator, createNeutralEvaluation, RuleDateContextResolver } from "./ports.js";
import { calculateObjectiveScores, calculateObjectiveScoresV3, clampScore, daysSinceBucket, daysSinceBucketV3, jaccardSimilarity } from "./scoring.js";
import type {
  DisplayRecommendation,
  RecommendationCandidate,
  RecommendationEngineInput,
  RecommendationEngineOutput,
  RecommendationFeedback,
  RecommendationGarment,
  ScoredGarment,
} from "./types.js";

export const BEAM_WIDTH = 48;
export const MAX_RAW_CANDIDATES = 120;
export const MAX_RULE_SCORED_CANDIDATES = 60;
export const SLOT_LIMITS: Readonly<Record<GarmentSlot, number>> = {
  tops: 12,
  pants: 10,
  skirts: 8,
  one_piece: 8,
  outerwear: 8,
  shoes: 8,
  bag: 6,
  hat: 6,
  accessory: 6,
};

const OUTERWEAR_SUBCATEGORIES = new Set(["suit_jacket", "denim_jacket", "baseball_jacket", "jacket", "padded_fleece", "trench_coat", "overcoat", "down_jacket", "leather_jacket", "fur", "cape"]);
const NEUTRAL_COLORS = new Set(["black", "white", "gray", "grey", "navy", "beige", "brown", "黑", "白", "灰", "深灰", "藏青", "米白", "米", "卡其", "棕"]);
const TEMPLATE_SLOTS: ReadonlyArray<{ template: RecommendationCandidate["template"]; slots: GarmentSlot[]; scenes?: string[] }> = [
  { template: "T1", slots: ["tops", "pants", "shoes"] },
  { template: "T2", slots: ["tops", "pants", "outerwear", "shoes"] },
  { template: "T3", slots: ["tops", "skirts", "shoes"] },
  { template: "T4", slots: ["tops", "skirts", "outerwear", "shoes"] },
  { template: "T5", slots: ["one_piece", "shoes"] },
  { template: "T6", slots: ["one_piece", "outerwear", "shoes"] },
  { template: "T7", slots: ["tops", "pants", "shoes", "bag"], scenes: ["commute", "business", "formal"] },
  { template: "T8", slots: ["tops", "pants", "shoes", "hat"], scenes: ["travel"] },
];

type CandidateEvaluatorFunction = ((input: unknown) => Promise<unknown>) | undefined;

function compareScoreThenId<T extends { candidateId?: string; id?: string }>(score: (value: T) => number): (a: T, b: T) => number {
  return (a, b) => score(b) - score(a) || (a.candidateId ?? a.id ?? "").localeCompare(b.candidateId ?? b.id ?? "");
}

function dateSerial(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function daysBetween(later: string, earlier: string): number {
  return Math.max(0, dateSerial(later) - dateSerial(earlier));
}

function average(values: readonly number[], fallback = 0): number {
  return values.length === 0 ? fallback : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function mapGarmentRole(garment: RecommendationGarment): GarmentSlot | undefined {
  if (garment.category === "tops") return garment.subcategory && OUTERWEAR_SUBCATEGORIES.has(garment.subcategory) ? "outerwear" : "tops";
  if (garment.category === "pants" || garment.category === "skirts" || garment.category === "one_piece" || garment.category === "shoes") return garment.category;
  if (garment.category === "bags") return "bag";
  if (garment.category === "hats") return "hat";
  if (garment.category === "jewelry" || garment.category === "accessories") return "accessory";
  return undefined;
}

function targetTemperatureRange(context: DateContext, input: RecommendationEngineInput): [number, number] {
  const evidence = input.dateContextInput.weatherEvidence;
  const min = evidence.feelsLikeMinC ?? evidence.temperatureMinC;
  const max = evidence.feelsLikeMaxC ?? evidence.temperatureMaxC;
  if (min !== undefined && max !== undefined) return [min, max];
  if (min !== undefined) return [min, min];
  if (max !== undefined) return [max, max];
  if (context.thermalStrategy === "cooling") return [30, 40];
  if (context.thermalStrategy === "light") return [23, 30];
  if (context.thermalStrategy === "balanced") return [15, 23];
  if (context.thermalStrategy === "layer") return [7, 15];
  return [-20, 7];
}

function inferredGarmentRange(garment: RecommendationGarment): [number, number] | undefined {
  if (garment.temperatureMinC !== undefined && garment.temperatureMaxC !== undefined) return [garment.temperatureMinC, garment.temperatureMaxC];
  if (garment.warmth === undefined) return undefined;
  const ranges: Record<number, [number, number]> = { 1: [25, 45], 2: [18, 32], 3: [10, 24], 4: [0, 15], 5: [-30, 8] };
  return ranges[garment.warmth];
}

const RANGE_WIDTH_CAP_C = 20;
const CANDIDATE_COVERAGE_CAP_C = 30;
const REMOVABLE_LAYER_TEMPLATES = new Set<RecommendationCandidate["template"]>(["T2", "T4", "T6"]);
const CORE_ROLES = new Set<GarmentSlot>(["tops", "pants", "skirts", "one_piece"]);
const WEARABLE_ROLES = new Set<GarmentSlot>(["tops", "pants", "skirts", "one_piece", "outerwear", "shoes"]);

function warmthScore(garment: RecommendationGarment): number {
  return garment.warmth === 1 || garment.warmth === 5 ? 0 : garment.warmth === 2 || garment.warmth === 4 ? 75 : garment.warmth === 3 ? 100 : 50;
}

function seasonBreadthScore(garment: RecommendationGarment): number {
  if (garment.seasons.includes("all")) return 100;
  const count = new Set(garment.seasons.filter((season) => season !== "all")).size;
  return clampScore(count * 25);
}

function environmentCompletenessScore(garment: RecommendationGarment): number {
  const count = Number(garment.warmth !== undefined) + Number(garment.seasons.length > 0) + Number(garment.temperatureMinC !== undefined && garment.temperatureMaxC !== undefined);
  return clampScore(count / 3 * 100);
}

export function calculateItemAdaptabilityFit(garment: RecommendationGarment): number {
  const role = mapGarmentRole(garment);
  if (role && ["bag", "hat", "accessory"].includes(role)) return 50;
  const range = inferredGarmentRange(garment);
  const rangeWidthScore = range ? clampScore(Math.min(range[1] - range[0], RANGE_WIDTH_CAP_C) / RANGE_WIDTH_CAP_C * 100) : 0;
  return clampScore(
    0.35 * rangeWidthScore
    + 0.30 * warmthScore(garment)
    + 0.20 * seasonBreadthScore(garment)
    + 0.15 * environmentCompletenessScore(garment),
  );
}

function intervalWidth(interval: [number, number]): number {
  return Math.max(0, interval[1] - interval[0]);
}

function unionWidth(left: [number, number], right?: [number, number]): number {
  if (!right) return intervalWidth(left);
  const overlap = Math.max(0, Math.min(left[1], right[1]) - Math.max(left[0], right[0]));
  return intervalWidth(left) + intervalWidth(right) - overlap;
}

export function calculateCandidateAdaptabilityFit(
  garments: readonly RecommendationGarment[],
  template: RecommendationCandidate["template"],
): number {
  const withRoles = garments.map((garment) => ({ garment, role: mapGarmentRole(garment) }));
  const core = withRoles.filter((item) => item.role && CORE_ROLES.has(item.role)).map((item) => item.garment);
  const wearable = withRoles.filter((item) => item.role && WEARABLE_ROLES.has(item.role)).map((item) => item.garment);
  const coreRanges = core.map(inferredGarmentRange);
  let baseRange: [number, number] | undefined;
  if (core.length > 0 && coreRanges.every((range): range is [number, number] => Boolean(range))) {
    const min = Math.max(...coreRanges.map((range) => range![0]));
    const max = Math.min(...coreRanges.map((range) => range![1]));
    if (min <= max) baseRange = [min, max];
  }
  const outerwear = withRoles.find((item) => item.role === "outerwear")?.garment;
  const removableLayer = Boolean(baseRange && outerwear && REMOVABLE_LAYER_TEMPLATES.has(template));
  const outerRange = removableLayer && outerwear ? inferredGarmentRange(outerwear) : undefined;
  const coverageScore = baseRange ? clampScore(Math.min(unionWidth(baseRange, outerRange), CANDIDATE_COVERAGE_CAP_C) / CANDIDATE_COVERAGE_CAP_C * 100) : 0;
  const layeringScore = removableLayer ? 100 : baseRange ? 50 : 0;
  const versatilityScore = clampScore(
    0.40 * average(wearable.map(seasonBreadthScore))
    + 0.40 * average(wearable.map(warmthScore))
    + 0.20 * layeringScore,
  );
  const informationCompleteness = average(wearable.map(environmentCompletenessScore));
  const hotExtreme = (garment: RecommendationGarment) => garment.warmth === 1 || (inferredGarmentRange(garment)?.[0] ?? -Infinity) >= 25;
  const coldExtreme = (garment: RecommendationGarment) => garment.warmth === 5 || (inferredGarmentRange(garment)?.[1] ?? Infinity) <= 8;
  const extremeSingleCombinationPenalty = !outerwear && core.length > 0 && (core.every(hotExtreme) || core.every(coldExtreme)) ? 20 : 0;
  return clampScore(
    0.35 * coverageScore
    + 0.30 * layeringScore
    + 0.20 * versatilityScore
    + 0.15 * informationCompleteness
    - extremeSingleCombinationPenalty,
  );
}

function intervalDistance(left: [number, number], right: [number, number]): number {
  if (left[1] < right[0]) return right[0] - left[1];
  if (right[1] < left[0]) return left[0] - right[1];
  return 0;
}

function avoidRuleHit(garment: RecommendationGarment, context: DateContext): boolean {
  const material = garment.material?.toLowerCase() ?? "";
  const subcategory = garment.subcategory ?? "";
  return (
    (context.avoidRules.includes("avoid_suede") && (material.includes("suede") || material.includes("麂皮"))) ||
    (context.avoidRules.includes("avoid_heavy_outerwear") && mapGarmentRole(garment) === "outerwear" && (garment.warmth ?? 0) >= 4) ||
    (context.avoidRules.includes("avoid_light_colors") && garment.colors.some((color) => ["white", "beige", "cream", "白", "米白", "米"].includes(color))) ||
    (context.avoidRules.includes("avoid_high_heels") && subcategory === "high_heels") ||
    (context.avoidRules.includes("avoid_non_breathable") && ["leather", "polyurethane", "pvc", "皮革", "人造革"].some((value) => material.includes(value))) ||
    (context.avoidRules.includes("avoid_open_toe_shoes") && ["sandals", "slippers", "clogs"].includes(subcategory))
  );
}

export function hardFilterGarments(
  garments: readonly RecommendationGarment[],
  context: DateContext,
  input: RecommendationEngineInput,
  contextMode: "forecast" | "generic" = "forecast",
): { eligible: RecommendationGarment[]; exclusions: Array<{ garmentId: string; codes: RecommendationExclusionCode[] }> } {
  const target = targetTemperatureRange(context, input);
  const eligible: RecommendationGarment[] = [];
  const exclusions: Array<{ garmentId: string; codes: RecommendationExclusionCode[] }> = [];
  for (const garment of [...garments].sort((a, b) => a.id.localeCompare(b.id))) {
    const codes: RecommendationExclusionCode[] = [];
    const role = mapGarmentRole(garment);
    if (garment.userId !== input.userId) codes.push("not_current_user");
    if (garment.deleted) codes.push("deleted");
    if (["archived", "laundry", "repair"].includes(garment.status)) codes.push("unavailable_status");
    if (!garment.hasPrimaryImage) codes.push("missing_primary_image");
    if (!garment.category || !role || garment.colors.length === 0 || (garment.temperatureMinC === undefined && garment.temperatureMaxC === undefined && garment.seasons.length === 0 && garment.warmth === undefined)) codes.push("missing_required_field");
    if (garment.temperatureMinC !== undefined && garment.temperatureMaxC !== undefined && garment.temperatureMinC > garment.temperatureMaxC) codes.push("missing_required_field");
    if (garment.formality === undefined) codes.push("missing_required_field");
    else if (!Number.isInteger(garment.formality) || garment.formality < 1 || garment.formality > 5) codes.push("invalid_formality");
    else if (Math.abs(garment.formality - context.formalityTarget) >= 3) codes.push("formality_mismatch");
    const range = inferredGarmentRange(garment);
    if (contextMode === "forecast" && range && role && !["outerwear", "bag", "hat", "accessory"].includes(role) && intervalDistance(range, target) > 8) codes.push("temperature_mismatch");
    if (avoidRuleHit(garment, context)) codes.push("avoid_rule");
    if (garment.recommendationBlocked) codes.push("recommendation_blocked");
    const unique = [...new Set(codes)];
    if (unique.length > 0) exclusions.push({ garmentId: garment.id, codes: unique });
    else eligible.push(garment);
  }
  return { eligible, exclusions };
}

function latestWearDays(garmentId: string, input: RecommendationEngineInput): number | undefined {
  const days = input.wearHistory.filter((event) => event.garmentIds.includes(garmentId)).map((event) => daysBetween(input.asOfDate, event.wornDate));
  return days.length === 0 ? undefined : Math.min(...days);
}

function feedbackForGarment(garmentId: string, context: DateContext, input: RecommendationEngineInput): RecommendationFeedback[] {
  return input.feedback.filter((entry) => entry.sceneType === context.sceneType && entry.garmentIds.includes(garmentId));
}

function weatherFit(garment: RecommendationGarment, context: DateContext, input: RecommendationEngineInput): number {
  const range = inferredGarmentRange(garment);
  if (!range) return 50;
  return clampScore(100 - intervalDistance(range, targetTemperatureRange(context, input)) * 10);
}

function sceneFit(garment: RecommendationGarment, context: DateContext): number {
  const preferred = context.sceneType === "business" || context.sceneType === "formal" ? ["commute", "elegant"] : context.sceneType === "travel" ? ["outdoor", "vacation", "casual"] : context.sceneType === "commute" ? ["commute", "elegant"] : ["casual", "outdoor"];
  return garment.styles.some((style) => preferred.includes(style)) ? 100 : garment.styles.length === 0 ? 50 : 60;
}

function activityComfort(garment: RecommendationGarment, context: DateContext): number {
  let score = 85;
  if (context.activityIntensity >= 4 && garment.subcategory === "high_heels") score -= 60;
  if (context.activityIntensity >= 4 && garment.subcategory === "sneakers") score += 15;
  if (context.thermalStrategy === "cooling" && (garment.warmth ?? 3) >= 4) score -= 40;
  return clampScore(score);
}

function informationCompleteness(garment: RecommendationGarment): number {
  const fields = [garment.hasPrimaryImage, Boolean(garment.category), garment.colors.length > 0, garment.seasons.length > 0, garment.formality !== undefined, garment.warmth !== undefined, garment.temperatureMinC !== undefined && garment.temperatureMaxC !== undefined];
  return clampScore((fields.filter(Boolean).length / fields.length) * 100);
}

export function preScoreGarment(garment: RecommendationGarment, context: DateContext, input: RecommendationEngineInput, contextMode: "forecast" | "generic" = "forecast", scoringVersion: "legacy" | "v3" = "legacy"): ScoredGarment {
  const days = scoringVersion === "v3" ? daysSinceBucketV3(latestWearDays(garment.id, input)) : daysSinceBucket(latestWearDays(garment.id, input));
  const feedback = feedbackForGarment(garment.id, context, input);
  const positiveCount = feedback.filter((entry) => entry.sentiment === "positive").length;
  const negativeCount = feedback.filter((entry) => entry.sentiment !== "positive").length;
  const historicalPreference = clampScore(50 + positiveCount * 10 - negativeCount * 15);
  const negativeFeedbackPenalty = feedback.some((entry) => entry.sentiment === "severe_negative") ? 20 : feedback.some((entry) => entry.sentiment === "moderate_negative") ? 10 : 0;
  const audit = {
    weatherFit: contextMode === "forecast" ? weatherFit(garment, context, input) : calculateItemAdaptabilityFit(garment),
    sceneFit: sceneFit(garment, context),
    formalityFit: clampScore(100 - Math.abs((garment.formality ?? context.formalityTarget) - context.formalityTarget) * 25),
    activityComfort: activityComfort(garment, context),
    rotationValue: days.rotationValue,
    historicalPreference,
    informationCompleteness: informationCompleteness(garment),
    repeatPenalty: days.repeatPenalty,
    negativeFeedbackPenalty,
  };
  const preScore = clampScore(0.25 * audit.weatherFit + 0.20 * audit.sceneFit + 0.15 * audit.formalityFit + 0.15 * audit.activityComfort + 0.10 * audit.rotationValue + 0.10 * audit.historicalPreference + 0.05 * audit.informationCompleteness - audit.repeatPenalty - audit.negativeFeedbackPenalty);
  return { ...garment, role: mapGarmentRole(garment)!, preScore, scoreAudit: audit };
}

export function pruneGarmentsBySlot(
  garments: readonly RecommendationGarment[],
  context: DateContext,
  input: RecommendationEngineInput,
  contextMode: "forecast" | "generic" = "forecast",
  scoringVersion: "legacy" | "v3" = "legacy",
): Partial<Record<GarmentSlot, ScoredGarment[]>> {
  const { eligible } = hardFilterGarments(garments, context, input, contextMode);
  const grouped: Partial<Record<GarmentSlot, ScoredGarment[]>> = {};
  for (const garment of eligible) {
    const scored = preScoreGarment(garment, context, input, contextMode, scoringVersion);
    (grouped[scored.role] ??= []).push(scored);
  }
  for (const slot of Object.keys(grouped) as GarmentSlot[]) {
    grouped[slot] = grouped[slot]!.sort(compareScoreThenId((item) => item.preScore)).slice(0, SLOT_LIMITS[slot]);
  }
  return grouped;
}

function templateForGarments(items: readonly ScoredGarment[], context: DateContext): RecommendationCandidate["template"] | undefined {
  const roles = new Set(items.map((item) => item.role));
  const matches = (slots: GarmentSlot[]) => slots.length === roles.size && slots.every((slot) => roles.has(slot));
  for (const definition of TEMPLATE_SLOTS) {
    if ((!definition.scenes || definition.scenes.includes(context.sceneType)) && matches(definition.slots)) return definition.template;
  }
  return undefined;
}

function satisfiesRequiredSlots(slots: readonly GarmentSlot[], context: DateContext): boolean {
  const roles = new Set(slots);
  return context.requiredSlots.every((required) => {
    if (required === "tops" && roles.has("one_piece")) return true;
    if (required === "pants" && (roles.has("skirts") || roles.has("one_piece"))) return true;
    if (required === "skirts" && (roles.has("pants") || roles.has("one_piece"))) return true;
    return roles.has(required);
  });
}

export async function satisfiesCurrentRequiredSlots(slots: readonly GarmentSlot[], input: RecommendationEngineInputV2): Promise<boolean> {
  return satisfiesRequiredSlots(slots, await new RuleDateContextResolver().resolve(input.dateContextInput));
}

export async function validateRecommendationCandidateCurrent(
  input: RecommendationEngineInputV2,
  candidate: { template?: string; deterministicRiskAssessment?: { blockingCodes?: readonly string[] } },
  selectedIds: readonly string[],
): Promise<Array<{ garment: RecommendationGarment; role: GarmentSlot }>> {
  const context = await new RuleDateContextResolver().resolve(input.dateContextInput);
  const eligible = new Map(hardFilterGarments(input.garments, context, input, input.resolvedContext.contextMode === "forecast" ? "forecast" : "generic").eligible.map((garment) => [garment.id, garment]));
  const selection = selectedIds.map((id) => {
    const garment = eligible.get(id);
    const role = garment && mapGarmentRole(garment);
    if (!garment || !role) throw new Error("recommendation_no_longer_valid");
    return { garment, role };
  });
  if (!candidate.template) return selection;
  const definition = TEMPLATE_SLOTS.find((item) => item.template === candidate.template);
  const roles = selection.map((item) => item.role).sort();
  if (!definition || (definition.scenes && !definition.scenes.includes(context.sceneType))
    || JSON.stringify(roles) !== JSON.stringify([...definition.slots].sort())
    || !satisfiesRequiredSlots(roles, context)
    || (candidate.deterministicRiskAssessment?.blockingCodes?.length ?? 0) > 0) {
    throw new Error("recommendation_no_longer_valid");
  }
  return selection;
}

interface RawCandidate {
  garmentIds: string[];
  source: RecommendationCandidate["source"];
  sourceOutfitId?: string;
  template: RecommendationCandidate["template"];
  beamScore: number;
}

function candidateKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function buildRawCandidates(
  grouped: Partial<Record<GarmentSlot, ScoredGarment[]>>,
  context: DateContext,
  input: RecommendationEngineInput,
): { candidates: RawCandidate[]; maxBeamObserved: number } {
  const byId = new Map(Object.values(grouped).flatMap((items) => items ?? []).map((item) => [item.id, item]));
  const candidates: RawCandidate[] = [];
  let maxBeamObserved = 0;
  const push = (candidate: RawCandidate) => {
    if (candidates.length < MAX_RAW_CANDIDATES) candidates.push(candidate);
  };

  for (const outfit of [...input.savedOutfits].sort((a, b) => a.id.localeCompare(b.id))) {
    if (outfit.userId !== input.userId) continue;
    const items = outfit.garmentIds.map((id) => byId.get(id)).filter((item): item is ScoredGarment => Boolean(item));
    if (items.length !== outfit.garmentIds.length) continue;
    const template = templateForGarments(items, context);
    if (!template || !satisfiesRequiredSlots(items.map((item) => item.role), context)) continue;
    push({ garmentIds: items.map((item) => item.id), source: "saved_outfit", sourceOutfitId: outfit.id, template, beamScore: average(items.map((item) => item.preScore)) });
    for (const original of items) {
      for (const replacement of (grouped[original.role] ?? []).filter((item) => item.id !== original.id).slice(0, 3)) {
        const variant = items.map((item) => item.id === original.id ? replacement : item);
        push({ garmentIds: variant.map((item) => item.id), source: "adapted_outfit", sourceOutfitId: outfit.id, template, beamScore: average(variant.map((item) => item.preScore)) });
      }
    }
  }

  for (const definition of TEMPLATE_SLOTS) {
    if (definition.scenes && !definition.scenes.includes(context.sceneType)) continue;
    if (!satisfiesRequiredSlots(definition.slots, context)) continue;
    if (definition.slots.some((slot) => (grouped[slot]?.length ?? 0) === 0)) continue;
    let beam: ScoredGarment[][] = [[]];
    for (const slot of definition.slots) {
      const next: ScoredGarment[][] = [];
      for (const partial of beam) {
        for (const item of grouped[slot] ?? []) next.push([...partial, item]);
      }
      beam = next.sort((a, b) => average(b.map((item) => item.preScore)) - average(a.map((item) => item.preScore)) || candidateKey(a.map((item) => item.id)).localeCompare(candidateKey(b.map((item) => item.id)))).slice(0, BEAM_WIDTH);
      maxBeamObserved = Math.max(maxBeamObserved, beam.length);
    }
    for (const items of beam) {
      const anchored = input.anchorGarmentIds.some((id) => items.some((item) => item.id === id));
      if (input.anchorGarmentIds.length > 0 && !anchored) continue;
      push({ garmentIds: items.map((item) => item.id), source: anchored ? "anchor_generated" : "generated", template: definition.template, beamScore: average(items.map((item) => item.preScore)) + (anchored ? 2 : 0) });
    }
  }

  const unique = new Map<string, RawCandidate>();
  const sourceRank: Record<RawCandidate["source"], number> = { saved_outfit: 4, adapted_outfit: 3, anchor_generated: 2, generated: 1 };
  for (const candidate of candidates) {
    const key = candidateKey(candidate.garmentIds);
    const current = unique.get(key);
    if (!current || sourceRank[candidate.source] > sourceRank[current.source] || (sourceRank[candidate.source] === sourceRank[current.source] && candidate.beamScore > current.beamScore)) unique.set(key, candidate);
  }
  return { candidates: [...unique.values()].sort((a, b) => b.beamScore - a.beamScore || candidateKey(a.garmentIds).localeCompare(candidateKey(b.garmentIds))).slice(0, MAX_RAW_CANDIDATES), maxBeamObserved };
}

function matchingFeedback(candidateIds: readonly string[], context: DateContext, input: RecommendationEngineInput): RecommendationFeedback[] {
  const key = candidateKey(candidateIds);
  return input.feedback.filter((entry) => entry.sceneType === context.sceneType && candidateKey(entry.garmentIds) === key);
}

function candidateHistory(candidateIds: readonly string[], input: RecommendationEngineInput): Array<{ days: number; jaccard: number; exact: boolean }> {
  const key = candidateKey(candidateIds);
  return input.wearHistory.map((entry) => ({ days: daysBetween(input.asOfDate, entry.wornDate), jaccard: jaccardSimilarity(candidateIds, entry.garmentIds), exact: candidateKey(entry.garmentIds) === key }));
}

function colorHarmony(items: readonly ScoredGarment[]): number {
  const colors = items.flatMap((item) => item.colors);
  const unique = new Set(colors);
  if (unique.size <= 2) return 100;
  if (colors.some((color) => NEUTRAL_COLORS.has(color))) return 80;
  return 60;
}

function styleCoherence(items: readonly ScoredGarment[]): number {
  if (items.every((item) => item.styles.length === 0)) return 50;
  const counts = new Map<string, number>();
  for (const item of items) for (const style of item.styles) counts.set(style, (counts.get(style) ?? 0) + 1);
  const maximum = Math.max(0, ...counts.values());
  return clampScore((maximum / items.length) * 100);
}

function scoreCandidate(raw: RawCandidate, byId: Map<string, ScoredGarment>, context: DateContext, input: RecommendationEngineInput, contextMode: "forecast" | "generic"): RecommendationCandidate {
  const items = raw.garmentIds.map((id) => byId.get(id)!);
  const history = candidateHistory(raw.garmentIds, input);
  const feedback = matchingFeedback(raw.garmentIds, context, input);
  const repeatPenalty = history.some((entry) => entry.exact && entry.days <= 3) ? 25 : history.some((entry) => entry.days <= 7 && entry.jaccard > 0.70) ? 10 : 0;
  const feedbackPenalty = feedback.some((entry) => entry.sentiment === "severe_negative") ? 30 : feedback.some((entry) => entry.sentiment === "moderate_negative") ? 10 : 0;
  const saved = raw.source === "saved_outfit" ? input.savedOutfits.find((outfit) => outfit.id === raw.sourceOutfitId) : undefined;
  const successBonus = Math.min(5, saved?.successfulWearCount ?? 0);
  const rotationValue = average(items.map((item) => item.scoreAudit.rotationValue));
  const weather = average(items.map((item) => item.scoreAudit.weatherFit));
  const scene = average(items.map((item) => item.scoreAudit.sceneFit));
  const activity = average(items.map((item) => item.scoreAudit.activityComfort));
  const completeness = average(items.map((item) => item.scoreAudit.informationCompleteness));
  const rain = input.dateContextInput.weatherEvidence.rainProbability ?? 0;
  const hasRainLayer = items.some((item) => item.role === "outerwear" && ["trench_coat", "jacket"].includes(item.subcategory ?? ""));
  const weatherWithStrategy = contextMode === "forecast"
    ? clampScore(weather + (rain >= 50 && hasRainLayer ? 12 : 0))
    : calculateCandidateAdaptabilityFit(items, raw.template);
  const ruleTotal = clampScore(0.25 * weatherWithStrategy + 0.20 * scene + 0.15 * 100 + 0.15 * colorHarmony(items) + 0.10 * styleCoherence(items) + 0.10 * activity + 0.05 * rotationValue + successBonus - repeatPenalty - feedbackPenalty);
  const ruleScores = CandidateRuleScoresSchema.parse({ weatherFit: weatherWithStrategy, sceneFit: scene, structure: 100, colorHarmony: colorHarmony(items), styleCoherence: styleCoherence(items), activityComfort: activity, rotationValue, informationCompleteness: completeness, ruleTotal });
  const seen = history.some((entry) => entry.exact);
  const combinationNovelty = seen ? 20 : raw.source === "saved_outfit" ? 50 : raw.source === "adapted_outfit" ? 75 : 100;
  const reasonCodes: RecommendationReasonCode[] = [];
  if (context.sceneType === "commute") reasonCodes.push("good_for_commute");
  if (["business", "formal"].includes(context.sceneType)) reasonCodes.push("good_for_business");
  if (context.sceneType === "travel") reasonCodes.push("good_for_travel");
  if (contextMode === "forecast" && weatherWithStrategy >= 75) reasonCodes.push("weather_fit");
  if (contextMode === "generic" && weatherWithStrategy >= 75) reasonCodes.push("adaptable_conditions");
  if (contextMode === "forecast" && rain >= 50 && hasRainLayer) reasonCodes.push("rain_ready");
  if (activity >= 80) reasonCodes.push("activity_comfort");
  if ((saved?.successfulWearCount ?? 0) > 0) reasonCodes.push("historical_success");
  if (rotationValue >= 70) reasonCodes.push("rotation_value");
  if (combinationNovelty >= 75) reasonCodes.push("new_combination");
  if (items.some((item) => item.role === "shoes" && item.scoreAudit.activityComfort >= 80)) reasonCodes.push("shoe_rationality");
  if (items.some((item) => item.role === "outerwear")) reasonCodes.push("outerwear_rationality");
  return {
    candidateId: deterministicUuid(`${input.ruleVersion}:${input.userId}:${input.dateContextInput.date}:${candidateKey(raw.garmentIds)}`),
    garmentIds: [...raw.garmentIds].sort(),
    source: raw.source,
    sourceOutfitId: raw.sourceOutfitId,
    template: raw.template,
    ruleScores,
    combinationNovelty,
    longUnwornValue: rotationValue,
    savedOrHistoricalSuccess: clampScore((saved?.successfulWearCount ?? 0) > 0 ? 100 : history.some((entry) => entry.exact && entry.days > 6) ? 70 : 50),
    styleVariation: clampScore(combinationNovelty * 0.7 + (100 - styleCoherence(items)) * 0.3),
    historicalThermalAndDiscomfortFit: feedback.some((entry) => entry.sentiment === "severe_negative") ? 20 : feedback.some((entry) => entry.sentiment === "moderate_negative") ? 50 : feedback.some((entry) => entry.sentiment === "positive") ? 90 : 70,
    shoeAndOuterwearRationality: clampScore(average(items.filter((item) => item.role === "shoes" || item.role === "outerwear").map((item) => item.scoreAudit.activityComfort), 75)),
    pawEvaluation: createNeutralEvaluation("00000000-0000-4000-8000-000000000000"),
    objectiveScores: { safe: 0, fresh: 0, comfort: 0 },
    reasonCodes: [...new Set(reasonCodes)],
    riskCodes: [],
    missingSlotCodes: [],
  };
}

function buildShortlist(candidates: readonly RecommendationCandidate[]): RecommendationCandidate[] {
  const selected = new Map<string, RecommendationCandidate>();
  const add = (items: readonly RecommendationCandidate[]) => items.forEach((candidate) => selected.set(candidate.candidateId, candidate));
  add([...candidates].sort(compareScoreThenId((item) => item.ruleScores.ruleTotal)).slice(0, 8));
  add([...candidates].sort(compareScoreThenId((item) => item.ruleScores.rotationValue)).slice(0, 4));
  add([...candidates].sort(compareScoreThenId((item) => item.ruleScores.activityComfort)).slice(0, 4));
  add([...candidates].sort((a, b) =>
    b.combinationNovelty - a.combinationNovelty ||
    Number(b.source === "anchor_generated") - Number(a.source === "anchor_generated") ||
    a.candidateId.localeCompare(b.candidateId),
  ).slice(0, 2));
  if (selected.size < 12) add([...candidates].sort(compareScoreThenId((item) => item.ruleScores.ruleTotal)).slice(0, 12));
  return [...selected.values()].sort(compareScoreThenId((item) => item.ruleScores.ruleTotal)).slice(0, 18);
}

function pawRiskAvoidance(evaluation: CandidateEvaluation): number {
  if (evaluation.fallbackUsed) return 50;
  if (evaluation.sceneRisks.length === 0) return 100;
  const severe = new Set(["too_cold", "too_hot", "missing_required_layer"]);
  const medium = new Set(["rain_exposure", "wind_exposure", "formality_mismatch", "activity_mismatch"]);
  if (evaluation.sceneRisks.some((risk) => severe.has(risk))) return 0;
  if (evaluation.sceneRisks.some((risk) => medium.has(risk))) return 40;
  return 70;
}

function withEvaluation(candidate: RecommendationCandidate, evaluation: CandidateEvaluation): RecommendationCandidate {
  const weatherAndActivityFit = clampScore(0.6 * candidate.ruleScores.weatherFit + 0.4 * candidate.ruleScores.activityComfort);
  const objectiveScores = calculateObjectiveScores({
    ruleScore: candidate.ruleScores.ruleTotal,
    pawSemanticFit: evaluation.semanticFit,
    savedOrHistoricalSuccess: candidate.savedOrHistoricalSuccess,
    informationCompleteness: candidate.ruleScores.informationCompleteness,
    longUnwornValue: candidate.longUnwornValue,
    newCombinationValue: candidate.combinationNovelty,
    styleVariation: candidate.styleVariation,
    weatherAndActivityFit,
    historicalThermalAndDiscomfortFit: candidate.historicalThermalAndDiscomfortFit,
    pawSceneRiskAvoidance: pawRiskAvoidance(evaluation),
    shoeAndOuterwearRationality: candidate.shoeAndOuterwearRationality,
  });
  return {
    ...candidate,
    pawEvaluation: evaluation,
    objectiveScores,
    reasonCodes: [...new Set([...candidate.reasonCodes, ...evaluation.reasonCodes])],
    riskCodes: evaluation.sceneRisks,
    missingSlotCodes: evaluation.missingSlots,
  };
}

function deterministicRiskAssessment(items: readonly ScoredGarment[], context: DateContext, input: RecommendationEngineInput) {
  const warningCodes: Array<"shoe_activity_mismatch" | "wind_rain_exposure"> = [];
  const advisoryCodes: Array<"outerwear_recommended" | "evening_layer_recommended"> = [];
  const shoes = items.find((item) => item.role === "shoes");
  const hasOuterwear = items.some((item) => item.role === "outerwear");
  const weather = input.dateContextInput.weatherEvidence;
  if (shoes && shoes.scoreAudit.activityComfort < 60) warningCodes.push("shoe_activity_mismatch");
  if (!hasOuterwear && ((weather.windLevel ?? 0) >= 6 || (weather.rainProbability ?? 0) >= 40)) warningCodes.push("wind_rain_exposure");
  if (!hasOuterwear && ["layer", "warm"].includes(context.thermalStrategy)) advisoryCodes.push("outerwear_recommended");
  if (!hasOuterwear && context.optionalSlots.includes("outerwear")) advisoryCodes.push("evening_layer_recommended");
  return { blockingCodes: [], warningCodes: [...new Set(warningCodes)], advisoryCodes: [...new Set(advisoryCodes)] };
}

function toV3Candidate(candidate: RecommendationCandidate, byId: Map<string, ScoredGarment>, context: DateContext, input: RecommendationEngineInput): RecommendationAuditCandidateV3 {
  const items = candidate.garmentIds.map((id) => byId.get(id)!);
  const weatherAndActivityFit = clampScore(0.6 * candidate.ruleScores.weatherFit + 0.4 * candidate.ruleScores.activityComfort);
  const objectiveScores = calculateObjectiveScoresV3({
    ruleScore: candidate.ruleScores.ruleTotal,
    savedOrHistoricalSuccess: candidate.savedOrHistoricalSuccess,
    informationCompleteness: candidate.ruleScores.informationCompleteness,
    rotationValue: candidate.ruleScores.rotationValue,
    combinationNovelty: candidate.combinationNovelty,
    styleVariation: candidate.styleVariation,
    weatherAndActivityFit,
    historicalThermalAndDiscomfortFit: candidate.historicalThermalAndDiscomfortFit,
    shoeAndOuterwearRationality: candidate.shoeAndOuterwearRationality,
  });
  return {
    candidateId: candidate.candidateId,
    garmentIds: candidate.garmentIds,
    source: candidate.source,
    ...(candidate.sourceOutfitId ? { sourceOutfitId: candidate.sourceOutfitId } : {}),
    template: candidate.template,
    ruleScores: candidate.ruleScores,
    combinationNovelty: candidate.combinationNovelty,
    rotationValue: candidate.ruleScores.rotationValue,
    savedOrHistoricalSuccess: candidate.savedOrHistoricalSuccess,
    styleVariation: candidate.styleVariation,
    historicalThermalAndDiscomfortFit: candidate.historicalThermalAndDiscomfortFit,
    shoeAndOuterwearRationality: candidate.shoeAndOuterwearRationality,
    deterministicRiskAssessment: deterministicRiskAssessment(items, context, input),
    objectiveScores,
    reasonCodes: candidate.reasonCodes.filter((code) => code !== "rule_fallback"),
    missingSlotCodes: candidate.missingSlotCodes,
  };
}

function selectV3AtThreshold(candidates: readonly RecommendationAuditCandidateV3[], threshold: number): DisplayRecommendationV3[] {
  const order = (objective: "safe" | "fresh" | "comfort") => (a: RecommendationAuditCandidateV3, b: RecommendationAuditCandidateV3) =>
    b.objectiveScores[objective] - a.objectiveScores[objective] ||
    (objective === "fresh" ? b.rotationValue - a.rotationValue : 0) ||
    (objective === "comfort" ? b.ruleScores.activityComfort - a.ruleScores.activityComfort : 0) ||
    a.candidateId.localeCompare(b.candidateId);
  const safe = [...candidates].sort(order("safe"))[0];
  if (!safe) return [];
  const selected: DisplayRecommendationV3[] = [{ ...safe, objective: "safe", finalScore: safe.objectiveScores.safe }];
  const fresh = [...candidates].filter((item) => item.candidateId !== safe.candidateId && jaccardSimilarity(item.garmentIds, safe.garmentIds) <= threshold).sort(order("fresh"))[0];
  if (fresh) selected.push({ ...fresh, objective: "fresh", finalScore: fresh.objectiveScores.fresh });
  const comfort = [...candidates].filter((item) => !selected.some((chosen) => chosen.candidateId === item.candidateId) && selected.every((chosen) => jaccardSimilarity(item.garmentIds, chosen.garmentIds) <= threshold)).sort(order("comfort"))[0];
  if (comfort) selected.push({ ...comfort, objective: "comfort", finalScore: comfort.objectiveScores.comfort });
  return selected;
}

function selectDiverseV3(candidates: readonly RecommendationAuditCandidateV3[]): DisplayRecommendationV3[] {
  const strict = selectV3AtThreshold(candidates, 0.50);
  return strict.length === 3 ? strict : selectV3AtThreshold(candidates, 0.67);
}

function selectAtThreshold(candidates: readonly RecommendationCandidate[], threshold: number): DisplayRecommendation[] {
  const objectiveOrder = (objective: "safe" | "fresh" | "comfort") => (a: RecommendationCandidate, b: RecommendationCandidate): number => {
    const scoreDifference = b.objectiveScores[objective] - a.objectiveScores[objective];
    if (scoreDifference !== 0) return scoreDifference;
    if (objective === "safe") {
      const weatherDifference = Number(b.reasonCodes.includes("rain_ready")) - Number(a.reasonCodes.includes("rain_ready"));
      if (weatherDifference !== 0) return weatherDifference;
    }
    if (objective === "fresh") {
      const rotationDifference = b.longUnwornValue - a.longUnwornValue;
      if (rotationDifference !== 0) return rotationDifference;
    }
    if (objective === "comfort") {
      const comfortDifference = b.ruleScores.activityComfort - a.ruleScores.activityComfort;
      if (comfortDifference !== 0) return comfortDifference;
    }
    return a.candidateId.localeCompare(b.candidateId);
  };
  const safe = [...candidates].sort(objectiveOrder("safe"))[0];
  if (!safe) return [];
  const selected: DisplayRecommendation[] = [{ ...safe, objective: "safe", finalScore: safe.objectiveScores.safe }];
  const fresh = [...candidates].filter((item) => item.candidateId !== safe.candidateId && jaccardSimilarity(item.garmentIds, safe.garmentIds) <= threshold).sort(objectiveOrder("fresh"))[0];
  if (fresh) selected.push({ ...fresh, objective: "fresh", finalScore: fresh.objectiveScores.fresh });
  const comfort = [...candidates].filter((item) => !selected.some((chosen) => chosen.candidateId === item.candidateId) && selected.every((chosen) => jaccardSimilarity(item.garmentIds, chosen.garmentIds) <= threshold)).sort(objectiveOrder("comfort"))[0];
  if (comfort) selected.push({ ...comfort, objective: "comfort", finalScore: comfort.objectiveScores.comfort });
  return selected;
}

function selectDiverse(candidates: readonly RecommendationCandidate[]): DisplayRecommendation[] {
  const strict = selectAtThreshold(candidates, 0.50);
  if (strict.length === 3) return strict;
  return selectAtThreshold(candidates, 0.67);
}

function completenessRate(garments: readonly RecommendationGarment[], predicate: (garment: RecommendationGarment) => boolean): number {
  return garments.length === 0 ? 0 : clampScore((garments.filter(predicate).length / garments.length) * 100) / 100;
}

function buildReadiness(
  input: RecommendationEngineInput,
  grouped: Partial<Record<GarmentSlot, ScoredGarment[]>>,
  validCandidateCount: number,
  displayableCandidateCount: number,
) {
  const relevant = input.garments.filter((garment) => garment.userId === input.userId && !garment.deleted);
  const missingSlotCodes: GarmentSlot[] = [];
  if ((grouped.shoes?.length ?? 0) === 0) missingSlotCodes.push("shoes");
  const hasOnePiece = (grouped.one_piece?.length ?? 0) > 0;
  if (!hasOnePiece && (grouped.tops?.length ?? 0) === 0) missingSlotCodes.push("tops");
  if (!hasOnePiece && (grouped.pants?.length ?? 0) === 0 && (grouped.skirts?.length ?? 0) === 0) missingSlotCodes.push("pants");
  const missingFieldCodes = [] as Array<"primary_image" | "category" | "color" | "season_or_thermal" | "formality">;
  if (relevant.some((item) => !item.hasPrimaryImage)) missingFieldCodes.push("primary_image");
  if (relevant.some((item) => !item.category)) missingFieldCodes.push("category");
  if (relevant.some((item) => item.colors.length === 0)) missingFieldCodes.push("color");
  if (relevant.some((item) => item.seasons.length === 0 && item.warmth === undefined && item.temperatureMinC === undefined && item.temperatureMaxC === undefined)) missingFieldCodes.push("season_or_thermal");
  if (relevant.some((item) => item.formality === undefined)) missingFieldCodes.push("formality");
  return RecommendationReadinessReportSchema.parse({
    userId: input.userId,
    generatedAt: `${input.asOfDate}T00:00:00.000Z`,
    completeness: {
      primaryImageRate: completenessRate(relevant, (item) => item.hasPrimaryImage),
      categoryRate: completenessRate(relevant, (item) => Boolean(item.category)),
      colorRate: completenessRate(relevant, (item) => item.colors.length > 0),
      seasonRate: completenessRate(relevant, (item) => item.seasons.length > 0),
      formalityRate: completenessRate(relevant, (item) => item.formality !== undefined),
      warmthRate: completenessRate(relevant, (item) => item.warmth !== undefined),
      temperatureRangeRate: completenessRate(relevant, (item) => item.temperatureMinC !== undefined && item.temperatureMaxC !== undefined),
    },
    eligibleGarmentsBySlot: Object.fromEntries((Object.keys(grouped) as GarmentSlot[]).map((slot) => [slot, grouped[slot]?.length ?? 0])),
    validCandidateCount,
    displayableCandidateCount,
    status: missingSlotCodes.length > 0 || validCandidateCount === 0 ? "not_ready" : displayableCandidateCount >= 3 ? "ready" : "limited",
    missingFieldCodes,
    missingSlotCodes,
  });
}

export async function generateRecommendations(input: RecommendationEngineInput, evaluator?: CandidateEvaluatorFunction): Promise<RecommendationEngineOutput> {
  input = RecommendationEngineInputSchema.parse(input);
  return generateRecommendationsInternal(input, "forecast", evaluator);
}

async function generateRecommendationsInternal(input: RecommendationEngineInput, contextMode: "forecast" | "generic", evaluator?: CandidateEvaluatorFunction): Promise<RecommendationEngineOutput> {
  const context = await new RuleDateContextResolver().resolve(input.dateContextInput);
  const filtered = hardFilterGarments(input.garments, context, input, contextMode);
  const grouped = pruneGarmentsBySlot(filtered.eligible, context, input, contextMode);
  const byId = new Map(Object.values(grouped).flatMap((items) => items ?? []).map((item) => [item.id, item]));
  const raw = buildRawCandidates(grouped, context, input);
  const scored = raw.candidates.map((candidate) => scoreCandidate(candidate, byId, context, input, contextMode)).sort(compareScoreThenId((item) => item.ruleScores.ruleTotal)).slice(0, MAX_RULE_SCORED_CANDIDATES);
  const shortlist = buildShortlist(scored);
  const evaluated: RecommendationCandidate[] = [];
  for (let index = 0; index < shortlist.length; index += 4) {
    const batch = shortlist.slice(index, index + 4);
    const evaluationInput = CandidateEvaluationInputSchema.parse({
      requestId: deterministicUuid(`${input.requestId}:batch:${index / 4}`),
      dateContext: context,
      weatherEvidence: input.dateContextInput.weatherEvidence,
      candidates: batch.map((candidate) => ({
        candidateId: candidate.candidateId,
        source: candidate.source,
        items: candidate.garmentIds.map((id) => {
          const item = byId.get(id)!;
          return { garmentId: item.id, role: item.role, category: item.category!, subcategory: item.subcategory, colors: item.colors, styles: item.styles, seasons: item.seasons, formality: item.formality!, warmth: item.warmth ?? 3, material: item.material, temperatureMinC: item.temperatureMinC, temperatureMaxC: item.temperatureMaxC };
        }),
        ruleScores: candidate.ruleScores,
      })),
    });
    const evaluations = input.pawCandidateEvaluatorEnabled ? await adaptCandidateEvaluator(evaluationInput, evaluator) : await adaptCandidateEvaluator(evaluationInput, undefined);
    const byCandidate = new Map(evaluations.map((evaluation) => [evaluation.candidateId, evaluation]));
    evaluated.push(...batch.map((candidate) => withEvaluation(candidate, byCandidate.get(candidate.candidateId)!)));
  }
  const recommendations = selectDiverse(evaluated);
  const readiness = buildReadiness(input, grouped, scored.length, recommendations.length);
  return RecommendationEngineOutputSchema.parse({
    ruleVersion: input.ruleVersion,
    dateContext: context,
    recommendations: readiness.status === "not_ready" ? [] : recommendations,
    shortlist: evaluated,
    readiness,
    exclusions: filtered.exclusions,
    metrics: { eligibleGarmentCount: filtered.eligible.length, rawCandidateCount: raw.candidates.length, ruleScoredCandidateCount: scored.length, maxBeamObserved: raw.maxBeamObserved },
  });
}

export async function generateRecommendationsV2(input: RecommendationEngineInputV2): Promise<RecommendationEngineOutput> {
  const parsed = RecommendationEngineInputV2Schema.parse(input);
  const { resolvedContext, ...v1Shape } = parsed;
  const v1Input = RecommendationEngineInputSchema.parse(v1Shape);
  if (resolvedContext.contextMode === "forecast") return generateRecommendations(v1Input);
  return generateRecommendationsInternal(v1Input, "generic");
}

export async function generateRecommendationsV3(input: RecommendationEngineInputV2): Promise<RecommendationEngineOutputV3> {
  const parsed = RecommendationEngineInputV2Schema.parse(input);
  const { resolvedContext, ...legacyShape } = parsed;
  const contextMode = resolvedContext.contextMode === "forecast" ? "forecast" as const : "generic" as const;
  const v1Input = RecommendationEngineInputSchema.parse({ ...legacyShape, ruleVersion: RECOMMENDATION_REALTIME_RULE_VERSION });
  const context = await new RuleDateContextResolver().resolve(v1Input.dateContextInput);
  const filtered = hardFilterGarments(v1Input.garments, context, v1Input, contextMode);
  const grouped = pruneGarmentsBySlot(filtered.eligible, context, v1Input, contextMode, "v3");
  const byId = new Map(Object.values(grouped).flatMap((items) => items ?? []).map((item) => [item.id, item]));
  const raw = buildRawCandidates(grouped, context, v1Input);
  const scored = raw.candidates.map((candidate) => scoreCandidate(candidate, byId, context, v1Input, contextMode)).sort(compareScoreThenId((item) => item.ruleScores.ruleTotal)).slice(0, MAX_RULE_SCORED_CANDIDATES);
  const shortlist = buildShortlist(scored).map((candidate) => toV3Candidate(candidate, byId, context, v1Input));
  const recommendations = selectDiverseV3(shortlist);
  const readiness = buildReadiness(v1Input, grouped, scored.length, recommendations.length);
  return RecommendationEngineOutputV3Schema.parse({
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION_V3,
    ruleVersion: RECOMMENDATION_REALTIME_RULE_VERSION,
    dateContext: context,
    recommendations: readiness.status === "not_ready" ? [] : recommendations,
    shortlist,
    readiness,
    exclusions: filtered.exclusions,
    metrics: { eligibleGarmentCount: filtered.eligible.length, rawCandidateCount: raw.candidates.length, ruleScoredCandidateCount: scored.length, maxBeamObserved: raw.maxBeamObserved },
  });
}

export function canonicalizeOutput(output: unknown): string {
  return JSON.stringify(output);
}
