// v2.0.12-test: 全局统一适穿温度上下限常量
// - 组件、AI 结果归一化、详情页、编辑器共用这两个常量
// - 不允许任何业务文件硬编码 0 / 40
// - AI 返回的负数原样保留，不被截断为 0

export const TEMPERATURE_MIN_C = -20;
export const TEMPERATURE_MAX_C = 40;

export interface TemperatureRange {
  minC?: number;
  maxC?: number;
}

export function clampTemperatureC(value: number): number {
  if (!Number.isFinite(value)) return TEMPERATURE_MIN_C;
  if (value < TEMPERATURE_MIN_C) return TEMPERATURE_MIN_C;
  if (value > TEMPERATURE_MAX_C) return TEMPERATURE_MAX_C;
  return value;
}

/** 校验 minC <= maxC；不通过时返回 null（由调用方决定如何兜底）。 */
export function validateTemperatureRange(
  range: TemperatureRange | null | undefined,
): { minC: number; maxC: number } | null {
  if (!range) return null;
  const hasMin = typeof range.minC === "number" && Number.isFinite(range.minC);
  const hasMax = typeof range.maxC === "number" && Number.isFinite(range.maxC);
  if (!hasMin && !hasMax) return null;
  const minC = hasMin ? (range.minC as number) : TEMPERATURE_MIN_C;
  const maxC = hasMax ? (range.maxC as number) : TEMPERATURE_MAX_C;
  if (minC > maxC) return null;
  return { minC, maxC };
}

/** AI / 用户输入归一化：保留负数，不截断为 0。 */
export function normalizeTemperatureRange(
  range: TemperatureRange | null | undefined,
): TemperatureRange | null {
  if (!range) return null;
  const hasMin = typeof range.minC === "number" && Number.isFinite(range.minC);
  const hasMax = typeof range.maxC === "number" && Number.isFinite(range.maxC);
  if (!hasMin && !hasMax) return null;
  return {
    ...(hasMin ? { minC: clampTemperatureC(range.minC as number) } : {}),
    ...(hasMax ? { maxC: clampTemperatureC(range.maxC as number) } : {}),
  };
}
