"use client";
// ============================================================
// ImageCropEditor (v0.9.32-dev round-2 重做, 保留微信截图样式)
// ============================================================
// 两种 variant:
// - "fullscreen" (默认): fixed inset-0 全屏编辑器, 自带顶部 56 + 底部 88 工具栏。
//   用于编辑页"重新裁切"等独立入口。
// - "embedded": 不 fixed, 容器 relative + h-full + w-full 充满父级, 不渲染任何工具栏。
//   工具栏由父级 (SelectedImagesReview) 渲染, 永远在缩略图队列上方一行。
//
// 裁切框样式 (按用户参考的微信截图样式):
// - 边框: 1.5px solid white (细, 减 "两个框" 感)
// - 4 角 L + 4 边短横: 保留 (用户截图里的标志性视觉)
// - 蒙层: rgba(0,0,0,0.4) (从 0.55 降到 0.4, 减暗)
// - 9 宫格: 保留
// ============================================================
import { animate, useReducedMotion } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { OverlayPortal, useOverlayLayer } from "@/components/overlay-root";
import { cropFromOriginal } from "@/lib/image";
import { spring } from "@/lib/motion-tokens";
import { useScrollLock } from "@/lib/use-scroll-lock";
import {
  applyCropFrameDrag,
  clampCropFrameToImage,
  getContainedImageRect,
  getInitialCropFrameInImage,
  screenFrameToCropBox,
  type AspectRatio,
  type CropFrame,
  type CropFrameHandle,
  type ImageFitRect,
  type NormalizedCropBox,
  type Viewport,
} from "@/lib/cropper-math";

export type ImageCropEditorVariant = "fullscreen" | "embedded";

export interface ImageCropEditorHandle {
  /** 触发裁切: 从 sourceUrl 导出高清裁切, 调用 onConfirm, 切换 confirming 态 */
  runConfirm: () => Promise<void>;
  /** 还原: 回到原始 source + 清空旋转 + 重新初始化裁切框 */
  reset: () => void;
  /** 顺时针旋转 90° */
  rotate: () => void;
  /** 逆时针旋转 90° */
  rotateLeft: () => void;
  /** 顺时针旋转 90° */
  rotateRight: () => void;
  /** 当前是否已 ready (imageRect + cropFrame 已计算) */
  isReady: boolean;
  /** 内部 confirming / rotating 状态 (父级可读) */
  confirming: boolean;
  rotating: boolean;
}

export interface ImageCropEditorProps {
  source: string;
  initialCropBox?: NormalizedCropBox;
  aspectRatio?: AspectRatio;
  variant?: ImageCropEditorVariant;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string, cropBox: NormalizedCropBox) => Promise<void> | void;
  onError?: (message: string) => void;
  onReadyChange?: (ready: boolean) => void;
}

interface PointerSnapshot { x: number; y: number; }

interface CropDragState {
  pointerId: number;
  handle: CropFrameHandle;
  origin: PointerSnapshot;
  rawFrame: CropFrame;
}

const CROP_EDGE_RESISTANCE = 0.55;

function framesAlmostEqual(a: CropFrame, b: CropFrame, epsilon = 0.1): boolean {
  return Math.abs(a.x - b.x) <= epsilon
    && Math.abs(a.y - b.y) <= epsilon
    && Math.abs(a.width - b.width) <= epsilon
    && Math.abs(a.height - b.height) <= epsilon;
}

function cropResistanceLimit(imageRect: ImageFitRect): number {
  const shortEdge = Math.max(1, Math.min(imageRect.width, imageRect.height));
  return Math.max(18, Math.min(44, shortEdge * 0.12));
}

/** Progressive edge resistance used only for the cropper's presentation value. */
export function rubberBandCropDistance(distance: number, imageRect: ImageFitRect): number {
  if (!Number.isFinite(distance) || distance === 0) return 0;
  const limit = cropResistanceLimit(imageRect);
  const magnitude = Math.abs(distance);
  const resisted = limit * (1 - 1 / (magnitude * CROP_EDGE_RESISTANCE / limit + 1));
  return Math.sign(distance) * resisted;
}

function unRubberBandCropDistance(distance: number, imageRect: ImageFitRect): number {
  if (!Number.isFinite(distance) || distance === 0) return 0;
  const limit = cropResistanceLimit(imageRect);
  const ratio = Math.min(Math.abs(distance) / limit, 0.999);
  const magnitude = (ratio / Math.max(1 - ratio, 0.001)) * limit / CROP_EDGE_RESISTANCE;
  return Math.sign(distance) * magnitude;
}

function restoreRawCropFrame(
  presentation: CropFrame,
  legal: CropFrame,
  imageRect: ImageFitRect,
): CropFrame {
  return {
    x: legal.x + unRubberBandCropDistance(presentation.x - legal.x, imageRect),
    y: legal.y + unRubberBandCropDistance(presentation.y - legal.y, imageRect),
    width: Math.max(0, legal.width + unRubberBandCropDistance(presentation.width - legal.width, imageRect)),
    height: Math.max(0, legal.height + unRubberBandCropDistance(presentation.height - legal.height, imageRect)),
  };
}

export function resolveCropDragFrame({
  handle,
  dx,
  dy,
  rawFrame,
  imageRect,
  aspectRatio,
}: {
  handle: CropFrameHandle;
  dx: number;
  dy: number;
  rawFrame: CropFrame;
  imageRect: ImageFitRect;
  aspectRatio: AspectRatio;
}): { presentation: CropFrame; legal: CropFrame; raw: CropFrame } {
  const extent = Math.max(
    4096,
    imageRect.width * 4,
    imageRect.height * 4,
    Math.abs(dx) * 2,
    Math.abs(dy) * 2,
  );
  const expandedImageRect: ImageFitRect = {
    x: imageRect.x - extent,
    y: imageRect.y - extent,
    width: imageRect.width + extent * 2,
    height: imageRect.height + extent * 2,
  };
  const raw = applyCropFrameDrag(handle, dx, dy, rawFrame, expandedImageRect, aspectRatio);
  const legal = clampCropFrameToImage(raw, imageRect, aspectRatio);
  const presentation = {
    x: legal.x + rubberBandCropDistance(raw.x - legal.x, imageRect),
    y: legal.y + rubberBandCropDistance(raw.y - legal.y, imageRect),
    width: Math.max(1, legal.width + rubberBandCropDistance(raw.width - legal.width, imageRect)),
    height: Math.max(1, legal.height + rubberBandCropDistance(raw.height - legal.height, imageRect)),
  };
  return { presentation, legal, raw };
}

function interpolateCropFrame(from: CropFrame, to: CropFrame, progress: number): CropFrame {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    width: from.width + (to.width - from.width) * progress,
    height: from.height + (to.height - from.height) * progress,
  };
}

export const ImageCropEditor = forwardRef<ImageCropEditorHandle, ImageCropEditorProps>(function ImageCropEditor({
  source,
  initialCropBox,
  aspectRatio = "free",
  variant = "fullscreen",
  onCancel,
  onConfirm,
  onError,
  onReadyChange,
}, ref) {
  const isEmbedded = variant === "embedded";

  // === Viewport 尺寸 ===
  const [vp, setVp] = useState<Viewport>({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setVp({ width: rect.width, height: rect.height });
    };
    update();
    if (isEmbedded) {
      const ro = new ResizeObserver(update);
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
  }, [isEmbedded]);

  // === Source / rotation ===
  const [sourceUrl, setSourceUrl] = useState(source);
  const [fullscreenAspectRatio, setFullscreenAspectRatio] = useState<AspectRatio>(aspectRatio);
  const rotatedRef = useRef(0);
  const [activeCropBox, setActiveCropBox] = useState<NormalizedCropBox | undefined>(initialCropBox);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // === 原图尺寸 ===
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // === 派生: 图片 contain 显示矩形 ===
  const imageRect: ImageFitRect = useMemo(
    () => getContainedImageRect(naturalSize.w, naturalSize.h, vp.width, vp.height),
    [naturalSize.w, naturalSize.h, vp.width, vp.height],
  );

  // === 裁切框 ===
  const [cropFrame, setCropFrame] = useState<CropFrame>({ x: 0, y: 0, width: 0, height: 0 });
  const cropFrameRef = useRef<CropFrame>(cropFrame);
  const legalCropFrameRef = useRef<CropFrame>(cropFrame);
  const settleAnimationRef = useRef<{ stop: () => void } | null>(null);
  const initialized = useRef(false);
  const reduceMotion = Boolean(useReducedMotion());

  // === 手势状态 ===
  const dragStateRef = useRef<CropDragState | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const effectiveAspectRatio = isEmbedded ? aspectRatio : fullscreenAspectRatio;

  const stopSettleAnimation = useCallback(() => {
    settleAnimationRef.current?.stop();
    settleAnimationRef.current = null;
  }, []);

  const updateCropPresentation = useCallback((next: CropFrame) => {
    cropFrameRef.current = next;
    setCropFrame(next);
  }, []);

  const setLegalCropFrame = useCallback((next: CropFrame) => {
    legalCropFrameRef.current = next;
    updateCropPresentation(next);
  }, [updateCropPresentation]);

  const settleCropFrame = useCallback(() => {
    const from = cropFrameRef.current;
    const target = clampCropFrameToImage(legalCropFrameRef.current, imageRect, effectiveAspectRatio);
    legalCropFrameRef.current = target;
    stopSettleAnimation();
    if (reduceMotion || framesAlmostEqual(from, target)) {
      updateCropPresentation(target);
      return;
    }
    settleAnimationRef.current = animate(0, 1, {
      ...spring.control,
      onUpdate: (progress) => updateCropPresentation(interpolateCropFrame(from, target, progress)),
      onComplete: () => {
        settleAnimationRef.current = null;
        updateCropPresentation(target);
      },
    });
  }, [effectiveAspectRatio, imageRect, reduceMotion, stopSettleAnimation, updateCropPresentation]);

  useEffect(() => () => stopSettleAnimation(), [stopSettleAnimation]);

  // source prop 变化时 reset 所有内部 state
  const lastSourceRef = useRef(source);
  if (lastSourceRef.current !== source) {
    stopSettleAnimation();
    lastSourceRef.current = source;
    setSourceUrl(source);
    setFullscreenAspectRatio(aspectRatio);
    rotatedRef.current = 0;
    setActiveCropBox(initialCropBox);
    initialized.current = false;
    setNaturalSize({ w: 0, h: 0 });
    const emptyFrame = { x: 0, y: 0, width: 0, height: 0 };
    legalCropFrameRef.current = emptyFrame;
    updateCropPresentation(emptyFrame);
    dragStateRef.current = null;
    setIsInteracting(false);
  }

  // === 初始化裁切框 ===
  useEffect(() => {
    if (imageRect.width === 0 || imageRect.height === 0) return;
    if (initialized.current) return;
    initialized.current = true;

    if (activeCropBox) {
      const iw = imageRect.width;
      const ih = imageRect.height;
      const w = activeCropBox.width * iw;
      const h = activeCropBox.height * ih;
      const x = imageRect.x + activeCropBox.x * iw;
      const y = imageRect.y + activeCropBox.y * ih;
      setLegalCropFrame(clampCropFrameToImage({ x, y, width: w, height: h }, imageRect, effectiveAspectRatio));
    } else {
      setLegalCropFrame(getInitialCropFrameInImage(imageRect, effectiveAspectRatio));
    }
  }, [imageRect, activeCropBox, effectiveAspectRatio, setLegalCropFrame]);

  useEffect(() => {
    if (!initialized.current) return;
    if (imageRect.width === 0 || imageRect.height === 0) return;
    stopSettleAnimation();
    setLegalCropFrame(clampCropFrameToImage(cropFrameRef.current, imageRect, effectiveAspectRatio));
  }, [imageRect, effectiveAspectRatio, setLegalCropFrame, stopSettleAnimation]);

  // === 触摸屏幕坐标 → 容器坐标 ===
  const toLocal = useCallback((clientX: number, clientY: number): PointerSnapshot => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // === hit test: 判定落点是 8 handle / 中心 / 框外 ===
  const hitTest = useCallback((x: number, y: number, frame: CropFrame): CropFrameHandle | null => {
    const H = 28;
    if (x >= frame.x - H && x <= frame.x + H && y >= frame.y - H && y <= frame.y + H) return "TL";
    if (x >= frame.x + frame.width - H && x <= frame.x + frame.width + H && y >= frame.y - H && y <= frame.y + H) return "TR";
    if (x >= frame.x - H && x <= frame.x + H && y >= frame.y + frame.height - H && y <= frame.y + frame.height + H) return "BL";
    if (x >= frame.x + frame.width - H && x <= frame.x + frame.width + H && y >= frame.y + frame.height - H && y <= frame.y + frame.height + H) return "BR";
    if (x >= frame.x && x <= frame.x + frame.width && y >= frame.y - H && y <= frame.y + H) return "T";
    if (x >= frame.x && x <= frame.x + frame.width && y >= frame.y + frame.height - H && y <= frame.y + frame.height + H) return "B";
    if (x >= frame.x - H && x <= frame.x + H && y >= frame.y && y <= frame.y + frame.height) return "L";
    if (x >= frame.x + frame.width - H && x <= frame.x + frame.width + H && y >= frame.y && y <= frame.y + frame.height) return "R";
    if (x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height) return "CENTER";
    return null;
  }, []);

  // === Pointer 事件 ===
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!e.isPrimary || dragStateRef.current) return;
    const local = toLocal(e.clientX, e.clientY);
    const currentPresentation = cropFrameRef.current;
    const handle = hitTest(local.x, local.y, currentPresentation);
    if (!handle) return;
    e.preventDefault();
    stopSettleAnimation();
    const legal = clampCropFrameToImage(currentPresentation, imageRect, effectiveAspectRatio);
    legalCropFrameRef.current = legal;
    dragStateRef.current = {
      pointerId: e.pointerId,
      handle,
      origin: local,
      rawFrame: restoreRawCropFrame(currentPresentation, legal, imageRect),
    };
    setIsInteracting(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture can fail when the browser has already cancelled the gesture.
    }
  }, [effectiveAspectRatio, hitTest, imageRect, stopSettleAnimation, toLocal]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    const local = toLocal(e.clientX, e.clientY);
    const resolved = resolveCropDragFrame({
      handle: drag.handle,
      dx: local.x - drag.origin.x,
      dy: local.y - drag.origin.y,
      rawFrame: drag.rawFrame,
      imageRect,
      aspectRatio: effectiveAspectRatio,
    });
    legalCropFrameRef.current = resolved.legal;
    updateCropPresentation(resolved.presentation);
  }, [effectiveAspectRatio, imageRect, toLocal, updateCropPresentation]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    setIsInteracting(false);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore browsers that release capture before pointerup/pointercancel.
    }
    settleCropFrame();
  }, [settleCropFrame]);

  const ready = vp.width > 0 && naturalSize.w > 0 && cropFrame.width > 0 && cropFrame.height > 0;

  useEffect(() => {
    onReadyChange?.(ready);
  }, [onReadyChange, ready]);

  // === 确认 ===
  const runConfirm = useCallback(async () => {
    if (confirming || rotating) return;
    if (!ready) return;
    const legalFrame = clampCropFrameToImage(cropFrameRef.current, imageRect, effectiveAspectRatio);
    legalCropFrameRef.current = legalFrame;
    stopSettleAnimation();
    updateCropPresentation(legalFrame);
    if (legalFrame.width <= 0 || legalFrame.height <= 0) return;
    setConfirming(true);
    try {
      const box = screenFrameToCropBox(legalFrame, imageRect);
      const cropped = await cropFromOriginal(sourceUrl, box);
      await onConfirm(cropped, box);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "裁切失败");
    } finally {
      setConfirming(false);
    }
  }, [confirming, effectiveAspectRatio, imageRect, onConfirm, onError, ready, rotating, sourceUrl, stopSettleAnimation, updateCropPresentation]);

  // === 还原 ===
  const handleReset = useCallback(() => {
    stopSettleAnimation();
    setSourceUrl(source);
    setFullscreenAspectRatio(aspectRatio);
    rotatedRef.current = 0;
    setActiveCropBox(initialCropBox);
    initialized.current = false;
    setNaturalSize({ w: 0, h: 0 });
    const emptyFrame = { x: 0, y: 0, width: 0, height: 0 };
    legalCropFrameRef.current = emptyFrame;
    updateCropPresentation(emptyFrame);
    dragStateRef.current = null;
    setIsInteracting(false);
  }, [aspectRatio, initialCropBox, source, stopSettleAnimation, updateCropPresentation]);

  const rotateBy = useCallback((degrees: -90 | 90) => {
    if (rotating || !sourceUrl || naturalSize.w === 0) return;
    stopSettleAnimation();
    setRotating(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onErrorRef.current?.("无法创建 canvas 上下文");
        setRotating(false);
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const newDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      setSourceUrl(newDataUrl);
      rotatedRef.current = (rotatedRef.current + degrees + 360) % 360;
      setActiveCropBox(undefined);
      initialized.current = false;
      setNaturalSize({ w: 0, h: 0 });
      const emptyFrame = { x: 0, y: 0, width: 0, height: 0 };
      legalCropFrameRef.current = emptyFrame;
      updateCropPresentation(emptyFrame);
      dragStateRef.current = null;
      setIsInteracting(false);
      setRotating(false);
    };
    img.onerror = () => {
      onErrorRef.current?.("旋转失败: 图片加载错误");
      setRotating(false);
    };
    img.src = sourceUrl;
  }, [naturalSize.w, rotating, sourceUrl, stopSettleAnimation, updateCropPresentation]);

  const handleRotateLeft = useCallback(() => rotateBy(-90), [rotateBy]);
  const handleRotateRight = useCallback(() => rotateBy(90), [rotateBy]);

  // === 暴露 handle 给父级 (embedded 模式用) ===
  useImperativeHandle(ref, () => ({
    runConfirm,
    reset: handleReset,
    rotate: handleRotateRight,
    rotateLeft: handleRotateLeft,
    rotateRight: handleRotateRight,
    isReady: vp.width > 0 && naturalSize.w > 0 && cropFrame.width > 0,
    confirming,
    rotating,
  }), [runConfirm, handleReset, handleRotateLeft, handleRotateRight, vp.width, naturalSize.w, cropFrame.width, confirming, rotating]);

  // === 键盘 Arrow 移动裁切框 ===
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!initialized.current || cropFrame.width === 0) return;
    if (imageRect.width === 0) return;
    const step = e.shiftKey ? 40 : 10;
    let dx = 0, dy = 0;
    if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowDown") dy = step;
    else if (e.key === "ArrowUp") dy = -step;
    else return;
    e.preventDefault();
    e.stopPropagation();
    stopSettleAnimation();
    const next = applyCropFrameDrag("CENTER", dx, dy, legalCropFrameRef.current, imageRect, effectiveAspectRatio);
    setLegalCropFrame(next);
  }, [cropFrame.width, effectiveAspectRatio, imageRect, setLegalCropFrame, stopSettleAnimation]);

  // === 渲染 ===
  // ===== Canvas 区域 (图片 + 裁切框 + 4 角 L + 4 边短横 + 蒙层 + 9 宫格) =====
  const canvas = (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${isEmbedded ? "h-full" : "flex-1"}`}
      style={{ touchAction: "none", ...(isEmbedded ? {} : { minHeight: 0 }) }}
      data-crop-gesture="progressive-resistance"
      data-parity-id="parity.app.app.src.components.image.crop.editor.7c2a9a0b59" onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="region"
      aria-label="裁切区域, Arrow 键移动裁切框 (Shift 加速)"
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
    >
      <img
        src={sourceUrl}
        alt=""
        draggable={false}
        onLoad={(e) => {
          const el = e.currentTarget;
          setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
        }}
        onError={() => {
          const errMsg = `原图加载失败: ${sourceUrl.slice(0, 80)}`;
          console.error("[ImageCropEditor]", errMsg);
          onErrorRef.current?.(errMsg);
        }}
        className="pointer-events-none absolute"
        style={{
          left: imageRect.x,
          top: imageRect.y,
          width: imageRect.width,
          height: imageRect.height,
        }}
      />

      {ready && (
        <div
          className="pointer-events-none absolute"
          data-crop-frame="presentation"
          data-crop-interacting={isInteracting ? "true" : "false"}
          style={{
            left: cropFrame.x,
            top: cropFrame.y,
            width: cropFrame.width,
            height: cropFrame.height,
            border: "1.5px solid white",
            borderRadius: 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
          }}
          aria-hidden="true"
        >
          {/* 4 角 L 把手 (按微信截图样式) */}
          {(["TL", "TR", "BL", "BR"] as const).map((c) => (
            <CornerHandle key={c} corner={c} />
          ))}
          {/* 4 边中点短横 (按微信截图样式) */}
          {(["T", "B", "L", "R"] as const).map((e) => (
            <EdgeHandle key={e} edge={e} />
          ))}

          {/* 九宫格 (触碰 + 移动时浮现) */}
          {isInteracting && (
            <>
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/30 motion-reduce:hidden" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/30 motion-reduce:hidden" />
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/30 motion-reduce:hidden" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/30 motion-reduce:hidden" />
            </>
          )}
        </div>
      )}
    </div>
  );

  // ===== Embedded 模式: 只返回 canvas, 工具栏由父级渲染 =====
  if (isEmbedded) {
    return canvas;
  }

  const fullscreenAspectOptions: Array<{ label: string; value: AspectRatio }> = [
    { label: "自由", value: "free" },
    { label: "3:4", value: 0.75 },
  ];

  // ===== Fullscreen 模式: 接入统一 OverlayStack，由单一 BackCoordinator 处理返回键 =====
  const renderFullscreen = (requestCancel: () => void) => (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-black text-white select-none"
    >
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button
          data-parity-id={`parity.app.app.src.components.image.crop.editor.0d95cfb1ff.${source.length}.${source.slice(-16)}`}
          type="button"
          onClick={requestCancel}
          disabled={confirming || rotating}
          aria-label="取消"
          className="grid h-10 w-10 place-items-center ui-control-radius bg-white/15 text-base font-bold text-white backdrop-blur-sm hover:bg-white/25 transition-colors disabled:opacity-55"
        >
          ✕
        </button>
        <div className="text-sm font-medium">裁切衣物</div>
        <span className="h-10 w-10" aria-hidden="true" />
      </div>
      {canvas}
      {/* 底部工具栏: 比例 / 旋转 / 取消应用 + safe-area-inset-bottom */}
      <div
        className="shrink-0 space-y-2 border-t border-white/5 bg-black/95 px-4 py-3 backdrop-blur-xl"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="grid h-11 grid-cols-2 gap-1 rounded-[16px] bg-white/10 p-1">
          {fullscreenAspectOptions.map((option) => (
            <button
              data-parity-id={`parity.app.app.src.components.image.crop.editor.07f345a0f2.${source.length}.${source.slice(-16)}.${option.value}`}
              key={option.label}
              type="button"
              onClick={() => setFullscreenAspectRatio(option.value)}
              disabled={confirming || rotating}
              className={`rounded-[12px] text-sm font-semibold transition-colors disabled:opacity-55 ${
                fullscreenAspectRatio === option.value ? "bg-denim text-white" : "text-white/72"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <BottomButton data-parity-id={`parity.app.app.src.components.image.crop.editor.b7e3abca2d.${source.length}.${source.slice(-16)}`} label="左转90°" icon="↺" onClick={handleRotateLeft} disabled={confirming || rotating} />
          <BottomButton data-parity-id={`parity.app.app.src.components.image.crop.editor.2fe51b1818.${source.length}.${source.slice(-16)}`} label="右转90°" icon="⟳" onClick={handleRotateRight} disabled={confirming || rotating} />
          <BottomButton data-parity-id={`parity.app.app.src.components.image.crop.editor.1629111916.${source.length}.${source.slice(-16)}`} label="重置" icon="↻" onClick={handleReset} disabled={confirming || rotating} />
        </div>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2">
          <button
            data-parity-id={`parity.app.app.src.components.image.crop.editor.1366916fc1.${source.length}.${source.slice(-16)}`}
            type="button"
            onClick={requestCancel}
            disabled={confirming || rotating}
            className="h-12 ui-control-radius border border-white/15 bg-white/10 text-sm font-semibold text-white/85 disabled:opacity-55"
          >
            取消
          </button>
          <button
            data-parity-id={`parity.app.app.src.components.image.crop.editor.ea6415b523.${source.length}.${source.slice(-16)}`}
            type="button"
            onClick={runConfirm}
            disabled={confirming || rotating || !ready}
            className="h-12 ui-control-radius bg-denim text-sm font-semibold text-white disabled:opacity-45"
          >
            {confirming ? "应用中" : "应用"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <FullscreenCropperLayer busy={confirming || rotating} onCancel={onCancel}>
      {renderFullscreen}
    </FullscreenCropperLayer>
  );
});

function FullscreenCropperLayer({
  busy,
  onCancel,
  children,
}: {
  busy: boolean;
  onCancel: () => void;
  children: (requestCancel: () => void) => ReactNode;
}) {
  useScrollLock(true);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const didInitialFocusRef = useRef(false);
  const [blockedAnnouncement, setBlockedAnnouncement] = useState("");
  const handleBlockedDismiss = useCallback(() => {
    setBlockedAnnouncement("正在处理图片，暂时无法关闭裁切器");
  }, []);
  const { overlayId, isTopmost, requestDismiss } = useOverlayLayer({
    kind: "cropper",
    dismissible: !busy,
    onDismiss: onCancel,
    onDismissBlocked: handleBlockedDismiss,
  });
  const requestCancel = useCallback(() => {
    requestDismiss("backdrop");
  }, [requestDismiss]);

  useEffect(() => {
    if (!isTopmost || didInitialFocusRef.current) return;
    didInitialFocusRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const layer = layerRef.current;
      if (!layer) return;
      const focusable = layer.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? layer).focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTopmost]);

  useEffect(() => {
    if (!isTopmost) return;
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const layer = layerRef.current;
      if (!layer) return;
      const focusable = Array.from(
        layer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.tabIndex !== -1);
      if (focusable.length === 0) {
        event.preventDefault();
        layer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleTab, true);
    return () => document.removeEventListener("keydown", handleTab, true);
  }, [isTopmost]);

  return (
    <OverlayPortal>
      <div
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-label="裁切衣物图片"
        tabIndex={-1}
        data-overlay-layer={overlayId}
        data-overlay-kind="cropper"
        data-overlay-topmost={isTopmost ? "true" : "false"}
        aria-hidden={isTopmost ? undefined : "true"}
        inert={isTopmost ? undefined : true}
        className="fixed inset-0 z-[120] h-[100dvh] w-screen overflow-hidden bg-black outline-none"
        style={{ touchAction: "none" }}
      >
        {children(requestCancel)}
        <span className="sr-only" role="status" aria-live="polite">{blockedAnnouncement}</span>
      </div>
    </OverlayPortal>
  );
}

function CornerHandle({ corner }: { corner: "TL" | "TR" | "BL" | "BR" }) {
  // 按微信截图样式: 4 角 L 把手 (白色横 + 白色竖, 18px)
  const base: React.CSSProperties = { position: "absolute", width: 18, height: 18, boxShadow: "0 0 4px rgba(0,0,0,0.4)" };
  const styles: Record<typeof corner, React.CSSProperties> = {
    TL: { top: -2, left: -2 },
    TR: { top: -2, right: -2 },
    BL: { bottom: -2, left: -2 },
    BR: { bottom: -2, right: -2 },
  };
  const hLine: React.CSSProperties = { position: "absolute", background: "white", height: 3 };
  const vLine: React.CSSProperties = { position: "absolute", background: "white", width: 3 };
  return (
    <div style={{ ...base, ...styles[corner] }}>
      <div style={{
        ...hLine, width: 18,
        ...(corner === "TL" ? { top: 0, left: 0 } : corner === "TR" ? { top: 0, right: 0 } : corner === "BL" ? { bottom: 0, left: 0 } : { bottom: 0, right: 0 }),
      }} />
      <div style={{
        ...vLine, height: 18,
        ...(corner === "TL" ? { top: 0, left: 0 } : corner === "TR" ? { top: 0, right: 0 } : corner === "BL" ? { bottom: 0, left: 0 } : { bottom: 0, right: 0 }),
      }} />
    </div>
  );
}

function EdgeHandle({ edge }: { edge: "T" | "B" | "L" | "R" }) {
  // 按微信截图样式: 4 边中点短横 (24x4 横, 4x24 竖)
  const base: React.CSSProperties = { position: "absolute", background: "white", boxShadow: "0 0 4px rgba(0,0,0,0.4)", borderRadius: 2 };
  const styles: Record<typeof edge, React.CSSProperties> = {
    T: { top: -2, left: "50%", transform: "translateX(-50%)", width: 24, height: 4 },
    B: { bottom: -2, left: "50%", transform: "translateX(-50%)", width: 24, height: 4 },
    L: { left: -2, top: "50%", transform: "translateY(-50%)", width: 4, height: 24 },
    R: { right: -2, top: "50%", transform: "translateY(-50%)", width: 4, height: 24 },
  };
  return <div style={{ ...base, ...styles[edge] }} />;
}

function BottomButton({ label, icon, onClick, disabled, "data-parity-id": dataParityId }: { label: string; icon?: string; onClick: () => void; disabled?: boolean; "data-parity-id"?: string }) {
  return (
    <button
      type="button"
      data-parity-id={dataParityId ?? "parity.app.app.src.components.image.crop.editor.eefa41ac2c"} onClick={onClick}
      disabled={disabled}
      className="flex h-11 items-center justify-center gap-1 ui-control-radius border border-white/12 bg-white/8 px-2 text-white/85 text-xs font-semibold app-press-feedback transition-transform disabled:opacity-60 whitespace-nowrap"
    >
      {icon && <span className="text-[18px] leading-none">{icon}</span>}
      <span className="leading-tight">{label}</span>
    </button>
  );
}
