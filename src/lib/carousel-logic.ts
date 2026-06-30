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

export type CarouselImageVariant = "card" | "detail" | "review";

export interface CarouselImageSourceInput {
  variant: CarouselImageVariant;
  isDragging: boolean;
  imageDataUrl: string;
  thumbnailSrc?: string;
  displaySrc?: string;
}

export function resolveCarouselImageSource(input: CarouselImageSourceInput): string {
  if (input.variant === "card") return input.thumbnailSrc ?? input.imageDataUrl;
  if (input.isDragging && input.thumbnailSrc) return input.thumbnailSrc;
  return input.displaySrc ?? input.imageDataUrl;
}
