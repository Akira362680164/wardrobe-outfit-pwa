"use client";

import { Shirt } from "lucide-react";
import { useCallback, useState } from "react";
import { OnlineAssetImage } from "@/components/online/online-asset-image";
import type { ImageAssetReference } from "@/lib/types";

interface GarmentImageProps {
  src?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackSize?: number;
  onClick?: () => void;
  fallbackSrc?: string;
  asset?: ImageAssetReference;
}

export function GarmentImage({
  src,
  alt,
  className = "",
  imageClassName,
  fallbackSize = 32,
  onClick,
  fallbackSrc,
  asset,
}: GarmentImageProps) {
  const imgBackground = imageClassName ?? "bg-white";
  const shared = `h-full w-full object-contain ${imgBackground} ${className}`;

  const [renderedSrc, setRenderedSrc] = useState<string | null>(null);
  const handleError = useCallback(() => {
    if (!fallbackSrc || renderedSrc === fallbackSrc) return;
    setRenderedSrc(fallbackSrc);
  }, [fallbackSrc, renderedSrc]);
  const activeSrc = renderedSrc ?? src;

  if (asset) {
    return <OnlineAssetImage asset={asset} variant="thumbnail" alt={alt} className={className} imageClassName={imageClassName} fallback={<div className={`grid h-full place-items-center text-ink/40 ${className}`}><Shirt size={fallbackSize} /></div>} />;
  }

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
