"use client";
// ============================================================
// SelectedImagesReview (v0.9.32-dev)
// ------------------------------------------------------------
//共享的"已选图片队列预览"组件,用于两个场景:
//1. captureMode === "item" 时,用户从图库多选图片后的预览队列
// - mode="capture"
// - confirmText="继续识别"
// -确认后进入单件属性识别 / 单件批量识别
//2. 给现有衣物添加"参考穿搭图"时的预览队列
// - mode="reference"
// - confirmText="添加"
// -确认后写入 item.referenceOutfitImages,不进 AI识别
//
// 设计要点:
// -顶部:返回/取消 +标题 +继续按钮
// - 中部:当前图片大图预览
// -底部:横向缩略图队列(当前缩略图有选中态)
// -缩略图:点击切换 +各自独立的删除按钮
// -裁切按钮:只裁切当前图片,不强制裁切所有图片
// -复用现有 ImageCropEditor,不重写裁切器
// -取消 /确认都走 prop回调,不直接操作父级 state
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Crop, Trash2, X } from "lucide-react";
import { AiTaskProgressCard } from "@/components/motion-common";
import { SwipeImageCarousel, type SwipeSlide } from "@/components/swipe-image-carousel";
import { clampCarouselIndex } from "@/lib/carousel-logic";
import type { GarmentCropBox } from "@/lib/types";

export interface CaptureImageQueueItem {
 clientId: string;
 fileName: string;
 originalDataUrl: string;
 /** 当前显示的图(可能是 original, 也可能是从 original裁切后的导出图) */
 imageDataUrl: string;
 cropBox?: GarmentCropBox;
 cropped?: boolean;
 // v0.9.43-dev (批次 1 缩略图基础设施): 队列缩略图 dataURL。
 // 批次 2 会在 handleGallerySelect 同步生成; 批次 3 会在多图预览底部缩略图区使用。
 // 失败时保留 undefined, 不阻断主流程。
 thumbnailDataUrl?: string;
}

export type SelectedImagesReviewMode = "capture" | "reference";

export interface SelectedImagesReviewProps {
 images: CaptureImageQueueItem[];
 currentIndex: number;
 onCurrentIndexChange: (next: number) => void;
 onCropCurrent: () => void;
 onDelete: (clientId: string) => void;
 onCancel: () => void;
 onConfirm: () => void | Promise<void>;
 confirmText: string;
 title: string;
 maxCount: number;
 mode: SelectedImagesReviewMode;
 processing?: boolean;
 progress?: {
  label: string;
  stage: string;
  percent: number;
  visible: boolean;
 };
 /** 当前是否在裁切状态(由父级控制) */
 cropping?: boolean;
}

export function SelectedImagesReview({
 images,
 currentIndex,
 onCurrentIndexChange,
 onCropCurrent,
 onDelete,
 onCancel,
 onConfirm,
 confirmText,
 title,
 maxCount,
 mode,
 processing = false,
 progress,
 cropping,
}: SelectedImagesReviewProps) {
 const [confirming, setConfirming] = useState(false);
 const busy = confirming || processing;

 const handleConfirm = useCallback(async () => {
 if (busy || images.length ===0) return;
 setConfirming(true);
 try {
 await onConfirm();
 } finally {
 setConfirming(false);
 }
 }, [busy, images.length, onConfirm]);

 const safeIndex = clampCarouselIndex(currentIndex, images.length);
 const current = images[safeIndex];

 useEffect(() => {
   if (images.length > 0 && safeIndex !== currentIndex) onCurrentIndexChange(safeIndex);
 }, [currentIndex, images.length, onCurrentIndexChange, safeIndex]);

 // v0.9.43-dev 批次 6: 双图源 — 拖动用 thumbnailDataUrl, 停稳用 imageDataUrl (批次 6 §2 规则)
 const slides: SwipeSlide[] = useMemo(() => images.map((item, i) => ({
   kind: "image" as const,
   id: item.clientId,
   imageDataUrl: item.imageDataUrl,
   thumbnailSrc: item.thumbnailDataUrl ?? item.imageDataUrl,
   displaySrc: item.imageDataUrl,
   sourceSrc: item.originalDataUrl,
   alt: item.fileName,
   badge: i === 0 && mode === "reference" ? "主图" : (mode === "capture" && i > 0 ? `第 ${i + 1} 张` : (mode === "reference" && i > 0 ? "参考" : undefined)),
   badgeClassName: i === 0 && mode === "reference" ? "bg-denim" : "bg-clay",
   realIndex: i,
 })), [images, mode]);

 if (images.length ===0 || !current) return null;

 return (
 <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#fbfbf8]">
 {/*顶部:返回 +标题 +确认 */}
 <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-ink/10 bg-white px-3">
 <button
 type="button"
 onClick={onCancel}
 disabled={busy}
 aria-label="返回"
 className="grid h-11 w-11 place-items-center rounded-full text-ink/70 hover:bg-ink/5 disabled:opacity-50"
 >
 <ChevronLeft size={20} aria-hidden="true" />
 </button>
 <h1 className="min-w-0 truncate text-sm font-semibold text-ink/80">{title}</h1>
 <button
 type="button"
 onClick={handleConfirm}
 disabled={busy || images.length > maxCount}
 aria-label={confirmText}
 className="inline-flex h-10 items-center gap-1 rounded-lg bg-denim px-4 text-sm font-semibold text-white disabled:opacity-60"
 style={{ backgroundColor: "#355c7d" }}
 >
 {busy ? "处理中..." : confirmText}
 </button>
 </header>

 {/* 中部:大图预览 (flex-1 + min-h-0,确保图片缩在固定视口,竖图不会挤出底部) */}
 <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-mist p-3">
 {current.imageDataUrl ? (
 <SwipeImageCarousel
 slides={slides}
 index={safeIndex}
 onIndexChange={onCurrentIndexChange}
 variant="review"
 className="h-full w-full max-h-full max-w-full rounded-xl"
 imageClassName="object-contain"
 showDots={images.length > 1}
 showCounter={images.length > 1}
 enableSwipe={images.length > 1 && !cropping && !busy}
 ariaLabel="图片队列预览"
 />
 ) : null}
 </div>

 {progress?.visible ? (
 <div className="shrink-0 border-t border-denim/10 bg-white px-3 py-2">
 <AiTaskProgressCard
 label={progress.label}
 stage={progress.stage}
 progress={progress.percent}
 visible={progress.visible}
 />
 </div>
 ) : null}

 {/*底部:操作 +缩略图队列 (固定底部,含 safe-area-inset-bottom) */}
 <div className="shrink-0 border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)]">
 {/*裁切 + 删除当前图片 +提示 */}
 <div className="flex items-center justify-between gap-2 px-3 py-2">
 <button
 type="button"
 onClick={() => onDelete(current.clientId)}
 disabled={busy}
 aria-label={`删除${current.fileName}`}
 className="inline-flex h-10 items-center gap-1 rounded-lg border border-ink/10 px-3 text-xs font-semibold text-ink/65 active:bg-mist disabled:opacity-50"
 >
 <Trash2 size={14} aria-hidden="true" />
 删除
 </button>
 <span className="text-[11px] text-ink/55">
 第 {safeIndex +1} / {images.length} 张 · {current.cropped ? "已裁切" : "未裁切"}
 </span>
 <button
 type="button"
 onClick={onCropCurrent}
 disabled={busy || !current.originalDataUrl}
 aria-label="裁切当前图片"
 className="inline-flex h-10 items-center gap-1 rounded-lg border border-ink/10 px-3 text-xs font-semibold text-ink/65 active:bg-mist disabled:opacity-50"
 >
 <Crop size={14} aria-hidden="true" />
 裁切
 </button>
 </div>

 {/*横向缩略图队列 */}
 <div className="flex gap-2 overflow-x-auto px-3 pb-3 hide-scrollbar">
 {images.map((item, idx) => {
 const active = idx === safeIndex;
 return (
 <div
 key={item.clientId}
 role="button"
 tabIndex={0}
 onClick={() => {
 if (!busy) onCurrentIndexChange(idx);
 }}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 if (!busy) onCurrentIndexChange(idx);
 }
 }}
 aria-label={`切换到第 ${idx +1} 张`}
 aria-current={active ? "true" : undefined}
 aria-disabled={busy ? "true" : undefined}
 className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-denim focus-visible:ring-offset-1 ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
 active ? "border-denim" : "border-ink/10 hover:border-ink/30"
 }`}
 style={{ width:64, height:64 }}
 >
  {/* eslint-disable-next-line @next/next/no-img-element -- 本地 dataURL缩略图 */}
  <img
   src={item.thumbnailDataUrl ?? item.imageDataUrl}
   alt={item.fileName}
   className="h-full w-full object-cover"
   draggable={false}
  />
 {/* 角标:显示当前是第几张,不靠双蓝框表达选中态 */}
 {active ? (
 <span
 className="absolute left-1 top-1 z-10 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-denim px-1.5 text-[10px] font-semibold text-white tabular-nums"
 aria-hidden="true"
 >
 {idx +1}
 </span>
 ) : null}
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 onDelete(item.clientId);
 }}
 disabled={busy}
 aria-label={`删除缩略图 ${item.fileName}`}
 className="absolute right-0.5 top-0.5 z-20 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-50"
 >
 <X size={12} aria-hidden="true" />
 </button>
 </div>
 );
 })}
 {images.length < maxCount ? (
 <div
 className="shrink-0 grid place-items-center rounded-lg border border-dashed border-ink/15 text-[10px] text-ink/40"
 style={{ width:64, height:64 }}
 aria-hidden="true"
 >
 最多 {maxCount} 张
  </div>
  ) : null}
  </div>
  </div>

  {/* v0.9.38-dev P0 §5.1 方案 A: 队列裁切全部走 wardrobe-app.tsx 顶层 captureCropJob
   * 驱动的全屏 portal ImageCropEditor, 这里不再渲染 embedded 裁切器。
   * 父级 setCaptureCropJob({...}) 触发后, line 1443 的全屏 portal ImageCropEditor
   * 渲染到 document.body, 视觉上覆盖整个 selected-images-review。
   * 关闭裁切器 (onCancel / onConfirm) 后父级 setCaptureCropJob(null),
   * cropping=false, selected-images-review 重新可见。
   * 队列横滑在 cropping=true 时已由 SwipeImageCarousel enableSwipe={!cropping} disable。 */}
  </div>
  );
}
