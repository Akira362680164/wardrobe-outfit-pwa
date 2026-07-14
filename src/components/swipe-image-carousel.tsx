"use client";

import { Plus } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  applyCarouselDragDelta,
  clampCarouselIndex,
  estimateGestureVelocity,
  getCarouselSnapX,
  recordGestureVelocitySample,
  resolveCarouselImageSource,
  resolveCarouselRelease,
  resolveGestureAxisIntent,
  type GestureAxisIntent,
  type GestureVelocitySample,
} from "@/lib/carousel-logic";
import { GarmentImage } from "@/components/garment-image";
import { OnlineAssetImage, OnlineCroppedAssetImage } from "@/components/online/online-asset-image";
import { OriginalCroppedImage } from "@/components/original-cropped-image";
import type { ImageAssetReference } from "@/lib/types";

export type ImageDisplayMode = "thumbnail" | "original-cropped" | "plain";

export interface SwipeImageSlide {
  kind: "image";
  id: string;
  imageDataUrl?: string;
  asset?: ImageAssetReference;
  assetVariant?: "original" | "thumbnail";
  fallbackContent?: React.ReactNode;
  onAssetOpen?: (url: string) => void;
  fallbackImageDataUrl?: string;
  thumbnailSrc?: string;
  displaySrc?: string;
  sourceSrc?: string;
  alt?: string;
  badge?: string;
  badgeClassName?: string;
  realIndex?: number;
  /** @deprecated use displayMode instead */
  cropBox?: { x: number; y: number; width: number; height: number };
  displayMode?: ImageDisplayMode;
  originalSrc?: string;
}

export interface SwipeAddSlide {
  kind: "add";
  id: string;
  title: string;
  description: string;
  actionText: string;
}

export interface SwipeCustomSlide {
  kind: "custom";
  id: string;
  content: React.ReactNode;
  badge?: string;
  badgeClassName?: string;
  ariaLabel?: string;
}

export type SwipeSlide = SwipeImageSlide | SwipeAddSlide | SwipeCustomSlide;

export interface SwipeImage {
  imageDataUrl: string;
  alt?: string;
  badge?: string;
  badgeClassName?: string;
}

export type SwipeImageCarouselVariant = "card" | "detail" | "review";

export interface SwipeImageCarouselProps {
  slides?: SwipeSlide[];
  images?: SwipeImage[];
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  onImageClick?: (slide: SwipeImageSlide, index: number) => void;
  onAddClick?: (slide: SwipeAddSlide, index: number) => void;
  onCustomClick?: (slide: SwipeCustomSlide, index: number) => void;
  className?: string;
  imageClassName?: string;
  showDots?: boolean;
  showCounter?: boolean;
  enableSwipe?: boolean;
  ariaLabel?: string;
  extraPages?: React.ReactNode[];
  variant?: SwipeImageCarouselVariant;
}

function toInternalSlides(
  slides: SwipeSlide[] | undefined,
  images: SwipeImage[] | undefined,
): SwipeSlide[] {
  if (slides) return slides.filter(Boolean);
  return (images ?? []).map((img, i) => ({
    kind: "image" as const,
    id: `img-${i}`,
    imageDataUrl: img.imageDataUrl,
    alt: img.alt,
    badge: img.badge,
    badgeClassName: img.badgeClassName,
    realIndex: i,
  }));
}

interface PointerStart {
  pointerId: number;
  x: number;
  y: number;
  presentationX: number;
  committedIndex: number;
  inheritedVelocityX: number;
  intent: GestureAxisIntent;
  captured: boolean;
  samples: GestureVelocitySample[];
}

// v0.9.44-dev: 单页内容子组件 (image / add)。提取出来是为了让
// fallback 状态机按 slide.id 独立 (Track 模式下多 slide 并排渲染)。
interface SwipeImagePageProps {
  slide: SwipeImageSlide;
  imageFitClass: string;
  onClickImage: (slide: SwipeImageSlide) => void;
  variant: SwipeImageCarouselVariant;
}

function SwipeImagePage({ slide, imageFitClass, onClickImage, variant }: SwipeImagePageProps) {
  const mode = slide.displayMode ?? "thumbnail";

  if (slide.asset) {
    const image = mode === "original-cropped"
      ? <OnlineCroppedAssetImage asset={slide.asset} cropBox={slide.cropBox} alt={slide.alt || ""} className="h-full w-full" fallback={slide.fallbackContent} onOpen={slide.onAssetOpen} />
      : <OnlineAssetImage asset={slide.asset} variant={slide.assetVariant ?? (variant === "card" ? "thumbnail" : "original")} alt={slide.alt || ""} className="h-full w-full" imageClassName={imageFitClass} fallback={slide.fallbackContent} onOpen={slide.onAssetOpen} />;
    return <div className="relative h-full w-full" data-parity-id="parity.app.app.src.components.swipe.image.carousel.31d8ee2d44" onClick={(event) => { onClickImage(slide); event.stopPropagation(); }}>{image}</div>;
  }

  if (mode === "original-cropped" && slide.originalSrc) {
    return (
      <div
        className="relative h-full w-full"
        data-parity-id="parity.app.app.src.components.swipe.image.carousel.d3f18d77b0" onClick={(e) => { onClickImage(slide); e.stopPropagation(); }}
      >
        <OriginalCroppedImage
          originalSrc={slide.originalSrc}
          thumbnailSrc={slide.thumbnailSrc}
          cropBox={slide.cropBox}
          alt={slide.alt || ""}
          className="h-full w-full"
        />
        {slide.badge ? (
          <span
            className={`absolute left-2 top-2 z-10 inline-flex h-5 max-w-[120px] items-center rounded-full px-1.5 text-[9px] font-semibold text-white truncate ${slide.badgeClassName || "bg-denim"}`}
            aria-label={slide.badge}
          >
            {slide.badge}
          </span>
        ) : null}
      </div>
    );
  }

  const src = resolveCarouselImageSource({
    variant,
    imageDataUrl: slide.imageDataUrl ?? "",
    thumbnailSrc: slide.thumbnailSrc,
    displaySrc: slide.displaySrc,
  });

  return (
    <div
      className="relative h-full w-full"
      data-parity-id="parity.app.app.src.components.swipe.image.carousel.ffbd9215bd" onClick={(e) => { onClickImage(slide); e.stopPropagation(); }}
    >
      {slide.imageDataUrl ? (
        <GarmentImage
          src={src}
          asset={slide.asset}
          alt={slide.alt || ""}
          fallbackSrc={slide.fallbackImageDataUrl}
          imageClassName="bg-transparent"
          className={`block h-full w-full ${imageFitClass}`}
        />
      ) : slide.fallbackContent ?? (
        <div className="grid h-full w-full place-items-center bg-mist px-4 text-center text-xs text-ink/45">
          图片读取失败，请删除后重新选择
        </div>
      )}
      {slide.badge ? (
        <span
          className={`absolute left-2 top-2 z-10 inline-flex h-5 max-w-[120px] items-center rounded-full px-1.5 text-[9px] font-semibold text-white truncate ${slide.badgeClassName || "bg-denim"}`}
          aria-label={slide.badge}
        >
          {slide.badge}
        </span>
      ) : null}
    </div>
  );
}

interface SwipeAddPageProps {
  slide: SwipeAddSlide;
  onClickAdd: (slide: SwipeAddSlide) => void;
}

function SwipeAddPage({ slide, onClickAdd }: SwipeAddPageProps) {
  return (
    <div className="grid h-full w-full place-items-center bg-mist p-4" aria-label={slide.title}>
      <button
        type="button"
        data-parity-id="parity.app.app.src.components.swipe.image.carousel.b229c3c0fc" onClick={(e) => { onClickAdd(slide); e.stopPropagation(); }}
        className="grid max-w-[260px] place-items-center gap-3 rounded-2xl border border-ink/8 bg-white px-6 py-7 text-center shadow-soft transition-transform app-press-feedback"
        aria-label={slide.title}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-denim/10 text-denim">
          <Plus size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="grid gap-1">
          <span className="text-sm font-semibold text-ink">{slide.title}</span>
          <span className="text-[11px] leading-relaxed text-ink/55">{slide.description}</span>
        </span>
        <span className="mt-1 inline-flex h-8 items-center justify-center rounded-full bg-denim px-4 text-[11px] font-semibold text-white">
          {slide.actionText}
        </span>
      </button>
    </div>
  );
}

interface SwipeCustomPageProps {
  slide: SwipeCustomSlide;
  onClickCustom: (slide: SwipeCustomSlide) => void;
}

function SwipeCustomPage({ slide, onClickCustom }: SwipeCustomPageProps) {
  return (
    <div
      className="relative h-full w-full"
      data-parity-id="parity.app.app.src.components.swipe.image.carousel.45817abff6" onClick={(e) => { onClickCustom(slide); e.stopPropagation(); }}
      aria-label={slide.ariaLabel}
    >
      {slide.content}
      {slide.badge ? (
        <span
          className={`absolute left-2 top-2 z-10 inline-flex h-5 max-w-[120px] items-center rounded-full px-1.5 text-[9px] font-semibold text-white truncate ${slide.badgeClassName || "bg-moss"}`}
          aria-label={slide.badge}
        >
          {slide.badge}
        </span>
      ) : null}
    </div>
  );
}

export function SwipeImageCarousel({
  slides: slidesProp,
  images,
  index: controlledIndex,
  defaultIndex = 0,
  onIndexChange,
  onImageClick,
  onAddClick,
  onCustomClick,
  className = "",
  imageClassName,
  showDots = false,
  showCounter = false,
  enableSwipe,
  ariaLabel,
  variant = "detail",
}: SwipeImageCarouselProps) {
  const [internalIndex, setInternalIndex] = useState(defaultIndex);
  const trackX = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const pointerStartRef = useRef<PointerStart | null>(null);
  const trackAnimationRef = useRef<{ stop: () => void } | null>(null);
  const animationPresentationRef = useRef({ position: 0, velocity: 0, time: 0 });
  const animationTargetIndexRef = useRef<number | null>(null);
  const measuredWidthRef = useRef(0);
  const suppressedClickPointerRef = useRef<number | null>(null);
  const clickClearFrameRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const preloadedUrlsRef = useRef<Set<string>>(new Set());

  const slides = useMemo(
    () => toInternalSlides(slidesProp, images),
    [slidesProp, images],
  );
  const currentIndex = controlledIndex ?? internalIndex;
  const safeIndex = clampCarouselIndex(currentIndex, slides.length);
  const previousSafeIndexRef = useRef(safeIndex);
  const renderFromIndex = previousSafeIndexRef.current;
  const currentSlide = slides[safeIndex];
  const canSwipe = enableSwipe ?? slides.length > 1;
  const defaultImageFit = variant === "card" ? "object-cover" : "object-contain";
  const imageFitClass = imageClassName || defaultImageFit;

  useLayoutEffect(() => {
    previousSafeIndexRef.current = safeIndex;
  }, [safeIndex]);

  const stopTrackAnimation = useCallback(() => {
    trackAnimationRef.current?.stop();
    trackAnimationRef.current = null;
  }, []);

  const animateTrackTo = useCallback((targetX: number, velocityX = 0) => {
    stopTrackAnimation();
    if (reduceMotion) {
      trackX.set(targetX);
      animationPresentationRef.current = { position: targetX, velocity: 0, time: performance.now() };
      return;
    }
    let previousPosition = trackX.get();
    let previousTime = performance.now();
    animationPresentationRef.current = { position: previousPosition, velocity: velocityX, time: previousTime };
    trackAnimationRef.current = animate(trackX, targetX, {
      type: "spring",
      stiffness: 360,
      damping: 32,
      mass: 0.9,
      velocity: velocityX,
      restDelta: 0.35,
      restSpeed: 8,
      onUpdate: (position) => {
        const now = performance.now();
        const elapsed = now - previousTime;
        const velocity = elapsed > 0 ? ((position - previousPosition) / elapsed) * 1000 : 0;
        animationPresentationRef.current = { position, velocity, time: now };
        previousPosition = position;
        previousTime = now;
      },
    });
  }, [reduceMotion, stopTrackAnimation, trackX]);

  const readTrackPresentationX = useCallback(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    if (!track || !container) return trackX.get();
    return track.getBoundingClientRect().left - container.getBoundingClientRect().left;
  }, [trackX]);

  const clearSuppressedClick = useCallback(() => {
    suppressedClickPointerRef.current = null;
    if (clickClearFrameRef.current !== null) {
      window.cancelAnimationFrame(clickClearFrameRef.current);
      clickClearFrameRef.current = null;
    }
  }, []);

  const armClickSuppression = useCallback((pointerId: number) => {
    suppressedClickPointerRef.current = pointerId;
  }, []);

  const clearSuppressionAfterSequence = useCallback(() => {
    if (clickClearFrameRef.current !== null) window.cancelAnimationFrame(clickClearFrameRef.current);
    clickClearFrameRef.current = window.requestAnimationFrame(() => {
      suppressedClickPointerRef.current = null;
      clickClearFrameRef.current = null;
    });
  }, []);

  // v0.9.44-dev: 测量容器宽度 (mount + resize). 用 useLayoutEffect 避免首帧空白
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (w > 0) setContainerWidth(w);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth((prev) => (prev === w ? prev : w));
    };
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // v0.9.43-dev 批次 6 + v0.9.44 问题 6: 相邻 [index-1, index, index+1] 的
  // thumbnailSrc 和 displaySrc 都预加载, 拖动 → 静态 swap 时已缓存, 不白屏
  useEffect(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    const candidates = [slides[safeIndex - 1], slides[safeIndex], slides[safeIndex + 1]];
    for (const slide of candidates) {
      if (!slide || slide.kind !== "image") continue;
      const urls: string[] = [];
      if (slide.thumbnailSrc) urls.push(slide.thumbnailSrc);
      if (slide.displaySrc && slide.displaySrc !== slide.thumbnailSrc) urls.push(slide.displaySrc);
      for (const u of urls) {
        if (!u || preloadedUrlsRef.current.has(u)) continue;
        preloadedUrlsRef.current.add(u);
        const img = new Image();
        img.src = u;
      }
    }
  }, [safeIndex, slides]);

  const commitIndex = useCallback((next: number) => {
    const safeNext = clampCarouselIndex(next, slides.length);
    if (controlledIndex === undefined) setInternalIndex(safeNext);
    onIndexChange?.(safeNext);
  }, [controlledIndex, onIndexChange, slides.length]);

  useEffect(() => {
    if (slides.length > 0 && currentIndex !== safeIndex) commitIndex(safeIndex);
  }, [commitIndex, currentIndex, safeIndex, slides.length]);

  // Width changes are geometry changes, not navigation. Rebase immediately so
  // rotation/resize never leaves a half-page transform behind.
  useLayoutEffect(() => {
    if (containerWidth <= 0 || measuredWidthRef.current === containerWidth) return;
    measuredWidthRef.current = containerWidth;
    if (pointerStartRef.current) return;
    stopTrackAnimation();
    const snapX = getCarouselSnapX(safeIndex, slides.length, containerWidth);
    trackX.set(snapX);
    animationPresentationRef.current = { position: snapX, velocity: 0, time: performance.now() };
    animationTargetIndexRef.current = safeIndex;
  }, [containerWidth, safeIndex, slides.length, stopTrackAnimation, trackX]);

  // Thumbnail/filmstrip selection reuses the same track spring as a swipe.
  useEffect(() => {
    if (containerWidth <= 0 || pointerStartRef.current) return;
    if (animationTargetIndexRef.current === safeIndex) return;
    animationTargetIndexRef.current = safeIndex;
    animateTrackTo(getCarouselSnapX(safeIndex, slides.length, containerWidth));
  }, [animateTrackTo, containerWidth, safeIndex, slides.length]);

  useEffect(() => () => {
    stopTrackAnimation();
    if (clickClearFrameRef.current !== null) window.cancelAnimationFrame(clickClearFrameRef.current);
  }, [stopTrackAnimation]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipe || slides.length <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A new pointer sequence can never inherit click suppression from the last
    // one, even when the browser reuses the same pointerId for every mouse click.
    clearSuppressedClick();
    const presentationX = readTrackPresentationX();
    const inheritedVelocityX = animationPresentationRef.current.time > 0
      ? animationPresentationRef.current.velocity
      : trackX.getVelocity();
    stopTrackAnimation();
    trackX.set(presentationX);
    animationPresentationRef.current = { position: presentationX, velocity: inheritedVelocityX, time: performance.now() };
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      presentationX,
      committedIndex: safeIndex,
      inheritedVelocityX,
      intent: "pending",
      captured: false,
      samples: [{ position: presentationX, time: performance.now() }],
    };
  }, [canSwipe, clearSuppressedClick, readTrackPresentationX, safeIndex, slides.length, stopTrackAnimation, trackX]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId || !canSwipe || slides.length <= 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (start.intent === "pending") {
      const nextIntent = resolveGestureAxisIntent(dx, dy);
      if (nextIntent === "pending") return;
      start.intent = nextIntent;
      armClickSuppression(event.pointerId);
      if (nextIntent === "vertical") {
        animationTargetIndexRef.current = start.committedIndex;
        animateTrackTo(
          getCarouselSnapX(start.committedIndex, slides.length, containerWidth),
          start.inheritedVelocityX,
        );
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.captured = true;
      } catch {
        // A cancelled native gesture may make capture unavailable; the next
        // pointercancel still restores the committed snap point.
      }
    }

    if (start.intent !== "horizontal") return;
    event.preventDefault();
    const presentationX = applyCarouselDragDelta(
      start.presentationX,
      dx,
      slides.length,
      containerWidth,
    );
    trackX.set(presentationX);
    recordGestureVelocitySample(start.samples, {
      position: presentationX,
      time: performance.now(),
    });
  }, [animateTrackTo, armClickSuppression, canSwipe, containerWidth, slides.length, trackX]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStartRef.current = null;
    if (start.captured) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture can already be gone after a browser-level cancel.
      }
    }

    if (!canSwipe || slides.length <= 1 || start.intent !== "horizontal") {
      animationTargetIndexRef.current = start.committedIndex;
      animateTrackTo(
        getCarouselSnapX(start.committedIndex, slides.length, containerWidth),
        start.intent === "pending" ? start.inheritedVelocityX : 0,
      );
      if (start.intent === "vertical") clearSuppressionAfterSequence();
      return;
    }

    const finalX = applyCarouselDragDelta(
      start.presentationX,
      event.clientX - start.x,
      slides.length,
      containerWidth,
    );
    trackX.set(finalX);
    recordGestureVelocitySample(start.samples, { position: finalX, time: performance.now() });
    const sampledVelocity = estimateGestureVelocity(start.samples);
    const releaseVelocity = Math.abs(sampledVelocity) > 1
      ? sampledVelocity
      : start.inheritedVelocityX;
    const release = resolveCarouselRelease({
      positionX: finalX,
      velocityX: releaseVelocity,
      currentIndex: start.committedIndex,
      slideCount: slides.length,
      pageWidth: containerWidth,
    });
    animationTargetIndexRef.current = release.targetIndex;
    animateTrackTo(release.targetX, release.releaseVelocityX);
    commitIndex(release.targetIndex);
    clearSuppressionAfterSequence();
  }, [animateTrackTo, canSwipe, clearSuppressionAfterSequence, commitIndex, containerWidth, slides.length, trackX]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerStartRef.current = null;
    clearSuppressedClick();
    animationTargetIndexRef.current = start.committedIndex;
    animateTrackTo(
      getCarouselSnapX(start.committedIndex, slides.length, containerWidth),
      0,
    );
  }, [animateTrackTo, clearSuppressedClick, containerWidth, slides.length]);

  const suppressBubbledClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const suppressedPointerId = suppressedClickPointerRef.current;
    if (suppressedPointerId === null) return;
    const nativePointerId = (event.nativeEvent as MouseEvent & { pointerId?: number }).pointerId;
    if (nativePointerId !== undefined && nativePointerId !== suppressedPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    clearSuppressedClick();
  }, [clearSuppressedClick]);

  const handleImageClick = useCallback((slide: SwipeImageSlide) => {
    onImageClick?.(slide, safeIndex);
  }, [onImageClick, safeIndex]);

  const handleAddClick = useCallback((slide: SwipeAddSlide) => {
    onAddClick?.(slide, safeIndex);
  }, [onAddClick, safeIndex]);

  const handleCustomClick = useCallback((slide: SwipeCustomSlide) => {
    onCustomClick?.(slide, safeIndex);
  }, [onCustomClick, safeIndex]);

  // v0.9.44-dev 问题 5: 不再用 motion.div key={slide.id} 触发重挂入场动画。
  // 改成 Track: 多页并排, 容器 translateX 跟 safeIndex 走, 没有 mount 时的 x: ±10 入场。
  if (!currentSlide) {
    return (
      <div
        className={`grid h-full min-h-[160px] w-full place-items-center bg-mist text-xs text-ink/45 ${className}`}
        role="region"
        aria-label={ariaLabel}
      >
        暂无图片
      </div>
    );
  }

  // Current ±1 stays mounted and visible so an interrupted spring can expose
  // either neighbour without a blank frame. Non-current pages remain inert.
  const renderSlide = (i: number) => {
    const firstVisibleIndex = Math.min(renderFromIndex, safeIndex) - 1;
    const lastVisibleIndex = Math.max(renderFromIndex, safeIndex) + 1;
    if (i < firstVisibleIndex || i > lastVisibleIndex) return null;
    const slide = slides[i];
    if (!slide) return null;
    if (slide.kind === "image") {
      return (
        <SwipeImagePage
          slide={slide}
          imageFitClass={imageFitClass}
          onClickImage={handleImageClick}
          variant={variant}
        />
      );
    }
    if (slide.kind === "add") {
      return <SwipeAddPage slide={slide} onClickAdd={handleAddClick} />;
    }
    return <SwipeCustomPage slide={slide} onClickCustom={handleCustomClick} />;
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ touchAction: canSwipe ? "pan-y" : undefined }}
      role="region"
      aria-label={ariaLabel ?? `图片 ${safeIndex + 1}/${slides.length}`}
      aria-roledescription={slides.length > 1 ? "carousel" : undefined}
      data-parity-id="parity.app.app.src.components.swipe.image.carousel.65182710d3" onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      onClickCapture={suppressBubbledClick}
      onDragStart={(event) => event.preventDefault()}
      data-carousel-index={safeIndex}
      data-carousel-width={containerWidth || undefined}
      data-app-press-gesture-owner="true"
    >
      <motion.div
        ref={trackRef}
        className="absolute inset-y-0 left-0 flex h-full"
        style={{ width: `${slides.length * 100}%`, x: trackX }}
        initial={false}
        data-carousel-track="true"
      >
        {slides.map((slide, i) => {
          const isCurrent = i === safeIndex;
          const isVisible = i >= Math.min(renderFromIndex, safeIndex) - 1
            && i <= Math.max(renderFromIndex, safeIndex) + 1;
          return (
            <div
              key={slide.id}
              className="relative h-full shrink-0"
              style={{
                width: `${100 / slides.length}%`,
                pointerEvents: isCurrent ? "auto" : "none",
                visibility: isVisible ? "visible" : "hidden",
              }}
              aria-hidden={!isCurrent}
            >
              {renderSlide(i)}
            </div>
          );
        })}
      </motion.div>

      {showDots && slides.length > 1 ? (
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1" aria-hidden="true">
          {slides.map((slide, i) => (
            <span
              key={slide.id}
              className={`block h-1 rounded-full transition-colors ${i === safeIndex ? "w-3 bg-white shadow-sm" : "w-1 bg-white/50"}`}
            />
          ))}
        </div>
      ) : null}

      {showCounter && slides.length > 1 ? (
        <div className="absolute bottom-2 right-2 z-10 inline-flex h-5 items-center rounded-full bg-black/50 px-2 text-[10px] font-semibold tabular-nums text-white">
          {safeIndex + 1}/{slides.length}
        </div>
      ) : null}
    </div>
  );
}
