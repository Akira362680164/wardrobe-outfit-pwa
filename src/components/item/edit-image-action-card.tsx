"use client";

import type { ReactNode } from "react";
import { Crop, ImageIcon, Loader2, RefreshCw, X } from "lucide-react";
import { GarmentImage } from "@/components/garment-image";
import { EditSectionCard } from "@/components/item-shell/edit-section-card";
import type { ImageAssetReference } from "@/lib/types";

interface EditImageActionCardProps {
  imageUrl?: string;
  asset?: ImageAssetReference;
  alt: string;
  onCrop?: () => void;
  onRecognize: () => void;
  recognizing?: boolean;
  onRemove?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  recognizeDisabled?: boolean;
  cropDisabled?: boolean;
  extraAction?: ReactNode;
}

export function EditImageActionCard({
  imageUrl,
  asset,
  alt,
  onCrop,
  onRecognize,
  recognizing = false,
  onRemove,
  onAdd,
  addLabel = "添加图片",
  recognizeDisabled = false,
  cropDisabled = false,
  extraAction,
}: EditImageActionCardProps) {
  const hasImage = Boolean(imageUrl || asset);

  return (
    <EditSectionCard className="p-4">
      <div className="flex items-center gap-4">
        <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-[20px] border border-[rgba(29,34,40,0.06)] bg-[#f4f5f3] p-2" aria-label="图片预览">
          {hasImage ? (
            <>
              <div className="h-full w-full overflow-hidden rounded-[12px] bg-[#fffffc]">
                <GarmentImage src={imageUrl} asset={asset} alt={alt} fallbackSize={34} imageClassName="bg-[#fffffc] object-cover" />
              </div>
              {onRemove ? (
                <button
                  type="button"
                  onClick={onRemove}
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-[12px] bg-black/55 text-white active:scale-95 transition-transform"
                  aria-label="移除图片"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="grid h-full w-full place-items-center rounded-[12px] bg-[#fffffc] text-[#1d2228]/40"
              aria-label={addLabel}
            >
              <span className="grid place-items-center gap-1 text-center text-[11px] font-semibold">
                <ImageIcon size={28} aria-hidden="true" />
                {addLabel}
              </span>
            </button>
          )}
        </div>

        <div className="grid min-w-0 flex-1 gap-2">
          <button
            type="button"
            onClick={onCrop}
            disabled={cropDisabled || !hasImage || !onCrop}
            className="inline-flex h-11 items-center justify-center gap-2 ui-control-radius border border-[rgba(29,34,40,0.10)] bg-[#fffffc] px-3 text-sm font-semibold text-[#1d2228]/70 disabled:opacity-45 whitespace-nowrap"
          >
            <Crop size={15} aria-hidden="true" />
            重新裁切
          </button>
          <button
            type="button"
            onClick={onRecognize}
            disabled={recognizeDisabled || recognizing || !hasImage}
            className="inline-flex h-11 items-center justify-center gap-2 ui-control-radius bg-[#355c7d] px-3 text-sm font-semibold text-[#fffffc] disabled:opacity-60 whitespace-nowrap"
          >
            {recognizing ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            {recognizing ? "识别中" : "重新识别"}
          </button>
          {extraAction}
        </div>
      </div>
    </EditSectionCard>
  );
}
