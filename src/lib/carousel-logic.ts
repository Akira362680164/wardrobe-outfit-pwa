export function clampCarouselIndex(index: number, slideCount: number): number {
  if (slideCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), slideCount - 1));
}

export function getSwipeNextIndex(
  index: number,
  direction: "previous" | "next",
  slideCount: number,
): number {
  const safeIndex = clampCarouselIndex(index, slideCount);
  const delta = direction === "next" ? 1 : -1;
  return clampCarouselIndex(safeIndex + delta, slideCount);
}

export type GestureAxisIntent = "pending" | "horizontal" | "vertical";

export interface GestureVelocitySample {
  position: number;
  time: number;
}

export const CAROUSEL_INTENT_THRESHOLD_PX = 9;
export const CAROUSEL_VELOCITY_WINDOW_MS = 100;
export const APPLE_SCROLL_DECELERATION_RATE = 0.998;

/**
 * Locks only after a small dead zone. Near-diagonal movement stays pending so
 * a vertical page scroll wins instead of being stolen by the carousel.
 */
export function resolveGestureAxisIntent(
  deltaX: number,
  deltaY: number,
  threshold = CAROUSEL_INTENT_THRESHOLD_PX,
): GestureAxisIntent {
  const x = Math.abs(deltaX);
  const y = Math.abs(deltaY);
  const safeThreshold = Math.max(0, threshold);
  if (x < safeThreshold && y < safeThreshold) return "pending";
  if (x >= safeThreshold && x > y * 1.1) return "horizontal";
  if (y >= safeThreshold && y >= x) return "vertical";
  return "pending";
}

/**
 * Apple's rubber-band curve. Resistance increases progressively with distance
 * instead of multiplying every overshoot by a fixed factor.
 */
export function rubberBandDistance(
  distance: number,
  dimension: number,
  constant = 0.55,
): number {
  if (!Number.isFinite(distance) || distance === 0) return 0;
  const safeDimension = Math.max(1, Math.abs(dimension));
  const magnitude = Math.abs(distance);
  const resisted = (magnitude * safeDimension * constant) / (safeDimension + constant * magnitude);
  return Math.sign(distance) * resisted;
}

export function unRubberBandDistance(
  resistedDistance: number,
  dimension: number,
  constant = 0.55,
): number {
  if (!Number.isFinite(resistedDistance) || resistedDistance === 0) return 0;
  const safeDimension = Math.max(1, Math.abs(dimension));
  const magnitude = Math.min(Math.abs(resistedDistance), safeDimension - 0.001);
  const distance = (magnitude * safeDimension) / (constant * (safeDimension - magnitude));
  return Math.sign(resistedDistance) * distance;
}

export function getCarouselSnapX(index: number, slideCount: number, pageWidth: number): number {
  const safeWidth = Math.max(0, pageWidth);
  return -clampCarouselIndex(index, slideCount) * safeWidth;
}

export function applyCarouselEdgeResistance(
  positionX: number,
  slideCount: number,
  pageWidth: number,
): number {
  if (slideCount <= 1 || pageWidth <= 0) return 0;
  const maxX = 0;
  const minX = -(slideCount - 1) * pageWidth;
  if (positionX > maxX) return rubberBandDistance(positionX - maxX, pageWidth);
  if (positionX < minX) return minX + rubberBandDistance(positionX - minX, pageWidth);
  return positionX;
}

/**
 * Applies a new finger delta to the current presentation value. If a new
 * pointer interrupts an existing edge bounce, the inverse curve prevents the
 * first move from applying rubber-band resistance twice and visibly jumping.
 */
export function applyCarouselDragDelta(
  presentationX: number,
  deltaX: number,
  slideCount: number,
  pageWidth: number,
): number {
  if (slideCount <= 1 || pageWidth <= 0) return 0;
  const minX = -(slideCount - 1) * pageWidth;
  let rawPresentationX = presentationX;
  if (presentationX > 0) {
    rawPresentationX = unRubberBandDistance(presentationX, pageWidth);
  } else if (presentationX < minX) {
    rawPresentationX = minX + unRubberBandDistance(presentationX - minX, pageWidth);
  }
  return applyCarouselEdgeResistance(rawPresentationX + deltaX, slideCount, pageWidth);
}

/** Mutates a ref-owned sample buffer and keeps only the recent gesture tail. */
export function recordGestureVelocitySample(
  samples: GestureVelocitySample[],
  sample: GestureVelocitySample,
  maxAgeMs = 120,
): void {
  if (!Number.isFinite(sample.position) || !Number.isFinite(sample.time)) return;
  samples.push(sample);
  const cutoff = sample.time - Math.max(1, maxAgeMs);
  while (samples.length > 2 && samples[0]!.time < cutoff) samples.shift();
  if (samples.length > 12) samples.splice(0, samples.length - 12);
}

/**
 * Estimates px/s from the latest same-direction run. Stopping at the most
 * recent direction change is what lets a quick reversal hand off its new
 * velocity instead of averaging against the old flick.
 */
export function estimateGestureVelocity(
  samples: readonly GestureVelocitySample[],
  maxAgeMs = CAROUSEL_VELOCITY_WINDOW_MS,
): number {
  if (samples.length < 2) return 0;
  const latest = samples[samples.length - 1]!;
  const cutoff = latest.time - Math.max(1, maxAgeMs);
  let latestDirection = 0;
  let startIndex = samples.length - 1;

  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const start = samples[index]!;
    const end = samples[index + 1]!;
    if (end.time <= start.time) continue;
    if (end.time < cutoff) break;
    const delta = end.position - start.position;
    const direction = Math.abs(delta) < 0.25 ? 0 : Math.sign(delta);
    if (latestDirection === 0 && direction !== 0) latestDirection = direction;
    if (latestDirection !== 0 && direction !== 0 && direction !== latestDirection) break;
    startIndex = index;
  }

  const start = samples[startIndex]!;
  const elapsedMs = latest.time - start.time;
  if (elapsedMs <= 0) return 0;
  return ((latest.position - start.position) / elapsedMs) * 1000;
}

/**
 * UIScrollView-style exponential projection. Velocity is px/s and the returned
 * value is the projected presentation position in pixels.
 */
export function projectGestureEndpoint(
  position: number,
  velocity: number,
  decelerationRate = APPLE_SCROLL_DECELERATION_RATE,
): number {
  if (!Number.isFinite(position)) return 0;
  if (!Number.isFinite(velocity)) return position;
  const rate = Math.min(0.9999, Math.max(0, decelerationRate));
  if (rate === 0) return position;
  return position + (velocity / 1000) * (rate / (1 - rate));
}

export interface CarouselReleaseInput {
  positionX: number;
  velocityX: number;
  currentIndex: number;
  slideCount: number;
  pageWidth: number;
}

export interface CarouselReleaseResult {
  projectedX: number;
  targetIndex: number;
  targetX: number;
  releaseVelocityX: number;
}

export function resolveCarouselRelease(input: CarouselReleaseInput): CarouselReleaseResult {
  const safeIndex = clampCarouselIndex(input.currentIndex, input.slideCount);
  const safeWidth = Math.max(0, input.pageWidth);
  const releaseVelocityX = Number.isFinite(input.velocityX)
    ? Math.max(-3200, Math.min(3200, input.velocityX))
    : 0;

  if (input.slideCount <= 1 || safeWidth === 0) {
    return { projectedX: 0, targetIndex: 0, targetX: 0, releaseVelocityX };
  }

  const projectedX = projectGestureEndpoint(input.positionX, releaseVelocityX);
  const projectedIndex = Math.round(-projectedX / safeWidth);
  // A single gesture advances at most one page, even if a noisy pointer reports
  // an extreme release velocity.
  const adjacentIndex = Math.max(safeIndex - 1, Math.min(safeIndex + 1, projectedIndex));
  const targetIndex = clampCarouselIndex(adjacentIndex, input.slideCount);
  return {
    projectedX,
    targetIndex,
    targetX: getCarouselSnapX(targetIndex, input.slideCount, safeWidth),
    releaseVelocityX,
  };
}

export type CarouselImageVariant = "card" | "detail" | "review";

export interface CarouselImageSourceInput {
  variant: CarouselImageVariant;
  /** @deprecated Dragging no longer changes image resolution. */
  isDragging?: boolean;
  imageDataUrl: string;
  thumbnailSrc?: string;
  displaySrc?: string;
}

export function resolveCarouselImageSource(input: CarouselImageSourceInput): string {
  if (input.variant === "card") return input.thumbnailSrc ?? input.imageDataUrl;
  return input.displaySrc ?? input.imageDataUrl;
}
