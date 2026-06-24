// src/components/wardrobe-selected-images-review-portal.tsx
// v1.1.9 4C Follow-up: 从 wardrobe-app.tsx 迁移 SelectedImagesReview portal 逻辑。

import React from "react";
import { createPortal } from "react-dom";
import { SelectedImagesReview, type CaptureImageQueueItem, type SelectedImagesReviewMode } from "@/components/selected-images-review";

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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#fbfbf8]">
      <SelectedImagesReview
        images={images}
        currentIndex={currentIndex}
        onCurrentIndexChange={onCurrentIndexChange}
        processing={processing}
        progress={progress}
        onCropCurrent={onCropCurrent}
        onDelete={onDelete}
        onCancel={onCancel}
        onConfirm={onConfirm}
        cropping={cropping}
        confirmText={confirmText}
        title={title}
        maxCount={maxCount}
        mode={mode}
      />
    </div>,
    document.body,
  );
}