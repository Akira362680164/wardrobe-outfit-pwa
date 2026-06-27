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
import { createPortal } from "react-dom";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { cropFromOriginal } from "@/lib/image";
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
  const initialized = useRef(false);

  // === 手势状态 ===
  const pointers = useRef<Map<number, PointerSnapshot>>(new Map());
  const dragMode = useRef<CropFrameHandle | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  // source prop 变化时 reset 所有内部 state
  const lastSourceRef = useRef(source);
  if (lastSourceRef.current !== source) {
    lastSourceRef.current = source;
    setSourceUrl(source);
    rotatedRef.current = 0;
    setActiveCropBox(initialCropBox);
    initialized.current = false;
    setNaturalSize({ w: 0, h: 0 });
    setCropFrame({ x: 0, y: 0, width: 0, height: 0 });
    pointers.current.clear();
    dragMode.current = null;
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
      setCropFrame(clampCropFrameToImage({ x, y, width: w, height: h }, imageRect, aspectRatio));
    } else {
      setCropFrame(getInitialCropFrameInImage(imageRect, aspectRatio));
    }
  }, [imageRect, activeCropBox, aspectRatio]);

  useEffect(() => {
    if (!initialized.current) return;
    if (imageRect.width === 0 || imageRect.height === 0) return;
    setCropFrame((f) => clampCropFrameToImage(f, imageRect, aspectRatio));
  }, [imageRect, aspectRatio]);

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
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const local = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, local);
    setIsInteracting(true);

    if (pointers.current.size === 1) {
      const hit = hitTest(local.x, local.y, cropFrame);
      dragMode.current = hit;
    }
  }, [toLocal, hitTest, cropFrame]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!pointers.current.has(e.pointerId)) return;
    e.preventDefault();
    const local = toLocal(e.clientX, e.clientY);
    const prev = pointers.current.get(e.pointerId)!;
    const dx = local.x - prev.x;
    const dy = local.y - prev.y;
    pointers.current.set(e.pointerId, local);

    if (pointers.current.size === 1 && dragMode.current) {
      const handle = dragMode.current;
      setCropFrame((f) => applyCropFrameDrag(handle, dx, dy, f, imageRect, aspectRatio));
    }
  }, [toLocal, imageRect, aspectRatio]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      setIsInteracting(false);
      dragMode.current = null;
    } else if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0];
      dragMode.current = hitTest(remaining.x, remaining.y, cropFrame);
    }
  }, [hitTest, cropFrame]);

  const ready = vp.width > 0 && naturalSize.w > 0 && cropFrame.width > 0 && cropFrame.height > 0;

  useEffect(() => {
    onReadyChange?.(ready);
  }, [onReadyChange, ready]);

  // === 确认 ===
  const runConfirm = useCallback(async () => {
    if (confirming || rotating) return;
    if (!ready) return;
    setConfirming(true);
    try {
      const box = screenFrameToCropBox(cropFrame, imageRect);
      const cropped = await cropFromOriginal(sourceUrl, box);
      await onConfirm(cropped, box);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "裁切失败");
    } finally {
      setConfirming(false);
    }
  }, [cropFrame, imageRect, sourceUrl, onConfirm, onError, confirming, rotating, ready]);

  // === 还原 ===
  const handleReset = useCallback(() => {
    setSourceUrl(source);
    rotatedRef.current = 0;
    setActiveCropBox(initialCropBox);
    initialized.current = false;
    setNaturalSize({ w: 0, h: 0 });
    setCropFrame({ x: 0, y: 0, width: 0, height: 0 });
    pointers.current.clear();
    dragMode.current = null;
    setIsInteracting(false);
  }, [source, initialCropBox]);

  // === 顺时针旋转 90° ===
  const handleRotateRight = useCallback(() => {
    if (rotating || !sourceUrl || naturalSize.w === 0) return;
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
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const newDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      setSourceUrl(newDataUrl);
      rotatedRef.current = (rotatedRef.current + 90) % 360;
      setActiveCropBox(undefined);
      initialized.current = false;
      setNaturalSize({ w: 0, h: 0 });
      setCropFrame({ x: 0, y: 0, width: 0, height: 0 });
      pointers.current.clear();
      dragMode.current = null;
      setIsInteracting(false);
      setRotating(false);
    };
    img.onerror = () => {
      onErrorRef.current?.("旋转失败: 图片加载错误");
      setRotating(false);
    };
    img.src = sourceUrl;
  }, [rotating, sourceUrl, naturalSize.w]);

  // === 暴露 handle 给父级 (embedded 模式用) ===
  useImperativeHandle(ref, () => ({
    runConfirm,
    reset: handleReset,
    rotate: handleRotateRight,
    isReady: vp.width > 0 && naturalSize.w > 0 && cropFrame.width > 0,
    confirming,
    rotating,
  }), [runConfirm, handleReset, handleRotateRight, vp.width, naturalSize.w, cropFrame.width, confirming, rotating]);

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
    setCropFrame((f) => applyCropFrameDrag("CENTER", dx, dy, f, imageRect, aspectRatio));
  }, [cropFrame.width, imageRect, aspectRatio]);

  // === 渲染 ===
  // ===== Canvas 区域 (图片 + 裁切框 + 4 角 L + 4 边短横 + 蒙层 + 9 宫格) =====
  const canvas = (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${isEmbedded ? "h-full" : "flex-1"}`}
      style={{ touchAction: "none", ...(isEmbedded ? {} : { minHeight: 0 }) }}
      onPointerDown={onPointerDown}
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

  // ===== Fullscreen 模式: 包外层 fixed + 顶部/底部工具栏 =====
  // v0.9.37-dev P0 §5: fullscreen 模式用 createPortal 渲染到 document.body,
  // 绕开外层 (motion.div transform-gpu + main 流的 padding / scroll)
  // 对 fixed containing block 的限制, 让 fixed inset-0 真正对齐到 viewport 0,0。
  // 项目里 MotionToast (wardrobe-app.tsx) 已经在用这个模式, 验证过。
  const fullscreen = (
    <div
      className="fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black text-white select-none"
      style={{ touchAction: "none" }}
    >
      {/* 顶部工具栏: 左 X 关闭 + 中部标题 + 右 ✓ 确认 (按微信截图样式) */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <button
          type="button"
          onClick={onCancel}
          aria-label="取消"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-base font-bold text-white backdrop-blur-sm hover:bg-white/25 transition-colors"
        >
          ✕
        </button>
        <div className="text-sm font-medium">裁切衣物</div>
        <button
          type="button"
          onClick={runConfirm}
          disabled={confirming || !ready}
          aria-label="确认"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-base font-bold text-white backdrop-blur-sm hover:bg-white/25 transition-colors disabled:opacity-50"
        >
          ✓
        </button>
      </div>
      {canvas}
      {/* 底部工具栏: 还原 / 旋转 / 取消 / 裁剪 + safe-area-inset-bottom */}
      <div
        className="flex h-[72px] shrink-0 items-center justify-around bg-black/95 px-4 backdrop-blur-xl border-t border-white/5"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
      >
        <BottomButton label="还原" icon="↺" onClick={handleReset} disabled={confirming || rotating} />
        <BottomButton label="旋转" icon="⟳" onClick={handleRotateRight} disabled={confirming || rotating} />
        <BottomButton label="取消" onClick={onCancel} disabled={confirming || rotating} />
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(fullscreen, document.body);
  }
  return fullscreen;
});

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

function BottomButton({ label, icon, onClick, disabled }: { label: string; icon?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 text-white/85 text-[11px] font-medium active:scale-95 transition-transform disabled:opacity-60"
    >
      {icon && <span className="text-[22px] leading-none">{icon}</span>}
      <span className="leading-tight">{label}</span>
    </button>
  );
}
