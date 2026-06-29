"use client";

import { Shirt } from "lucide-react";
import { useCallback, useState } from "react";

interface GarmentImageProps {
  src?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackSize?: number;
  onClick?: () => void;
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
  const imgBackground = imageClassName ?? "bg-white";
  const shared = `h-full w-full object-contain ${imgBackground} ${className}`;

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
    /* eslint-disable-next-line @next/next/no-img-element */
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
