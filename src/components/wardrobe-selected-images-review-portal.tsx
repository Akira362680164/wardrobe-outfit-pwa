"use client";

// src/components/wardrobe-selected-images-review-portal.tsx
// v1.1.9 4C Follow-up: 从 wardrobe-app.tsx 迁移 SelectedImagesReview portal 逻辑。

import React, { useCallback, useRef, useState } from "react";
import { SelectedImagesReview, type CaptureImageQueueItem, type SelectedImagesReviewMode } from "@/components/selected-images-review";
import { OverlayPortal, useOverlayFocusScope, useOverlayLayer } from "@/components/overlay-root";
import { useScrollLock } from "@/lib/use-scroll-lock";

export interface WardrobeSelectedImagesReviewPortalProps {
  images: CaptureImageQueueItem[];
  currentIndex: number;
  onCurrentIndexChange: (next: number) => void;
  processing: boolean;
  progress: {
    label: string;
    stage: string;
    percent: number;
    visible: boolean;
  };
  onCropCurrent: () => void;
  onDelete: (clientId: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  cropping: boolean;
  confirmText: string;
  title: string;
  maxCount: number;
  mode: SelectedImagesReviewMode;
}

export function WardrobeSelectedImagesReviewPortal(
  props: WardrobeSelectedImagesReviewPortalProps,
): React.JSX.Element | null {
  const {
    images,
    currentIndex,
    onCurrentIndexChange,
    processing,
    progress,
    onCropCurrent,
    onDelete,
    onCancel,
    onConfirm,
    cropping,
    confirmText,
    title,
    maxCount,
    mode,
  } = props;

  const [confirming, setConfirming] = useState(false);
  const [blockedAnnouncement, setBlockedAnnouncement] = useState("");
  const layerRef = useRef<HTMLDivElement | null>(null);
  const busy = processing || cropping || confirming;
  useScrollLock(true);

  const handleConfirm = useCallback(async () => {
    if (busy) return;
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }, [busy, onConfirm]);
  const canDismiss = useCallback(() => !busy, [busy]);
  const { overlayId, isTopmost } = useOverlayLayer({
    kind: "dialog",
    dismissible: !busy,
    canDismiss,
    onDismiss: () => onCancel(),
    onDismissBlocked: () => setBlockedAnnouncement("图片正在处理中，暂时无法返回"),
  });
  useOverlayFocusScope(layerRef, isTopmost, '[data-selected-images-cancel="true"]');

  return (
    <OverlayPortal>
      <div
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy || undefined}
        aria-hidden={isTopmost ? undefined : "true"}
        inert={isTopmost ? undefined : true}
        tabIndex={-1}
        data-overlay-layer={overlayId}
        data-overlay-kind="dialog"
        data-overlay-topmost={isTopmost ? "true" : "false"}
        className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-paper outline-none"
      >
      <SelectedImagesReview
        images={images}
        currentIndex={currentIndex}
        onCurrentIndexChange={onCurrentIndexChange}
        processing={processing || confirming}
        progress={progress}
        onCropCurrent={onCropCurrent}
        onDelete={onDelete}
        onCancel={onCancel}
        onConfirm={handleConfirm}
        cropping={cropping}
        confirmText={confirmText}
        title={title}
        maxCount={maxCount}
        mode={mode}
      />
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {blockedAnnouncement}
        </span>
      </div>
    </OverlayPortal>
  );
}
