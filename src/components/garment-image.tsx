"use client";

import { Shirt } from "lucide-react";
import { useCallback, useState } from "react";

interface GarmentImageProps {
  src?: string;
  alt: string;
  className?: string;
  /** 覆盖图片 (img) 的背景色, 例如 "bg-transparent" 让图片融入沉浸式详情页的浅雾面背景 */
  imageClassName?: string;
  fallbackSize?: number;
  onClick?: () => void;
  // v0.9.43-dev 批次 3: 缩略图加载失败时的 fallback (通常是 display 图)。
  // 加载失败时切到 fallbackSrc, fallback 也失败时显示 broken image 占位 (浏览器默认行为, 不再切)。
  fallbackSrc?: string;
  /** 裁切框 (归一化坐标 0-1)，存在时用 CSS overflow-hidden 裁剪展示原图 */
  cropBox?: { x: number; y: number; width: number; height: number };
}

export function GarmentImage({
  src,
  alt,
  className = "",
  imageClassName,
  fallbackSize = 32,
  onClick,
  fallbackSrc,
  cropBox,
}: GarmentImageProps) {
  // 默认 bg-white (列表卡片白底) 可被 imageClassName 覆盖 (沉浸式详情页用 bg-transparent 融入雾面)
  const imgBackground = imageClassName ?? "bg-white";
  const shared = `h-full w-full object-contain ${imgBackground} ${className}`;

  // v0.9.43-dev 批次 3: 缩略图加载失败 fallback 状态机 (按 §5 纪律: 只发生一次, 不无限 setState)。
  const [renderedSrc, setRenderedSrc] = useState<string | null>(null);
  const handleError = useCallback(() => {
    if (!fallbackSrc || renderedSrc === fallbackSrc) return;
    setRenderedSrc(fallbackSrc);
  }, [fallbackSrc, renderedSrc]);
  const activeSrc = renderedSrc ?? src;

  if (!src) {
    return (
      <div className={`grid h-full place-items-center text-ink/40 ${className}`}>
        <Shirt size={fallbackSize} />
      </div>
    );
  }

  const img = (
    /* eslint-disable-next-line @next/next/no-img-element -- base component for local data-URL images, not a static asset path */
    <img
      src={activeSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={fallbackSrc ? handleError : undefined}
      className={shared}
    />
  );

  // ponytail: CSS-based crop via overflow-hidden container + percentage positioning.
  // No canvas, no async — pure CSS. The image is the ORIGINAL, scaled so the
  // crop region fills the container, with negative offsets to hide cropped areas.
  if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
    const scaleX = 100 / cropBox.width;
    const scaleY = 100 / cropBox.height;
    const leftPct = -(cropBox.x / cropBox.width) * 100;
    const topPct = -(cropBox.y / cropBox.height) * 100;

    const croppedImg = (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{ aspectRatio: `${cropBox.width} / ${cropBox.height}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={fallbackSrc ? handleError : undefined}
          className={`absolute ${imgBackground}`}
          style={{
            width: `${scaleX}%`,
            height: `${scaleY}%`,
            left: `${leftPct}%`,
            top: `${topPct}%`,
          }}
        />
      </div>
    );

    if (onClick) {
      return (
        <button type="button" onClick={onClick} className="w-full h-full">
          {croppedImg}
        </button>
      );
    }
    return croppedImg;
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full h-full">
        {img}
      </button>
    );
  }

  return img;
}
