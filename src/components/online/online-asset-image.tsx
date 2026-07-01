"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useOnlineWorkspaceGate } from "@/components/auth/workspace-gate";
import { OnlineImageLoadError, OnlineImagePlaceholder } from "@/components/online/online-image-state";
import { OriginalCroppedImage } from "@/components/original-cropped-image";
import type { OnlineImageVariant } from "@/lib/online/online-image-client";
import type { ImageAssetReference } from "@/lib/types";

export function useOnlineAssetUrl(asset: ImageAssetReference | undefined, variant: OnlineImageVariant, fallbackUrl?: string) {
  const gate = useOnlineWorkspaceGate();
  const [state, setState] = useState<{ status: "idle" | "loading" | "loaded" | "error"; url?: string }>({ status: asset ? "loading" : "idle", url: fallbackUrl });

  useEffect(() => {
    let active = true;
    if (!asset || !gate || !asset.variants.includes(variant)) {
      setState({ status: "idle", url: fallbackUrl });
      return;
    }
    setState((current) => ({ status: "loading", url: current.url ?? fallbackUrl }));
    const expectedSha256 = asset.variantSha256?.[variant] ?? (variant === "original" ? asset.sha256 : undefined);
    void gate.repository.images.acquire(asset.assetId, variant, expectedSha256).then(
      (url) => { if (active) setState({ status: "loaded", url }); },
      () => { if (active) setState({ status: "error", url: fallbackUrl }); },
    );
    return () => {
      active = false;
      gate.repository.images.release(asset.assetId, variant, expectedSha256);
    };
  }, [asset, fallbackUrl, gate, variant]);

  const retry = useCallback(() => {
    if (!asset || !gate) return;
    setState((current) => ({ status: "loading", url: current.url ?? fallbackUrl }));
    void gate.repository.images.retry(asset.assetId, variant, asset.variantSha256?.[variant] ?? (variant === "original" ? asset.sha256 : undefined)).then(
      (url) => setState({ status: "loaded", url }),
      () => setState({ status: "error", url: fallbackUrl }),
    );
  }, [asset, fallbackUrl, gate, variant]);

  return { ...state, retry, hasAsset: Boolean(asset?.variants.includes(variant)) };
}

export function OnlineAssetImage({ asset, variant, alt, className = "", imageClassName = "", fallback, onOpen }: {
  asset?: ImageAssetReference;
  variant: OnlineImageVariant;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  onOpen?: (url: string) => void;
}) {
  const image = useOnlineAssetUrl(asset, variant);
  return <div className={className}>
    {image.status === "error" ? <OnlineImageLoadError onRetry={image.retry} />
      : image.url ? (onOpen
        ? <button type="button" onClick={() => onOpen(image.url!)} className="h-full w-full"><img src={image.url} alt={alt} decoding="async" className={`h-full w-full object-contain transition-opacity duration-150 ${imageClassName}`} /></button>
        : <img src={image.url} alt={alt} decoding="async" className={`h-full w-full object-contain transition-opacity duration-150 ${imageClassName}`} />)
        : image.hasAsset ? <OnlineImagePlaceholder /> : fallback ?? null}
  </div>;
}

export function OnlineCroppedAssetImage({ asset, cropBox, alt, className = "", fallback, onOpen }: {
  asset?: ImageAssetReference;
  cropBox?: { x: number; y: number; width: number; height: number };
  alt: string;
  className?: string;
  fallback?: ReactNode;
  onOpen?: (url: string) => void;
}) {
  const thumbnail = useOnlineAssetUrl(asset, "thumbnail");
  const original = useOnlineAssetUrl(asset, "original");
  if (!asset) return <div className={className}>{fallback ?? null}</div>;
  if (original.status === "error" && !thumbnail.url) return <div className={className}><OnlineImageLoadError onRetry={original.retry} /></div>;
  const content = <OriginalCroppedImage originalSrc={original.url} thumbnailSrc={thumbnail.url} cropBox={cropBox} alt={alt} className="h-full w-full" onOriginalLoadError={original.retry} />;
  return <div className={className}>{onOpen && original.url
    ? <button type="button" className="h-full w-full" onClick={() => onOpen(original.url!)}>{content}</button>
    : content}</div>;
}
