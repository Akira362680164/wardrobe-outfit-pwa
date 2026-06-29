"use client";

import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react";

import { X } from "lucide-react";

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { createPortal } from "react-dom";
import { duration, ease, pop, scaleModal, slideRight, slideRightExit, slideUp, spring, toastDrop } from "@/lib/motion-tokens";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { OriginalCroppedImage } from "@/components/original-cropped-image";

/* ------------------------------------------------------------------ */
/*  AnimatedPage – sub-page enter / exit with slide-right              */
/* ------------------------------------------------------------------ */

interface AnimatedPageProps {
  children: React.ReactNode;
  className?: string;
  /** Use "push" for forward navigation, "pop" for back. Default "push". */
  direction?: "push" | "pop";
  /** Wrap in a <motion.div>. Default true. */
  as?: "div" | "section";
}

export function AnimatedPage({ children, className, direction = "push", as = "div" }: AnimatedPageProps) {
  const variants = direction === "pop" ? slideRightExit : slideRight;
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp
      className={className}
      variants={variants}
      initial="initial"
      animate="in"
      exit="out"
      transition={{ duration: duration.panel, ease: ease.app }}
    >
      {children}
    </Comp>
  );
}

/* ------------------------------------------------------------------ */
/*  AnimatedPresenceShell – single child enter/exit wrapper            */
/* ------------------------------------------------------------------ */

interface AnimatedPresenceShellProps {
  children: React.ReactNode;
  mode?: "wait" | "popLayout" | "sync";
  /** If true, runs the exit animation before the enter. Default true. */
  exitBeforeEnter?: boolean;
}

export function AnimatedPresenceShell({
  children,
  mode = "wait",
}: AnimatedPresenceShellProps) {
  return <AnimatePresence mode={mode}>{children}</AnimatePresence>;
}

/* ------------------------------------------------------------------ */
/*  MotionSheet – Bottom-sheet-style modal (mobile-first)              */
/* ------------------------------------------------------------------ */

interface MotionSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra class on the backdrop. */
  className?: string;
  /** Extra class on the sheet panel. */
  panelClassName?: string;
  /** If true, sheet slides from bottom even on desktop. Default true. */
  preferBottom?: boolean;
}

export function MotionSheet({
  open,
  onClose,
  children,
  className,
  panelClassName,
  preferBottom = true,
}: MotionSheetProps) {
  // v0.9.16: 弹窗打开期间锁定 body 滚动 + 拦截 focus/touchmove 穿透,
  // 修复 Android WebView 软键盘弹起 / 触摸拖动时底层"衣橱设置"页面跟着滚动的问题。
  useScrollLock(open);

  const handleBackdrop = useCallback(() => onClose(), [onClose]);
  const stopProp = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  return (
    <AnimatePresence>
      {open ? (
        <div className={`fixed inset-0 z-50 ${className ?? ""}`}>
          {/* Backdrop — touch-none(CSS touch-action:none) 禁止该层处理触摸手势.
              wheel/touchmove 全局拦截由 useScrollLock 在 capture 阶段完成,
              不在此处挂 onWheel/onTouchMove 避免 React 19 passive listener 警告. */}
          <motion.div
            className="absolute inset-0 bg-ink/40 touch-none"
            variants={{ in: { opacity: 1 }, out: { opacity: 0 } }}
            initial="out"
            animate="in"
            exit="out"
            transition={{ duration: duration.fast }}
            onClick={handleBackdrop}
          />
          {/* Sheet panel — overscroll-behavior:contain 阻止弹窗内部滚到边界时
              链式触发底层 body 滚动; useScrollLock 同步锁定底层滚动容器 */}
          <motion.div
            className={`absolute bottom-0 inset-x-0 mx-auto w-full max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-[#fbfbf8] p-4 shadow-2xl ${preferBottom ? "" : "sm:top-1/2 sm:bottom-auto sm:inset-x-4 sm:max-w-lg sm:mx-auto sm:rounded-lg sm:-translate-y-1/2"} ${panelClassName ?? ""}`}
            variants={preferBottom ? slideUp : scaleModal}
            initial="initial"
            animate="in"
            exit="out"
            transition={{ duration: duration.panel, ease: ease.app }}
            onClick={stopProp}
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionToast – lightweight message banner                           */
/* ------------------------------------------------------------------ */

interface MotionToastProps {
  visible: boolean;
  children: React.ReactNode;
  className?: string;
  /**
   * v0.9.25-dev: "top" = drops down from the top (for fixed floating toasts).
   * "bottom" (default) = slides up from below (legacy behavior for inline toasts).
   */
  placement?: "top" | "bottom";
  /**
   * v0.9.25-dev: a11y hint for screen readers (subagent I-2).
   * - "error" → role="alert" + aria-live="assertive" (用户必须立刻知道失败)
   * - "success" / "info" / undefined → role="status" + aria-live="polite" (延后播报即可)
   */
  type?: "success" | "error" | "info";
}

export function MotionToast({ visible, children, className, placement = "bottom", type }: MotionToastProps) {
  const variants = placement === "top" ? toastDrop : slideUp;
  const isError = type === "error";
  const ariaProps = isError
    ? { role: "alert" as const, "aria-live": "assertive" as const }
    : { role: "status" as const, "aria-live": "polite" as const };
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className={className}
          variants={variants}
          initial="initial"
          animate="in"
          exit="out"
          transition={{ ...spring.snappy, opacity: { duration: duration.fast } }}
        >
          <div {...ariaProps}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  PressableMotionButton – tap-scale feedback                        */
/* ------------------------------------------------------------------ */

interface PressableMotionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  className?: string;
  /** Scale target while pressed. Default 0.97 */
  scale?: number;
}

export function PressableMotionButton({
  children,
  className,
  scale = 0.97,
  ...rest
}: PressableMotionButtonProps) {
  return (
    <motion.button
      className={className}
      whileTap={{ scale }}
      transition={{ duration: duration.fast }}
      {...(rest as MotionProps &
        React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionCard – whileTap + optional hover for garment cards           */
/* ------------------------------------------------------------------ */

interface MotionCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Extra class when the card is "selected" (used for appearance). */
  selected?: boolean;
  /** When true, disables tap scale (e.g. in multi-select mode). */
  disableTap?: boolean;
  layoutId?: string;
}

export function MotionCard({
  children,
  className,
  onClick,
  onContextMenu,
  selected = false,
  disableTap = false,
  layoutId,
}: MotionCardProps) {
  const base = `overflow-hidden rounded-lg border ${selected ? "border-denim ring-1 ring-denim" : "border-ink/10"} bg-white shadow-sm ${className ?? ""}`;

  return (
    <motion.article
      layoutId={layoutId}
      className={base}
      onClick={onClick}
      onContextMenu={onContextMenu}
      whileTap={disableTap ? undefined : { scale: 0.97 }}
      whileHover={{}}
      transition={{ duration: duration.fast }}
    >
      {children}
    </motion.article>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionImageLightbox – scale + opacity transition                  */
/* ------------------------------------------------------------------ */

interface MotionImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  thumbnailSrc?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  displayMode?: "original-cropped";
}

export function MotionImageLightbox({
  open,
  onClose,
  src,
  alt,
  thumbnailSrc,
  cropBox,
  displayMode,
}: MotionImageLightboxProps) {
  useScrollLock(open);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-black p-4"
          variants={{ in: { opacity: 1 }, out: { opacity: 0 } }}
          initial="out"
          animate="in"
          exit="out"
          transition={{ duration: duration.fast }}
          onClick={onClose}
        >
          {/* Image container: 自身也算可点击区域, 点击图片任意位置也可关闭 */}
          <motion.div
            className="relative max-h-[88vh] max-w-4xl overflow-hidden rounded-lg bg-black"
            variants={scaleModal}
            initial="initial"
            animate="in"
            exit="out"
            transition={{ duration: duration.normal, ease: ease.app }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox renders local data-URL images, not static assets */}
            {displayMode === "original-cropped" ? (
              <OriginalCroppedImage originalSrc={src} thumbnailSrc={thumbnailSrc} cropBox={cropBox} alt={alt} className="h-[88vh] w-[min(92vw,64rem)]" />
            ) : (
              <img loading="lazy" decoding="async" src={src} alt={alt} className="max-h-[88vh] w-full object-contain" />
            )}

            {/* 关闭按钮: 放在图片右上角 (与图片一起缩放, 不会因屏幕尺寸错位) */}
            <button
              type="button"
              className="absolute top-2 right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm hover:bg-black/75 active:scale-95 transition-all"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              aria-label="关闭"
            >
              <X size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionCheckBadge – pop-in checkmark icon                          */
/* ------------------------------------------------------------------ */

interface MotionCheckBadgeProps {
  visible: boolean;
  children: React.ReactNode;
  className?: string;
}

export function MotionCheckBadge({ visible, children, className }: MotionCheckBadgeProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className={className}
          variants={pop}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={spring.snappy}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionPopoverMenu – opacity + scale from anchor                   */
/* ------------------------------------------------------------------ */

interface MotionPopoverMenuProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /**
   * v0.9.42-dev C-1: Anchor element to position the popover relative to.
   * When provided + visible, the popover renders via createPortal to document.body
   * with fixed positioning computed from anchor.getBoundingClientRect().
   * When omitted, falls back to legacy `absolute bottom-full right-0` mode
   * (clipped by ancestor overflow-hidden / transform-gpu — used for back-compat).
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function MotionPopoverMenu({
  visible,
  onClose,
  children,
  className,
  anchorRef,
}: MotionPopoverMenuProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const usePortal = !!anchorRef;

  // v0.9.42-dev C-1: 在 portal 模式下, 用 anchor.getBoundingClientRect() 算 popover 的
  // top/left (等价于 absolute bottom-full right-0, 但用 fixed 相对 viewport, 绕开 overflow-hidden ancestor)。
  // 监听 window scroll/resize, popover 跟随 anchor 位置。
  useLayoutEffect(() => {
    if (!visible || !usePortal) return;
    const anchorEl = anchorRef?.current;
    const popoverEl = popoverRef.current;
    if (!anchorEl || !popoverEl) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const popoverH = popoverEl.offsetHeight;
      const popoverW = popoverEl.offsetWidth;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const MARGIN = 8;

      // v0.9.52-dev: viewport clamping — 优先放下方，空间不足放上方
      let top: number;
      const belowSpace = vh - rect.bottom - MARGIN;
      const aboveSpace = rect.top - MARGIN;
      if (belowSpace >= popoverH + MARGIN) {
        // 放在 anchor 下方
        top = rect.bottom + MARGIN;
      } else if (aboveSpace >= popoverH + MARGIN) {
        // 放在 anchor 上方
        top = rect.top - popoverH - MARGIN;
      } else {
        // 都不够 — 放下方并 clamp
        top = Math.max(MARGIN, Math.min(vh - popoverH - MARGIN, rect.bottom + MARGIN));
      }

      // left: 右对齐 anchor，但 clamp 到 viewport 内
      let left = rect.right - popoverW;
      if (left < MARGIN) left = MARGIN;
      if (left + popoverW > vw - MARGIN) left = vw - popoverW - MARGIN;

      popoverEl.style.top = `${top}px`;
      popoverEl.style.left = `${left}px`;
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [visible, usePortal, anchorRef]);

  // v0.9.44-dev 问题 1: 文档级 pointerdown 监听代替"全屏 backdrop button"。
  // - pointerdown 在 click 之前触发, 先一步关闭, 不会"先 onClick 再 onClose"
  // - 仅当 target 既不在 popover 也不在 anchor (3-dot 按钮) 内时关闭
  // - 关闭后用 once 性 click 拦截器 (capture 阶段) 吞掉本次 click, 避免事件穿透到底层卡片
  //   触发进详情/多选等; 但相邻 3-dot 按钮 是 anchor 之外的 button, 同一次 pointer 序列
  //   也只产生 1 个 click → 吞掉就吞掉, 相邻菜单按钮需用户再点一次 (与原 backdrop 行为一致)
  // - capture 阶段挂载, 比目标节点的 onPointerDown 更早跑, 避免被 stopPropagation 漏掉
  useEffect(() => {
    if (!visible) return;
    if (typeof document === "undefined") return;
    const handleDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const popoverEl = popoverRef.current;
      const anchorEl = anchorRef?.current ?? null;
      if (popoverEl && popoverEl.contains(target)) return;
      if (anchorEl && anchorEl.contains(target)) return;
      onClose();
      // 吞掉接下来同序列的 click, 防止穿透到底层卡片
      const suppressClick = (ce: MouseEvent) => {
        ce.stopPropagation();
        ce.preventDefault();
        document.removeEventListener("click", suppressClick, true);
      };
      document.addEventListener("click", suppressClick, true);
      // 兜底: 若本次 pointerdown 因故没产生 click (拖动 / cancel), 100ms 后摘掉拦截器
      window.setTimeout(() => {
        document.removeEventListener("click", suppressClick, true);
      }, 400);
    };
    document.addEventListener("pointerdown", handleDocPointerDown, true);
    const handleDocKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handleDocKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocPointerDown, true);
      document.removeEventListener("keydown", handleDocKeyDown, true);
    };
  }, [visible, anchorRef, onClose]);

  // Legacy 模式: absolute bottom-full right-0 (在父级内, 受 ancestor overflow-hidden 约束)
  if (!usePortal) {
    return (
      <AnimatePresence>
        {visible ? (
          <motion.div
            ref={popoverRef}
            className={`absolute bottom-full right-0 z-[70] mb-1 min-w-[120px] rounded-lg border border-ink/10 bg-white py-1 shadow-lg ${className ?? ""}`}
            variants={scaleModal}
            initial="initial"
            animate="in"
            exit="out"
            transition={{ duration: duration.fast, ease: ease.accelerate }}
            // popover 内部点击不冒泡到外层卡片 (但 document 级 pointerdown 已识别 contains 跳过)
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  // v0.9.42-dev C-1 Portal 模式: createPortal 到 body, fixed 定位, 绕开 ancestor overflow-hidden
  return (
    <AnimatePresence>
      {visible ? (
        <>
          {typeof document !== "undefined"
            ? createPortal(
                <motion.div
                  ref={popoverRef}
                  className={`fixed z-[70] min-w-[120px] rounded-lg border border-ink/10 bg-white py-1 shadow-lg ${className ?? ""}`}
                  style={{ top: -9999, left: -9999 }}
                  variants={scaleModal}
                  initial="initial"
                  animate="in"
                  exit="out"
                  transition={{ duration: duration.fast, ease: ease.accelerate }}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  {children}
                </motion.div>,
                document.body,
              )
            : null}
        </>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  AiTaskProgressCard – 阶段式 AI 任务进度卡片                        */
/* ------------------------------------------------------------------ */

interface AiTaskProgressCardProps {
  /** 当前阶段文案；必须体现"阶段"而非模型内部真实百分比 */
  stage: string;
  /** 进度 0-100；由调用方控制；不可精确估算时建议上限 85-90% */
  progress: number;
  visible: boolean;
  /** 任务名，如 "AI 识别衣物" / "AI 生成穿着预览" */
  label?: string;
  /** v0.9.6: 副标签, 用于"第 N / M 张"批量信息 (Plan B B1) */
  subLabel?: string;
}

export function AiTaskProgressCard({
  stage,
  progress,
  visible,
  label = "AI 处理中",
  subLabel,
}: AiTaskProgressCardProps) {
  const prefersReducedMotion = useReducedMotion();
  if (!visible) return null;
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <div
      className="rounded-lg border border-denim/20 bg-denim/5 p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{label}</p>
          {subLabel && <p className="mt-0.5 truncate text-xs font-medium text-denim/80">{subLabel}</p>}
          <p className="mt-0.5 truncate text-xs text-ink/60">{stage}</p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-denim tabular-nums">
          {Math.round(clamped)}%
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-denim/15"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-denim"
          style={{
            width: `${clamped}%`,
            transition: prefersReducedMotion ? "none" : "width 0.3s ease-out",
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionShimmer – loading placeholder shimmer                       */
/* ------------------------------------------------------------------ */

interface MotionShimmerProps {
  className?: string;
}

export function MotionShimmer({ className }: MotionShimmerProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      className={`overflow-hidden rounded-lg bg-mist ${className ?? ""}`}
    >
      {prefersReduced ? (
        <div className="h-full w-full bg-mist" />
      ) : (
        <motion.div
          className="h-full w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
          animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionAccordion – layout animation for expand/collapse            */
/* ------------------------------------------------------------------ */

interface MotionAccordionProps {
  children: React.ReactNode;
  expanded: boolean;
  className?: string;
  /** When false, uses opacity+y only (no height animation). Use for image-heavy grids. Default true. */
  animateHeight?: boolean;
}

export function MotionAccordion({
  children,
  expanded,
  className,
  animateHeight = true,
}: MotionAccordionProps) {
  const heightAnim = animateHeight
    ? { height: 0 as const, opacity: 0 }
    : { opacity: 0, y: 8 };
  const heightAnimIn = animateHeight
    ? { height: "auto" as const, opacity: 1 }
    : { opacity: 1, y: 0 };

  return (
    <AnimatePresence initial={false}>
      {expanded ? (
        <motion.div
          className={`overflow-hidden ${className ?? ""}`}
          initial={heightAnim}
          animate={heightAnimIn}
          exit={heightAnim}
          transition={{ duration: duration.normal, ease: ease.app }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionTransition – wraps keyed content with AnimatePresence       */
/* ------------------------------------------------------------------ */

interface MotionTransitionProps {
  children: React.ReactNode;
  /** Key that triggers enter/exit when it changes. */
  transitionKey: string;
  className?: string;
  /** "horizontal" for slide-right push/pop. "fade" for simple crossfade. */
  variant?: "horizontal" | "fade";
}

export function MotionTransition({
  children,
  transitionKey,
  className,
  variant = "horizontal",
}: MotionTransitionProps) {
  const variants = variant === "horizontal" ? slideRight : scaleModal;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={transitionKey}
        className={className}
        variants={variants}
        initial="initial"
        animate="in"
        exit="out"
        transition={{ duration: duration.panel, ease: ease.app }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
