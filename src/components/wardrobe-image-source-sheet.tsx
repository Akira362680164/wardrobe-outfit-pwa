// src/components/wardrobe-image-source-sheet.tsx
// v1.1.9 4C: 从 wardrobe-app.tsx 迁移图片来源弹层 JSX。

import React from "react";
import { Camera, GalleryVerticalEnd, X } from "lucide-react";
import { MotionSheet } from "@/components/motion-common";

export interface WardrobeImageSourceSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onCameraClick: () => void;
  onGalleryClick: () => void;
}

export function WardrobeImageSourceSheet(props: WardrobeImageSourceSheetProps): React.JSX.Element | null {
  const { open, title, onClose, onCameraClick, onGalleryClick } = props;

  return (
    <MotionSheet
      open={open}
      onClose={onClose}
      ariaLabel={title}
      panelClassName="max-w-md p-0 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="px-4 pt-4 pb-3">
        {/* Header row: title left, close button right */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-ink">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full text-ink/50 hover:bg-ink/5"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* Source buttons */}
        <div className="flex flex-col gap-2">
          {/* 拍照录入 */}
          <button
            type="button"
            onClick={() => {
              onClose();
              requestAnimationFrame(() => onCameraClick());
            }}
            className="flex h-[72px] items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 text-left active:bg-mist"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-denim/10 text-denim">
              <Camera size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">拍照</div>
            </div>
          </button>

          {/* 相册录入 */}
          <button
            type="button"
            onClick={() => {
              onClose();
              requestAnimationFrame(() => onGalleryClick());
            }}
            className="flex h-[72px] items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 text-left active:bg-mist"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-denim/10 text-denim">
              <GalleryVerticalEnd size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">从相册导入</div>
            </div>
          </button>
        </div>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex w-full items-center justify-center h-12 rounded-xl bg-ink/5 text-sm font-semibold text-ink/70 active:bg-ink/10"
        >
          取消
        </button>
      </div>
    </MotionSheet>
  );
}
