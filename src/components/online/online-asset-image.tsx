"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useOnlineWorkspaceGate } from "@/components/auth/workspace-gate";
import { OnlineImageLoadError, OnlineImagePlaceholder } from "@/components/online/online-image-state";
import { OriginalCroppedImage } from "@/components/original-cropped-image";
import { OnlineRequestError } from "@/lib/online/online-error";
import type { OnlineImageVariant } from "@/lib/online/online-image-client";
import type { ImageAssetReference } from "@/lib/types";

export function useOnlineAssetUrl(asset: ImageAssetReference | undefined, variant: OnlineImageVariant, fallbackUrl?: string) {
  const gate = useOnlineWorkspaceGate();
  const [state, setState] = useState<{ status: "idle" | "loading" | "loaded" | "error"; url?: string }>({ status: asset ? "loading" : "idle", url: fallbackUrl });
  const retryingRef = useRef(false);
  const expectedSha256 = asset?.variantSha256?.[variant] ?? (variant === "original" ? asset?.sha256 : undefined);

  useEffect(() => {
    let active = true;
    if (!asset || !gate || !asset.variants.includes(variant)) {
      setState({ status: "idle", url: fallbackUrl });
      return;
    }
    setState((current) => ({ status: "loading", url: current.url ?? fallbackUrl }));
    void gate.repository.images.acquire(asset.assetId, variant, expectedSha256).then(
      (url) => { if (active) setState({ status: "loaded", url }); },
      async (error) => {
        if (error instanceof OnlineRequestError && error.status === 401 && await gate.recoverImages()) {
          return;
        }
        if (error instanceof OnlineRequestError && error.status === 401) {
          // Let the gate refresh the session and bump its image generation;
          // the effect will acquire this asset again with the fresh session.
          void gate.recoverImages(true);
          return;
        }
        if (active) setState({ status: "error", url: fallbackUrl });
      },
    );
    return () => {
      active = false;
      gate.repository.images.release(asset.assetId, variant, expectedSha256);
    };
  }, [asset, fallbackUrl, gate, gate?.imageRefreshVersion, variant]);

  const retry = useCallback(() => {
    if (!asset || !gate) return;
    if (retryingRef.current) return;
    retryingRef.current = true;
    setState((current) => ({ status: "loading", url: current.url ?? fallbackUrl }));
    void gate.repository.images.retry(asset.assetId, variant, expectedSha256).then(
      (url) => setState({ status: "loaded", url }),
      async (error) => {
        if (error instanceof OnlineRequestError && error.status === 401 && await gate.recoverImages(true)) {
          try {
            const url = await gate.repository.images.retry(asset.assetId, variant, expectedSha256);
            setState({ status: "loaded", url });
            return;
          } catch { /* fall through to the visible retry state */ }
        }
        setState({ status: "error", url: fallbackUrl });
      },
    ).finally(() => { retryingRef.current = false; });
  }, [asset, expectedSha256, fallbackUrl, gate, variant]);

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
        ? <button type="button" data-parity-id="parity.app.app.src.components.online.online.asset.image.fd9596b99a" onClick={() => onOpen(image.url!)} className="h-full w-full"><img src={image.url} alt={alt} decoding="async" onError={image.retry} className={`h-full w-full object-contain transition-opacity duration-150 ${imageClassName}`} /></button>
        : <img src={image.url} alt={alt} decoding="async" onError={image.retry} className={`h-full w-full object-contain transition-opacity duration-150 ${imageClassName}`} />)
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
    ? <button type="button" className="h-full w-full" data-parity-id="parity.app.app.src.components.online.online.asset.image.09a7d01685" onClick={() => onOpen(original.url!)}>{content}</button>
    : content}</div>;
}
