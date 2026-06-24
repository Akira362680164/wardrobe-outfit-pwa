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
