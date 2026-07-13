import {
  CandidateEvaluationBatchSchema,
  CanonicalGarmentObservationSchema,
  CanonicalizerInputSchema,
  DateContextInputSchema,
  DateContextSchema,
  type CandidateEvaluation,
  type CandidateEvaluationInput,
  type CanonicalGarmentObservation,
  type CanonicalizerInput,
  type DateContext,
  type DateContextInput,
} from "@wardrobe/cloud-contracts";
import {
  normalizeGarmentCategory,
  normalizeSeasonList,
  normalizeStyleList,
  normalizeSubcategoryForCategory,
  normalizeSystemColorList,
} from "@wardrobe/domain-catalog";

export interface DateContextResolver {
  resolve(input: DateContextInput): Promise<DateContext>;
}

export interface CandidateSemanticEvaluator {
  evaluate(input: CandidateEvaluationInput): Promise<CandidateEvaluation[]>;
}

export interface GarmentObservationCanonicalizer {
  canonicalize(input: CanonicalizerInput): Promise<CanonicalGarmentObservation>;
}

export const PAW_CANDIDATE_TIMEOUT_MS = 30_000;
export const PAW_DATE_CONTEXT_TIMEOUT_MS = 30_000;
export const PAW_USER_DATE_TOTAL_BUDGET_MS = 90_000;
export const PAW_CANONICALIZER_TIMEOUT_MS = 5_000;
export const PAW_MAX_CANDIDATES_PER_BATCH = 4;
export const PAW_DEFAULT_CONCURRENCY = 1;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("paw_timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function containsAny(value: string, tokens: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

export class RuleDateContextResolver implements DateContextResolver {
  async resolve(rawInput: DateContextInput): Promise<DateContext> {
    const input = DateContextInputSchema.parse(rawInput);
    const activityText = input.travelPlan?.activities.join(" ") ?? "";
    const planText = `${input.travelPlan?.name ?? ""} ${input.travelPlan?.destination ?? ""} ${activityText}`;
    const isFormal = containsAny(planText, ["formal", "gala", "ceremony", "正式", "晚宴"]);
    const isBusiness = !isFormal && containsAny(planText, ["business", "meeting", "conference", "会议", "商务", "出差"]);
    const isTravel = !isFormal && !isBusiness && Boolean(input.travelPlan);
    const isOutdoor = containsAny(activityText, ["hiking", "outdoor", "camp", "cycling", "徒步", "户外", "骑行"]);
    const sceneType = isFormal
      ? "formal"
      : isBusiness
        ? "business"
        : isTravel
          ? "travel"
          : input.dayType === "workday"
            ? (input.userProfile.workdayScene ?? "commute")
            : (input.userProfile.restDayScene ?? "casual");
    const formalityTarget = sceneType === "formal" ? 5 : sceneType === "business" ? 4 : sceneType === "commute" ? 3 : 2;
    const activityIntensity = isOutdoor ? 5 : sceneType === "travel" ? 4 : sceneType === "commute" ? 2 : 1;
    const min = input.weatherEvidence.feelsLikeMinC ?? input.weatherEvidence.temperatureMinC;
    const max = input.weatherEvidence.feelsLikeMaxC ?? input.weatherEvidence.temperatureMaxC;
    const average = min !== undefined && max !== undefined ? (min + max) / 2 : min ?? max;
    const bias = input.userProfile.thermalBias;
    const adjusted = average === undefined ? undefined : average + (bias === "cold_sensitive" ? -2 : bias === "heat_sensitive" ? 2 : 0);
    const thermalStrategy = adjusted === undefined ? "layer" : adjusted >= 30 ? "cooling" : adjusted >= 23 ? "light" : adjusted >= 15 ? "balanced" : adjusted >= 7 ? "layer" : "warm";
    const rain = input.weatherEvidence.rainProbability ?? 0;
    const rainStrategy = rain >= 80 ? "full_rain_protection" : rain >= 50 ? "waterproof_shoes" : rain >= 25 ? "umbrella" : "none";
    const avoidRules: DateContext["avoidRules"] = [];
    if (rain >= 50) avoidRules.push("avoid_suede");
    if (rain >= 80) avoidRules.push("avoid_open_toe_shoes");
    if (adjusted !== undefined && adjusted >= 30) avoidRules.push("avoid_heavy_outerwear", "avoid_non_breathable");
    if (activityIntensity >= 4) avoidRules.push("avoid_high_heels");
    const requiredSlots: DateContext["requiredSlots"] = ["tops", "pants", "shoes"];
    if (thermalStrategy === "warm" || rainStrategy === "full_rain_protection") requiredSlots.push("outerwear");
    return DateContextSchema.parse({
      sceneType,
      formalityTarget,
      activityIntensity,
      thermalStrategy,
      rainStrategy,
      requiredSlots,
      optionalSlots: ["outerwear", "skirts", "one_piece", "bag", "hat", "accessory"],
      avoidRules: [...new Set(avoidRules)],
      confidence: input.weatherEvidence.weatherConfidence >= 0.8 ? "high" : input.weatherEvidence.weatherConfidence >= 0.5 ? "medium" : "low",
      contextSummary: `${sceneType}:${thermalStrategy}:${rainStrategy}`.slice(0, 60),
    });
  }
}

export class NeutralCandidateEvaluator implements CandidateSemanticEvaluator {
  async evaluate(input: CandidateEvaluationInput): Promise<CandidateEvaluation[]> {
    return input.candidates.map((candidate) => createNeutralEvaluation(candidate.candidateId));
  }
}

export function createNeutralEvaluation(candidateId: string): CandidateEvaluation {
  return {
    candidateId,
    semanticFit: 50,
    styleCoherence: 50,
    sceneRisks: [],
    missingSlots: [],
    reasonCodes: ["rule_fallback"],
    fallbackUsed: true,
  };
}

type EvaluatorFunction = ((input: unknown) => Promise<unknown>) | undefined;

export async function adaptCandidateEvaluator(
  input: { candidates: Array<{ candidateId: string }> },
  evaluator: EvaluatorFunction,
  timeoutMs = PAW_CANDIDATE_TIMEOUT_MS,
): Promise<CandidateEvaluation[]> {
  const fallback = () => input.candidates.map((candidate) => createNeutralEvaluation(candidate.candidateId));
  if (!evaluator) return fallback();
  try {
    const raw = await withTimeout(evaluator(input), timeoutMs);
    const parsed = CandidateEvaluationBatchSchema.safeParse(raw);
    if (!parsed.success) return fallback();
    const expected = input.candidates.map((candidate) => candidate.candidateId).sort();
    const actual = parsed.data.results.map((candidate) => candidate.candidateId).sort();
    if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index]) || new Set(actual).size !== actual.length) return fallback();
    if (parsed.data.results.some((candidate) => candidate.fallbackUsed)) return fallback();
    const byId = new Map(parsed.data.results.map((candidate) => [candidate.candidateId, candidate]));
    return input.candidates.map((candidate) => byId.get(candidate.candidateId)!);
  } catch {
    return fallback();
  }
}

export class DeterministicGarmentCanonicalizer implements GarmentObservationCanonicalizer {
  async canonicalize(rawInput: CanonicalizerInput): Promise<CanonicalGarmentObservation> {
    const input = CanonicalizerInputSchema.parse(rawInput);
    const observation = input.parsedObservation;
    const first = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;
    const list = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value ? [value] : []).map((entry) => entry.trim()).filter(Boolean);
    const number = (value: string | number | undefined): number | undefined => {
      if (value === undefined || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const reviewReasonCodes: CanonicalGarmentObservation["reviewReasonCodes"] = [];
    const rawCategory = first(observation.category);
    const normalizedCategory = normalizeGarmentCategory(rawCategory);
    const category = normalizedCategory ?? "tops";
    if (!normalizedCategory) reviewReasonCodes.push(rawCategory ? "unknown_category" : "missing_required_field");
    const rawSubcategory = first(observation.subcategory);
    const subcategory = normalizeSubcategoryForCategory(category, rawSubcategory);
    if (rawSubcategory && !subcategory) reviewReasonCodes.push("unknown_subcategory");
    const colors = normalizeSystemColorList(list(observation.colors), 4);
    if (colors.length === 0) reviewReasonCodes.push(observation.colors ? "unknown_color" : "missing_required_field");
    const rawFormality = number(observation.formality);
    const rawWarmth = number(observation.warmth);
    const formality = rawFormality !== undefined && Number.isInteger(rawFormality) && rawFormality >= 1 && rawFormality <= 5 ? rawFormality : 3;
    const warmth = rawWarmth !== undefined && Number.isInteger(rawWarmth) && rawWarmth >= 1 && rawWarmth <= 5 ? rawWarmth : 3;
    if (formality !== rawFormality || warmth !== rawWarmth) reviewReasonCodes.push("missing_required_field");
    let temperatureMinC = number(observation.temperatureMinC);
    let temperatureMaxC = number(observation.temperatureMaxC);
    if (temperatureMinC !== undefined && temperatureMaxC !== undefined && temperatureMinC > temperatureMaxC) {
      temperatureMinC = undefined;
      temperatureMaxC = undefined;
      reviewReasonCodes.push("invalid_temperature_range");
    }
    if (input.parseWarnings.length > 0) reviewReasonCodes.push("low_confidence");
    const candidate = {
      name: observation.name?.trim() || "Unnamed garment",
      category,
      subcategory,
      colors: colors.length > 0 ? colors : ["黑" as const],
      styles: normalizeStyleList(list(observation.styles)),
      seasons: normalizeSeasonList(list(observation.seasons)),
      material: first(observation.material),
      formality,
      warmth,
      temperatureMinC,
      temperatureMaxC,
      needsReview: reviewReasonCodes.length > 0,
      reviewReasonCodes: [...new Set(reviewReasonCodes)],
      sourceConfidence: reviewReasonCodes.length > 0 ? 0.5 : 0.8,
    };
    return CanonicalGarmentObservationSchema.parse(candidate);
  }
}

export async function adaptDateContextResolver(
  input: DateContextInput,
  ruleResolver: DateContextResolver,
  pawResolver?: DateContextResolver,
  timeoutMs = PAW_DATE_CONTEXT_TIMEOUT_MS,
): Promise<DateContext> {
  const fallback = await ruleResolver.resolve(input);
  if (!pawResolver) return fallback;
  try {
    return DateContextSchema.parse(await withTimeout(pawResolver.resolve(input), timeoutMs));
  } catch {
    return fallback;
  }
}

export async function adaptGarmentCanonicalizer(
  input: CanonicalizerInput,
  deterministic: GarmentObservationCanonicalizer,
  paw?: GarmentObservationCanonicalizer,
  timeoutMs = PAW_CANONICALIZER_TIMEOUT_MS,
): Promise<CanonicalGarmentObservation> {
  const fallback = await deterministic.canonicalize(input);
  const reviewedFallback = (): CanonicalGarmentObservation => ({
    ...fallback,
    needsReview: true,
    reviewReasonCodes: fallback.reviewReasonCodes.includes("low_confidence")
      ? fallback.reviewReasonCodes
      : [...fallback.reviewReasonCodes, "low_confidence"],
  });
  if (!paw) return reviewedFallback();
  try {
    return CanonicalGarmentObservationSchema.parse(await withTimeout(paw.canonicalize(input), timeoutMs));
  } catch {
    return reviewedFallback();
  }
}
