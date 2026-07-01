"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useOnlineWorkspaceGate } from "@/components/auth/workspace-gate";
import { OnlineImageLoadError, OnlineImagePlaceholder } from "@/components/online/online-image-state";
import { getOnlineAssetMetadata } from "@/lib/online/online-repository";
import type { OnlineImageVariant } from "@/lib/online/online-image-client";

export function useOnlineAssetUrl(entity: object, field: string, variant: OnlineImageVariant, fallbackUrl?: string) {
  const gate = useOnlineWorkspaceGate();
  const asset = getOnlineAssetMetadata(entity, field);
  const [state, setState] = useState<{ status: "idle" | "loading" | "loaded" | "error"; url?: string }>({ status: asset ? "loading" : "idle", url: fallbackUrl });

  useEffect(() => {
    let active = true;
    if (!asset || !gate || !asset.variants.includes(variant)) {
      setState({ status: "idle", url: fallbackUrl });
      return;
    }
    setState((current) => ({ status: "loading", url: current.url ?? fallbackUrl }));
    void gate.repository.images.load(asset.assetId, variant, asset.variantSha256?.[variant] ?? (variant === "original" ? asset.sha256 : undefined)).then(
      (url) => { if (active) setState({ status: "loaded", url }); },
      () => { if (active) setState({ status: "error", url: fallbackUrl }); },
    );
    return () => { active = false; };
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

export function OnlineAssetImage({ entity, field, variant, alt, className = "", imageClassName = "", fallback, onOpen }: {
  entity: object;
  field: string;
  variant: OnlineImageVariant;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallback?: ReactNode;
  onOpen?: (url: string) => void;
}) {
  const image = useOnlineAssetUrl(entity, field, variant);
  return <div className={className}>
    {image.status === "error" ? <OnlineImageLoadError onRetry={image.retry} />
      : image.url ? (onOpen
        ? <button type="button" onClick={() => onOpen(image.url!)} className="h-full w-full"><img src={image.url} alt={alt} decoding="async" className={`h-full w-full object-contain transition-opacity duration-150 ${imageClassName}`} /></button>
        : <img src={image.url} alt={alt} decoding="async" className={`h-full w-full object-contain transition-opacity duration-150 ${imageClassName}`} />)
        : image.hasAsset ? <OnlineImagePlaceholder /> : fallback ?? null}
  </div>;
}
