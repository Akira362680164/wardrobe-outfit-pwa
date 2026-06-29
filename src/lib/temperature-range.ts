import type { TemperatureRange } from "@/lib/types";

export const TEMPERATURE_RANGE_MIN_C = -20;
export const TEMPERATURE_RANGE_MAX_C = 40;
export const TEMPERATURE_RANGE_STEP_C = 1;

export function clampTemperatureC(value: number): number {
  return Math.min(TEMPERATURE_RANGE_MAX_C, Math.max(TEMPERATURE_RANGE_MIN_C, value));
}

export function normalizeTemperatureRange(value: unknown): TemperatureRange | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  let minC = finiteTemperature(record.minC);
  let maxC = finiteTemperature(record.maxC);
  if (minC == null && maxC == null) return undefined;
  if (minC != null) minC = clampTemperatureC(minC);
  if (maxC != null) maxC = clampTemperatureC(maxC);
  if (minC != null && maxC != null && minC > maxC) [minC, maxC] = [maxC, minC];
  return {
    ...(minC != null ? { minC } : {}),
    ...(maxC != null ? { maxC } : {}),
  };
}

export function isValidTemperatureRange(value: unknown): value is TemperatureRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const minC = record.minC;
  const maxC = record.maxC;
  if (minC != null && (typeof minC !== "number" || !Number.isFinite(minC) || minC < TEMPERATURE_RANGE_MIN_C || minC > TEMPERATURE_RANGE_MAX_C)) return false;
  if (maxC != null && (typeof maxC !== "number" || !Number.isFinite(maxC) || maxC < TEMPERATURE_RANGE_MIN_C || maxC > TEMPERATURE_RANGE_MAX_C)) return false;
  return !(typeof minC === "number" && typeof maxC === "number" && minC > maxC);
}

function finiteTemperature(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
