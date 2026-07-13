import type { ObjectiveScoreInput } from "./types.js";

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

export function daysSinceBucket(days: number | undefined): { rotationValue: number; repeatPenalty: number } {
  if (days === undefined) return { rotationValue: 100, repeatPenalty: 0 };
  if (days <= 2) return { rotationValue: 0, repeatPenalty: 15 };
  if (days <= 6) return { rotationValue: 25, repeatPenalty: 8 };
  if (days <= 13) return { rotationValue: 50, repeatPenalty: 0 };
  if (days <= 30) return { rotationValue: 70, repeatPenalty: 0 };
  return { rotationValue: 90, repeatPenalty: 0 };
}

export function calculateObjectiveScores(input: ObjectiveScoreInput): { safe: number; fresh: number; comfort: number } {
  return {
    safe: clampScore(0.55 * input.ruleScore + 0.25 * input.pawSemanticFit + 0.15 * input.savedOrHistoricalSuccess + 0.05 * input.informationCompleteness),
    fresh: clampScore(0.45 * input.ruleScore + 0.20 * input.pawSemanticFit + 0.20 * input.longUnwornValue + 0.10 * input.newCombinationValue + 0.05 * input.styleVariation),
    comfort: clampScore(0.40 * input.weatherAndActivityFit + 0.25 * input.historicalThermalAndDiscomfortFit + 0.20 * input.pawSceneRiskAvoidance + 0.15 * input.shoeAndOuterwearRationality),
  };
}

export function jaccardSimilarity(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  return intersection / union.size;
}
