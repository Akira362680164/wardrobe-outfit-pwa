"use client";

/**
 * v1.1.23 six-page design §2.6: ItemImageHeader 统一组件。
 *
 * - mode="view"   : P3/P5 详情页只读大图 (aspect 3:4, 28 列宽)；可放标题/meta 行由调用方决定。
 * - mode="edit"   : P4/P6 编辑页缩略图 + [重新裁切] [重新识别] 两个 action。
 * - 不展示 AI 置信度数字（详情/编辑页禁止）。
 */

import type { ReactNode } from "react";
import { GarmentImage } from "@/components/garment-image";

export interface ItemImageHeaderProps {
  imageUrl?: string;
  alt: string;
  mode: "view" | "edit";
  /** 裁切框，用于 CSS 裁切展示原图 */
  cropBox?: { x: number; y: number; width: number; height: number };
  /** 编辑模式下：重新裁切 / 重新识别按钮（可省略）。 */
  actions?: ReactNode;
  className?: string;
}

export function ItemImageHeader({ imageUrl, alt, mode, actions, className, cropBox }: ItemImageHeaderProps) {
  return (
    <section
      className={["surface rounded-lg p-3", className ?? ""].filter(Boolean).join(" ")}
      aria-label={mode === "view" ? "衣物图片预览" : "编辑图片预览"}
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            "aspect-[3/4] shrink-0 overflow-hidden rounded-xl bg-mist",
            mode === "view" ? "w-28 sm:w-36" : "w-28",
          ].join(" ")}
        >
          <GarmentImage src={imageUrl} alt={alt} fallbackSize={34} imageClassName="bg-transparent" cropBox={cropBox} />
        </div>
        {mode === "edit" ? (
          <div className="grid min-w-0 flex-1 gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
