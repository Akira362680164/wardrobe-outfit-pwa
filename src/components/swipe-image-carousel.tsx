"use client";

import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clampCarouselIndex, getSwipeNextIndex, resolveCarouselImageSource } from "@/lib/carousel-logic";
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
  x: number;
  y: number;
  time: number;
  horizontal: boolean;
}

// v0.9.44-dev: 单页内容子组件 (image / add)。提取出来是为了让
// fallback 状态机按 slide.id 独立 (Track 模式下多 slide 并排渲染)。
interface SwipeImagePageProps {
  slide: SwipeImageSlide;
  isDragging: boolean;
  imageFitClass: string;
  onClickImage: (slide: SwipeImageSlide) => void;
  variant: SwipeImageCarouselVariant;
}

function SwipeImagePage({ slide, isDragging, imageFitClass, onClickImage, variant }: SwipeImagePageProps) {
  const mode = slide.displayMode ?? "thumbnail";

  if (slide.asset) {
    const image = mode === "original-cropped"
      ? <OnlineCroppedAssetImage asset={slide.asset} cropBox={slide.cropBox} alt={slide.alt || ""} className="h-full w-full" fallback={slide.fallbackContent} onOpen={slide.onAssetOpen} />
      : <OnlineAssetImage asset={slide.asset} variant={slide.assetVariant ?? (variant === "card" ? "thumbnail" : "original")} alt={slide.alt || ""} className="h-full w-full" imageClassName={imageFitClass} fallback={slide.fallbackContent} onOpen={slide.onAssetOpen} />;
    return <div className="relative h-full w-full" onClick={(event) => { onClickImage(slide); event.stopPropagation(); }}>{image}</div>;
  }

  if (mode === "original-cropped" && slide.originalSrc) {
    return (
      <div
        className="relative h-full w-full"
        onClick={(e) => { onClickImage(slide); e.stopPropagation(); }}
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
    isDragging,
    imageDataUrl: slide.imageDataUrl ?? "",
    thumbnailSrc: slide.thumbnailSrc,
    displaySrc: slide.displaySrc,
  });

  return (
    <div
      className="relative h-full w-full"
      onClick={(e) => { onClickImage(slide); e.stopPropagation(); }}
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
        onClick={(e) => { onClickAdd(slide); e.stopPropagation(); }}
        className="grid max-w-[260px] place-items-center gap-3 rounded-2xl border border-ink/8 bg-white px-6 py-7 text-center shadow-soft transition-transform active:scale-[0.98]"
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
      onClick={(e) => { onClickCustom(slide); e.stopPropagation(); }}
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
  // v0.9.44-dev: 拖动位移 (像素), 0 = 当前页在视口中央
  const [dragOffset, setDragOffset] = useState(0);
  // v0.9.44-dev 批次 6: isDragging 驱动 thumbnail/display 切换 + 抑制 spring 动画
  const [isDragging, setIsDragging] = useState(false);
  const pointerStartRef = useRef<PointerStart | null>(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  // v0.9.44-dev: 容器宽度 (用于 Track 像素位移)
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // v0.9.43-dev 批次 6: 相邻缩略图预加载
  const preloadedUrlsRef = useRef<Set<string>>(new Set());

  const slides = useMemo(
    () => toInternalSlides(slidesProp, images),
    [slidesProp, images],
  );
  const currentIndex = controlledIndex ?? internalIndex;
  const safeIndex = clampCarouselIndex(currentIndex, slides.length);
  const currentSlide = slides[safeIndex];
  const canSwipe = enableSwipe ?? slides.length > 1;
  const defaultImageFit = variant === "card" ? "object-cover" : "object-contain";
  const imageFitClass = imageClassName || defaultImageFit;

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

  useEffect(() => () => {
    if (suppressTimerRef.current !== null) window.clearTimeout(suppressTimerRef.current);
  }, []);

  const markSwipe = useCallback(() => {
    suppressClickRef.current = true;
    if (suppressTimerRef.current !== null) window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressTimerRef.current = null;
    }, 350);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!canSwipe || slides.length <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
      horizontal: false,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [canSwipe, slides.length]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    if (!start || !canSwipe || slides.length <= 1) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      start.horizontal = true;
    }
    if (!start.horizontal) return;
    event.preventDefault();
    // v0.9.44-dev 问题 4: 边界阻尼 — 第一张右滑 / 最后一张左滑, 位移压到 25%
    const isAtStart = safeIndex === 0 && dx > 0;
    const isAtEnd = safeIndex === slides.length - 1 && dx < 0;
    setDragOffset(isAtStart || isAtEnd ? dx * 0.25 : dx);
  }, [canSwipe, safeIndex, slides.length]);

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    setIsDragging(false);
    if (!start || !canSwipe || slides.length <= 1) {
      setDragOffset(0);
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const dt = Math.max(1, performance.now() - start.time);
    const velocity = dx / dt;
    const horizontal = start.horizontal || (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.2);
    if (horizontal && Math.abs(dx) > 5) markSwipe();
    if (horizontal && (Math.abs(dx) > 56 || Math.abs(velocity) > 0.65)) {
      commitIndex(getSwipeNextIndex(safeIndex, dx < 0 ? "next" : "previous", slides.length));
    }
    setDragOffset(0);
  }, [canSwipe, commitIndex, markSwipe, safeIndex, slides.length]);

  const suppressBubbledClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }, []);

  const handleImageClick = useCallback((slide: SwipeImageSlide) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onImageClick?.(slide, safeIndex);
  }, [onImageClick, safeIndex]);

  const handleAddClick = useCallback((slide: SwipeAddSlide) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onAddClick?.(slide, safeIndex);
  }, [onAddClick, safeIndex]);

  const handleCustomClick = useCallback((slide: SwipeCustomSlide) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
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

  // v0.9.44-dev 问题 3: Track 像素位移 = -safeIndex * containerWidth + dragOffset。
  // - 拖动时 (isDragging=true): transition.duration=0, 跟手
  // - 释放时: spring 回弹到 -safeIndex * containerWidth
  // - 边界阻尼已在 handlePointerMove 里 (dragOffset = dx * 0.25)
  const trackX = -safeIndex * containerWidth + dragOffset;
  // v0.9.44-dev 问题 3 性能: 只渲染当前 ± 1 邻居, 其余渲染占位 div 撑宽度。
  // 这样三页紧邻 (prev/current/next) 都已挂载, 拖动时能立刻看到。
  const renderSlide = (i: number) => {
    if (i < safeIndex - 1 || i > safeIndex + 1) return null;
    const slide = slides[i];
    if (!slide) return null;
    if (slide.kind === "image") {
      return (
        <SwipeImagePage
          slide={slide}
          isDragging={isDragging}
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={suppressBubbledClick}
    >
      <motion.div
        className="absolute inset-y-0 left-0 flex h-full"
        style={{ width: `${slides.length * 100}%` }}
        // 问题 5: initial={false} → 挂载时不跑 x:±10 入场动画 (静态出现)
        initial={false}
        animate={{ x: containerWidth > 0 ? trackX : 0 }}
        transition={isDragging
          ? { duration: 0 }
          : { type: "spring", stiffness: 360, damping: 34 }}
      >
        {slides.map((slide, i) => {
          const isCurrent = i === safeIndex;
          // 拖动时邻居 (±1) 可见, 静态时只有当前页可见
          // - 避免 Playwright 把 off-screen 兄弟误判为可点击
          // - 避免 a11y 把隐藏的图片纳入 tab/screen-reader 序列
          const isVisible = isCurrent || (isDragging && Math.abs(i - safeIndex) <= 1);
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
