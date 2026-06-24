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
}

export function GarmentImage({
  src,
  alt,
  className = "",
  imageClassName,
  fallbackSize = 32,
  onClick,
  fallbackSrc,
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

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full h-full">
        {img}
      </button>
    );
  }

  return img;
}
