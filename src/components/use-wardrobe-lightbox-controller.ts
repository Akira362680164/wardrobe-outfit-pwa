// src/components/use-wardrobe-lightbox-controller.ts
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移图片预览 lightbox 状态。

import { useState, useCallback } from "react";

export interface WardrobeExpandedImage {
  src: string;
  alt: string;
  thumbnailSrc?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  displayMode?: "original-cropped";
}

export function useWardrobeLightboxController() {
  const [expandedImage, setExpandedImage] = useState<WardrobeExpandedImage | null>(null);

  const openExpandedImage = useCallback((image: WardrobeExpandedImage) => {
    setExpandedImage(image);
  }, []);

  const closeExpandedImage = useCallback(() => {
    setExpandedImage(null);
  }, []);

  return {
    expandedImage,
    openExpandedImage,
    closeExpandedImage,
  };
}
