"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCroppedImageLayout, type CroppedImageLayout } from "@/lib/crop-render-math";

interface OriginalCroppedImageProps {
  originalSrc?: string;
  thumbnailSrc?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  alt: string;
  className?: string;
  onOriginalLoadError?: () => void;
}

export function OriginalCroppedImage({
  originalSrc,
  thumbnailSrc,
  cropBox,
  alt,
  className = "",
  onOriginalLoadError,
}: OriginalCroppedImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [layout, setLayout] = useState<CroppedImageLayout | null>(null);
  const [originalLoaded, setOriginalLoaded] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);

  const safeBox = cropBox && cropBox.width > 0 && cropBox.height > 0
    ? cropBox
    : { x: 0, y: 0, width: 1, height: 1 };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!naturalSize || !containerSize) { setLayout(null); return; }
    setLayout(getCroppedImageLayout({
      naturalWidth: naturalSize.w,
      naturalHeight: naturalSize.h,
      viewportWidth: containerSize.w,
      viewportHeight: containerSize.h,
      cropBox: safeBox,
    }));
  }, [naturalSize, containerSize, safeBox]);

  const handleOriginalLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setOriginalLoaded(true);
  }, []);

  const handleOriginalError = useCallback(() => {
    setOriginalFailed(true);
    onOriginalLoadError?.();
  }, [onOriginalLoadError]);

  if (!originalSrc && !thumbnailSrc) {
    return (
      <div className={`grid h-full w-full place-items-center bg-mist text-xs text-ink/45 ${className}`}>
        暂无图片
      </div>
    );
  }

  const showThumbnail = !originalLoaded || !layout;
  const showOriginal = originalLoaded && layout && !originalFailed;

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* thumbnail placeholder */}
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={alt}
          className={`absolute inset-0 h-full w-full object-contain transition-opacity ${showThumbnail ? "opacity-100" : "opacity-0"}`}
        />
      ) : showThumbnail ? (
        <div className="absolute inset-0 grid place-items-center bg-mist text-xs text-ink/35">
          正在加载原图
        </div>
      ) : null}

      {/* original image load detector (hidden) */}
      {originalSrc ? (
        <img
          ref={imgRef}
          src={originalSrc}
          alt=""
          className="hidden"
          onLoad={handleOriginalLoad}
          onError={handleOriginalError}
        />
      ) : null}

      {/* cropped original viewport */}
      {showOriginal && layout ? (
        <div
          className="absolute overflow-hidden"
          style={{
            left: layout.viewportLeft,
            top: layout.viewportTop,
            width: layout.viewportWidth,
            height: layout.viewportHeight,
          }}
        >
          <img
            src={originalSrc}
            alt={alt}
            className="absolute max-w-none"
            style={{
              left: layout.imageLeft,
              top: layout.imageTop,
              width: layout.imageWidth,
              height: layout.imageHeight,
            }}
          />
        </div>
      ) : null}

      {/* error state */}
      {originalFailed && thumbnailSrc ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-[10px] text-white backdrop-blur-sm">
          原图加载失败，请重试
        </div>
      ) : null}
    </div>
  );
}
