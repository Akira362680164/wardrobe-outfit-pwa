export const MOTION_MEDIA_QUERIES = {
  reducedTransparency: "(prefers-reduced-transparency: reduce)",
  highContrast: "(prefers-contrast: more)",
} as const;

export interface MotionRuntimeSignals {
  userAgent: string;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
}

/**
 * Large translucent surfaces are the expensive effect in this app. Keep the
 * heuristic deliberately conservative: only Android devices that expose a
 * constrained memory or CPU signal lose the blur. Missing signals preserve
 * the normal material instead of guessing from viewport size or model names.
 */
export function shouldReduceLargeAreaEffects({
  userAgent,
  hardwareConcurrency,
  deviceMemoryGb,
}: MotionRuntimeSignals): boolean {
  if (!/Android/i.test(userAgent)) return false;
  const constrainedCpu = hardwareConcurrency !== undefined && hardwareConcurrency <= 4;
  const constrainedMemory = deviceMemoryGb !== undefined && deviceMemoryGb <= 4;
  return constrainedCpu || constrainedMemory;
}
