// src/components/wardrobe-hidden-image-inputs.tsx
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移全局隐藏 file input JSX。

import React from "react";

export interface WardrobeHiddenImageInputsProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  galleryInputRef: React.RefObject<HTMLInputElement | null>;
  onCameraInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGalleryInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function WardrobeHiddenImageInputs(props: WardrobeHiddenImageInputsProps): React.JSX.Element {
  const { fileInputRef, galleryInputRef, onCameraInputChange, onGalleryInputChange } = props;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onCameraInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        multiple
        className="hidden"
        onChange={onGalleryInputChange}
      />
    </>
  );
}
