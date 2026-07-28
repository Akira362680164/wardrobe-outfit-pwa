"use client";

import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react";

import { X } from "lucide-react";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { duration, ease, slideRight, slideRightExit, slideUp, spring, toastDrop } from "@/lib/motion-tokens";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { OriginalCroppedImage } from "@/components/original-cropped-image";
import { OverlayPortal, useOverlayFocusScope, useOverlayLayer } from "@/components/overlay-root";
import { useLightboxDragDismiss } from "@/components/use-lightbox-drag-dismiss";
import type { OverlayDismissReason } from "@/lib/overlay-stack";

const subtleOverlayScale = {
  initial: { opacity: 0, scale: 0.98 },
  in: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.normal, ease: ease.decelerate },
  },
  out: {
    opacity: 0,
    scale: 0.985,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

const anchoredPopoverScale = {
  initial: { opacity: 0, scale: 0.96 },
  in: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.fast, ease: ease.decelerate },
  },
  out: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: duration.fast, ease: ease.accelerate },
  },
};

/** Compatibility name retained for the existing overlay contract. */
function useTopmostFocusScope(
  scopeRef: React.RefObject<HTMLElement | null>,
  isTopmost: boolean,
  initialFocusSelector?: string,
): void {
  // OverlayRoot owns the implementation: `event.key !== "Tab"` is ignored,
  // and `preventDefault()` is applied only at focus-loop boundaries.
  useOverlayFocusScope(scopeRef, isTopmost, initialFocusSelector);
}

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
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion
    ? { initial: { opacity: 0 }, in: { opacity: 1 }, out: { opacity: 0 } }
    : direction === "pop" ? slideRightExit : slideRight;
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp
      className={className}
      variants={variants}
      initial="initial"
      animate="in"
      exit="out"
      transition={{
        duration: prefersReducedMotion ? duration.fast : duration.panel,
        ease: prefersReducedMotion ? ease.out : ease.app,
      }}
    >
      {children}
    </Comp>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionSheet – Bottom-sheet-style modal (mobile-first)              */
/* ------------------------------------------------------------------ */

export type MotionSheetVariant = "action" | "form" | "confirm" | "destructive";

export interface MotionSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra class on the backdrop. */
  className?: string;
  /** Extra class on the sheet panel. */
  panelClassName?: string;
  /** If true, sheet slides from bottom even on desktop. Default true. */
  preferBottom?: boolean;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string;
  ariaLabelledBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  variant?: MotionSheetVariant;
  dismissible?: boolean;
  onDismissBlocked?: (reason: OverlayDismissReason) => void;
}

function MotionSheetLayer({
  onClose,
  children,
  className,
  panelClassName,
  preferBottom = true,
  role,
  ariaLabel,
  ariaLabelledBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  variant = "form",
  dismissible = true,
  onDismissBlocked,
}: MotionSheetProps) {
  // Keep scroll locked through AnimatePresence exit, not only until `open`
  // flips false. The layer unregisters after its visual exit completes.
  useScrollLock(true);
  const prefersReducedMotion = useReducedMotion();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [blockedAnnouncement, setBlockedAnnouncement] = useState("");
  const resolvedRole = role ?? (variant === "destructive" ? "alertdialog" : "dialog");
  const fallbackAriaLabel = {
    action: "操作面板",
    form: "表单面板",
    confirm: "确认操作",
    destructive: "危险操作确认",
  }[variant];
  const canDismiss = useCallback((reason: OverlayDismissReason) => {
    if (reason === "backdrop") return closeOnBackdrop;
    return closeOnEscape;
  }, [closeOnBackdrop, closeOnEscape]);
  const handleBlockedDismiss = useCallback((reason: OverlayDismissReason) => {
    setBlockedAnnouncement("操作进行中，暂时无法关闭");
    onDismissBlocked?.(reason);
  }, [onDismissBlocked]);
  const { overlayId, isTopmost, requestDismiss } = useOverlayLayer({
    kind: resolvedRole,
    dismissible,
    canDismiss,
    onDismiss: () => onClose(),
    onDismissBlocked: handleBlockedDismiss,
  });
  const handleBackdrop = useCallback(() => {
    requestDismiss("backdrop");
  }, [requestDismiss]);
  const stopProp = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  useTopmostFocusScope(panelRef, isTopmost);

  const bottomPresentation = preferBottom && (variant === "action" || variant === "form");
  const panelVariants = prefersReducedMotion
    ? { initial: { opacity: 0 }, in: { opacity: 1 }, out: { opacity: 0 } }
    : bottomPresentation ? slideUp : subtleOverlayScale;

  return (
    <OverlayPortal>
      <div
        className={`fixed inset-0 z-50 ${bottomPresentation ? "" : "grid place-items-center p-4"} ${className ?? ""}`}
        data-overlay-layer={overlayId}
        data-overlay-kind={resolvedRole}
        data-overlay-topmost={isTopmost ? "true" : "false"}
        aria-hidden={isTopmost ? undefined : "true"}
        inert={isTopmost ? undefined : true}
      >
        {/* Backdrop — touch-none(CSS touch-action:none) 禁止该层处理触摸手势.
            wheel/touchmove 全局拦截由 useScrollLock 在 capture 阶段完成,
            不在此处挂 onWheel/onTouchMove 避免 React 19 passive listener 警告. */}
        <motion.div
          className="absolute inset-0 bg-ink/40 touch-none"
          aria-hidden="true"
          variants={{ in: { opacity: 1 }, out: { opacity: 0 } }}
          initial="out"
          animate="in"
          exit="out"
          transition={{ duration: duration.fast }}
          data-parity-id="parity.app.app.src.components.motion.common.d07c4d282a" onClick={handleBackdrop}
        />
        {/* Sheet panel — overscroll-behavior:contain 阻止弹窗内部滚到边界时
            链式触发底层 body 滚动; useScrollLock 同步锁定底层滚动容器 */}
        <motion.div
          ref={panelRef}
          role={resolvedRole}
          aria-modal="true"
          aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? fallbackAriaLabel)}
          aria-labelledby={ariaLabelledBy}
          aria-busy={!dismissible || undefined}
          tabIndex={-1}
          className={`${bottomPresentation ? "absolute bottom-0 inset-x-0 mx-auto rounded-t-2xl" : "relative mx-auto w-full max-w-lg rounded-[var(--ui-radius-card)]"} max-h-[92vh] w-full overflow-y-auto overscroll-contain bg-paper p-4 shadow-2xl outline-none ${panelClassName ?? ""}`}
          variants={panelVariants}
          initial="initial"
          animate="in"
          exit="out"
          transition={{
            duration: prefersReducedMotion ? duration.fast : duration.panel,
            ease: prefersReducedMotion ? ease.out : ease.app,
          }}
          data-overlay-variant={variant}
          data-parity-id="parity.app.app.src.components.motion.common.3ff559809b" onClick={stopProp}
        >
          {children}
          <span className="sr-only" role="status" aria-live="polite">{blockedAnnouncement}</span>
        </motion.div>
      </div>
    </OverlayPortal>
  );
}

export function MotionSheet(props: MotionSheetProps) {
  return (
    <AnimatePresence>
      {props.open ? <MotionSheetLayer key="motion-sheet-layer" {...props} /> : null}
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
  type?: "success" | "error" | "info" | "action";
}

export function MotionToast({ visible, children, className, placement = "bottom", type }: MotionToastProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion
    ? { initial: { opacity: 0 }, in: { opacity: 1 }, out: { opacity: 0 } }
    : placement === "top" ? toastDrop : slideUp;
  const isError = type === "error";
  const ariaProps = isError
    ? { role: "alert" as const, "aria-live": "assertive" as const, "aria-atomic": true as const }
    : { role: "status" as const, "aria-live": "polite" as const, "aria-atomic": true as const };
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className={className}
          variants={variants}
          initial="initial"
          animate="in"
          exit="out"
          transition={prefersReducedMotion
            ? { duration: duration.fast, ease: ease.out }
            : { ...spring.control, opacity: { duration: duration.fast, ease: ease.out } }}
          data-toast-type={type ?? "info"}
        >
          <div {...ariaProps}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  AppPressable – pointer-first, cancelable press feedback            */
/* ------------------------------------------------------------------ */

export type AppPressableFeedback = "control" | "icon" | "card";

const PRESS_CANCEL_DISTANCE_PX = 10;
const PRESS_FEEDBACK_SCALE: Record<AppPressableFeedback, number> = {
  control: 0.985,
  icon: 0.98,
  card: 0.99,
};

interface ActivePressPointer {
  pointerId: number;
  startX: number;
  startY: number;
  canceled: boolean;
}

export interface AppPressableProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  className?: string;
  /** Shared, restrained feedback preset. */
  feedback?: AppPressableFeedback;
  /** Keep the control clickable while suppressing press scale, e.g. selection mode. */
  pressDisabled?: boolean;
  layoutId?: MotionProps["layoutId"];
}

export function AppPressable({
  children,
  className,
  feedback = "control",
  pressDisabled = false,
  disabled = false,
  type = "button",
  layoutId,
  style,
  onBlur,
  onClick,
  onContextMenu,
  onKeyDown,
  onKeyUp,
  onLostPointerCapture,
  onPointerCancel,
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  "aria-disabled": ariaDisabled,
  ...rest
}: AppPressableProps) {
  const prefersReducedMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const activePointerRef = useRef<ActivePressPointer | null>(null);
  const keyboardPressedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const suppressionTimerRef = useRef<number | null>(null);
  const interactionDisabled = disabled || ariaDisabled === true || ariaDisabled === "true";

  const clearClickSuppression = useCallback(() => {
    suppressClickRef.current = false;
    if (suppressionTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(suppressionTimerRef.current);
      suppressionTimerRef.current = null;
    }
  }, []);

  const releaseClickSuppressionAfterSequence = useCallback(() => {
    if (!suppressClickRef.current || typeof window === "undefined") return;
    if (suppressionTimerRef.current !== null) window.clearTimeout(suppressionTimerRef.current);
    suppressionTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressionTimerRef.current = null;
    }, 0);
  }, []);

  const cancelCurrentPress = useCallback(() => {
    const activePointer = activePointerRef.current;
    if (activePointer) activePointer.canceled = true;
    suppressClickRef.current = true;
    setPressed(false);
  }, []);

  useEffect(() => () => {
    if (suppressionTimerRef.current !== null) window.clearTimeout(suppressionTimerRef.current);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(event);
    if (
      event.defaultPrevented ||
      interactionDisabled ||
      pressDisabled ||
      event.button !== 0 ||
      !event.isPrimary
    ) return;
    clearClickSuppression();
    activePointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      canceled: false,
    };
    setPressed(true);
    const eventTarget = event.target instanceof Element ? event.target : null;
    const nestedGestureOwner = eventTarget?.closest(
      '[data-app-press-gesture-owner="true"], [aria-roledescription="carousel"]',
    );
    if (nestedGestureOwner && nestedGestureOwner !== event.currentTarget) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some WebViews may end the sequence before capture; the remaining
      // pointer/blur handlers still restore the visual state safely.
    }
  }, [clearClickSuppression, interactionDisabled, onPointerDown, pressDisabled]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const activePointer = activePointerRef.current;
    if (activePointer?.pointerId === event.pointerId && !activePointer.canceled) {
      const distance = Math.hypot(
        event.clientX - activePointer.startX,
        event.clientY - activePointer.startY,
      );
      const rect = event.currentTarget.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom;
      if (distance > PRESS_CANCEL_DISTANCE_PX || outside) cancelCurrentPress();
    }
    onPointerMove?.(event);
  }, [cancelCurrentPress, onPointerMove]);

  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current?.pointerId === event.pointerId) cancelCurrentPress();
    onPointerLeave?.(event);
  }, [cancelCurrentPress, onPointerLeave]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const activePointer = activePointerRef.current;
    if (activePointer?.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) {
        cancelCurrentPress();
      }
      const canceled = activePointer.canceled;
      activePointerRef.current = null;
      setPressed(false);
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture may already have been released by the browser.
      }
      if (canceled || suppressClickRef.current) releaseClickSuppressionAfterSequence();
    }
    onPointerUp?.(event);
  }, [cancelCurrentPress, onPointerUp, releaseClickSuppressionAfterSequence]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current?.pointerId === event.pointerId) {
      cancelCurrentPress();
      activePointerRef.current = null;
      releaseClickSuppressionAfterSequence();
    }
    onPointerCancel?.(event);
  }, [cancelCurrentPress, onPointerCancel, releaseClickSuppressionAfterSequence]);

  const handleLostPointerCapture = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerRef.current?.pointerId === event.pointerId) {
      cancelCurrentPress();
      activePointerRef.current = null;
      releaseClickSuppressionAfterSequence();
    }
    onLostPointerCapture?.(event);
  }, [cancelCurrentPress, onLostPointerCapture, releaseClickSuppressionAfterSequence]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || interactionDisabled || pressDisabled || event.repeat) return;
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      clearClickSuppression();
      keyboardPressedRef.current = true;
      setPressed(true);
    }
  }, [clearClickSuppression, interactionDisabled, onKeyDown, pressDisabled]);

  const handleKeyUp = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (keyboardPressedRef.current && (event.key === "Enter" || event.key === " " || event.key === "Spacebar")) {
      keyboardPressedRef.current = false;
      setPressed(false);
    }
    onKeyUp?.(event);
  }, [onKeyUp]);

  const handleBlur = useCallback((event: React.FocusEvent<HTMLButtonElement>) => {
    keyboardPressedRef.current = false;
    if (activePointerRef.current) {
      cancelCurrentPress();
      activePointerRef.current = null;
      releaseClickSuppressionAfterSequence();
    } else {
      setPressed(false);
    }
    onBlur?.(event);
  }, [cancelCurrentPress, onBlur, releaseClickSuppressionAfterSequence]);

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (activePointerRef.current) cancelCurrentPress();
    onContextMenu?.(event);
  }, [cancelCurrentPress, onContextMenu]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (interactionDisabled || suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      clearClickSuppression();
      return;
    }
    onClick?.(event);
  }, [clearClickSuppression, interactionDisabled, onClick]);

  return (
    <motion.button
      className={className}
      type={type}
      disabled={disabled}
      aria-disabled={ariaDisabled}
      layoutId={layoutId}
      data-pressed={pressed ? "true" : undefined}
      data-press-feedback={feedback}
      animate={{
        scale: pressed && !prefersReducedMotion ? PRESS_FEEDBACK_SCALE[feedback] : 1,
        opacity: pressed ? 0.78 : 1,
      }}
      transition={prefersReducedMotion
        ? { duration: 0 }
        : { ...spring.control, opacity: { duration: 0.06, ease: ease.out } }}
      style={{ transformOrigin: "center", ...style }}
      onBlur={handleBlur}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      {...(rest as MotionProps &
        React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </motion.button>
  );
}

/* Compatibility wrapper retired: all callers use AppPressable directly. */

/* ------------------------------------------------------------------ */
/*  MotionImageLightbox – scale + opacity transition                  */
/* ------------------------------------------------------------------ */

interface PendingLightboxSourceAnchor {
  element: HTMLElement;
  capturedAt: number;
}

let pendingLightboxSourceAnchor: PendingLightboxSourceAnchor | null = null;

/**
 * Records the concrete image surface that is about to open the shared
 * Lightbox. Keeping this as a one-shot presentation hint avoids widening the
 * persisted image model or the app navigation contract with DOM references.
 */
export function rememberLightboxSourceAnchor(element: HTMLElement | null): void {
  if (!element?.isConnected) return;
  pendingLightboxSourceAnchor = { element, capturedAt: Date.now() };
}

function consumeLightboxSourceAnchor(): HTMLElement | null {
  const pending = pendingLightboxSourceAnchor;
  pendingLightboxSourceAnchor = null;
  if (!pending || Date.now() - pending.capturedAt > 2_000 || !pending.element.isConnected) return null;
  return pending.element;
}

function getVisibleSourceRect(element: HTMLElement | null): DOMRect | null {
  if (!element?.isConnected) return null;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0.01) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return null;
  const visualViewport = window.visualViewport;
  const left = visualViewport?.offsetLeft ?? 0;
  const top = visualViewport?.offsetTop ?? 0;
  const right = left + (visualViewport?.width ?? window.innerWidth);
  const bottom = top + (visualViewport?.height ?? window.innerHeight);
  if (rect.right <= left || rect.left >= right || rect.bottom <= top || rect.top >= bottom) return null;
  return rect;
}

function getSourceTransform(sourceRect: DOMRect, targetRect: DOMRect): string {
  const sourceCenterX = sourceRect.left + sourceRect.width / 2;
  const sourceCenterY = sourceRect.top + sourceRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;
  const scaleX = Math.max(0.02, sourceRect.width / Math.max(1, targetRect.width));
  const scaleY = Math.max(0.02, sourceRect.height / Math.max(1, targetRect.height));
  return `translate3d(${sourceCenterX - targetCenterX}px, ${sourceCenterY - targetCenterY}px, 0) scale(${scaleX}, ${scaleY})`;
}

function runLightboxElementAnimation(
  element: HTMLElement | null,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  if (!element || typeof element.animate !== "function") return Promise.resolve();
  const animation = element.animate(keyframes, options);
  return animation.finished.then(() => undefined, () => undefined);
}

interface MotionImageLightboxProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  thumbnailSrc?: string;
  cropBox?: { x: number; y: number; width: number; height: number };
  displayMode?: "original-cropped";
  ariaLabel?: string;
  /** Down-drag is disabled while a zoom implementation owns pan gestures. */
  zoomScale?: number;
  isPanning?: boolean;
  dragDismissEnabled?: boolean;
}

function MotionImageLightboxLayer({
  onClose,
  src,
  alt,
  thumbnailSrc,
  cropBox,
  displayMode,
  ariaLabel,
  zoomScale = 1,
  isPanning = false,
  dragDismissEnabled = true,
}: Omit<MotionImageLightboxProps, "open">) {
  // Keep both the stack entry and scroll lock alive until the exit animation
  // has completed, so a closing image cannot briefly expose the page below.
  useScrollLock(true);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const backdropEntranceRef = useRef<HTMLDivElement | null>(null);
  const anchorTransitionRef = useRef<HTMLDivElement | null>(null);
  const sourceAnchorRef = useRef<HTMLElement | null>(null);
  const sourceVisibilityRef = useRef("");
  const closingRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const restoreSourceVisibility = useCallback(() => {
    const source = sourceAnchorRef.current;
    if (!source?.isConnected) return;
    source.style.visibility = sourceVisibilityRef.current;
  }, []);

  const finishClose = useCallback(() => {
    restoreSourceVisibility();
    onCloseRef.current();
  }, [restoreSourceVisibility]);

  const dragDismiss = useLightboxDragDismiss({
    onDismiss: finishClose,
    enabled: dragDismissEnabled,
    zoomScale,
    isPanning,
  });

  const beginClose = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    dragDismiss.y.set(0);

    const source = sourceAnchorRef.current;
    let sourceRect: DOMRect | null = null;
    if (source?.isConnected) {
      const hiddenVisibility = source.style.visibility;
      source.style.visibility = sourceVisibilityRef.current;
      sourceRect = getVisibleSourceRect(source);
      source.style.visibility = hiddenVisibility;
    }
    const target = anchorTransitionRef.current;
    const targetPresentation = target ? window.getComputedStyle(target) : null;
    const targetStartTransform = targetPresentation?.transform && targetPresentation.transform !== "none"
      ? targetPresentation.transform
      : "translate3d(0, 0, 0) scale(1, 1)";
    const targetStartBorderRadius = targetPresentation?.borderRadius || "0px";
    const targetStartOpacity = Number(targetPresentation?.opacity ?? 1);
    target?.getAnimations().forEach((animation) => animation.cancel());
    const targetRect = target?.getBoundingClientRect();
    const canReturnToSource = !prefersReducedMotion && sourceRect && targetRect && targetRect.width > 1 && targetRect.height > 1;

    if (target) target.dataset.lightboxSourceTransition = canReturnToSource ? "source" : "fade";
    const durationMs = canReturnToSource ? 240 : prefersReducedMotion ? 100 : 120;
    const targetAnimation = canReturnToSource && sourceRect && targetRect
      ? runLightboxElementAnimation(target, [
          { transform: targetStartTransform, borderRadius: targetStartBorderRadius, opacity: targetStartOpacity },
          { transform: getSourceTransform(sourceRect, targetRect), borderRadius: "16px", opacity: 0.92 },
        ], { duration: durationMs, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" })
      : runLightboxElementAnimation(target, prefersReducedMotion
        ? [{ opacity: targetStartOpacity }, { opacity: 0 }]
        : [
            { transform: targetStartTransform, opacity: targetStartOpacity },
            { transform: "scale(0.985)", opacity: 0 },
          ], { duration: durationMs, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
    const backdrop = backdropEntranceRef.current;
    const backdropStartOpacity = Number(backdrop ? window.getComputedStyle(backdrop).opacity : 1);
    backdrop?.getAnimations().forEach((animation) => animation.cancel());
    const backdropAnimation = runLightboxElementAnimation(backdropEntranceRef.current, [
      { opacity: backdropStartOpacity },
      { opacity: 0 },
    ], { duration: durationMs, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
    await Promise.all([targetAnimation, backdropAnimation]);
    finishClose();
  }, [dragDismiss.y, finishClose, prefersReducedMotion]);

  const { overlayId, isTopmost, requestDismiss } = useOverlayLayer({
    kind: "lightbox",
    onDismiss: () => { void beginClose(); },
  });
  useTopmostFocusScope(layerRef, isTopmost, '[data-lightbox-close="true"]');
  const handleDismiss = useCallback(() => {
    requestDismiss("backdrop");
  }, [requestDismiss]);

  useLayoutEffect(() => {
    const source = consumeLightboxSourceAnchor();
    sourceAnchorRef.current = source;
    const target = anchorTransitionRef.current;
    const sourceRect = getVisibleSourceRect(source);
    const targetRect = target?.getBoundingClientRect();
    const canUseSource = !prefersReducedMotion && sourceRect && targetRect && targetRect.width > 1 && targetRect.height > 1;
    if (target) target.dataset.lightboxSourceTransition = canUseSource ? "source" : "fade";
    if (source) sourceVisibilityRef.current = source.style.visibility;

    if (source && canUseSource) {
      source.style.visibility = "hidden";
      void runLightboxElementAnimation(target, [
        { transform: getSourceTransform(sourceRect, targetRect), borderRadius: "16px", opacity: 0.88 },
        { transform: "translate3d(0, 0, 0) scale(1, 1)", borderRadius: "0px", opacity: 1 },
      ], { duration: 280, easing: "cubic-bezier(0, 0, 0, 1)", fill: "both" });
    } else {
      void runLightboxElementAnimation(target, prefersReducedMotion
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: "scale(0.985)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
          ], { duration: prefersReducedMotion ? 100 : 140, easing: "cubic-bezier(0, 0, 0, 1)", fill: "both" });
    }

    return restoreSourceVisibility;
  }, [prefersReducedMotion, restoreSourceVisibility]);

  return (
    <OverlayPortal>
      <motion.div
        ref={layerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (alt ? `查看图片：${alt}` : "查看图片")}
        aria-hidden={isTopmost ? undefined : "true"}
        inert={isTopmost ? undefined : true}
        tabIndex={-1}
        className="fixed inset-0 z-[80] grid min-h-[100dvh] place-items-center p-4 outline-none"
        variants={{ in: { opacity: 1 }, out: { opacity: 0 } }}
        initial="out"
        animate="in"
        exit="out"
        transition={{ duration: 0.01 }}
        data-overlay-layer={overlayId}
        data-overlay-kind="lightbox"
        data-overlay-topmost={isTopmost ? "true" : "false"}
        data-parity-id="parity.app.app.src.components.motion.common.4584c58a8f"
        onClick={handleDismiss}
      >
        <motion.div
          ref={backdropEntranceRef}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.fast, ease: ease.decelerate }}
          aria-hidden="true"
        >
          <motion.div className="absolute inset-0 bg-black" style={{ opacity: dragDismiss.backdropOpacity }} />
        </motion.div>
        {/* Image container intentionally bubbles clicks: the established
            lightbox interaction lets users tap the image or backdrop to close. */}
        <div
          ref={anchorTransitionRef}
          className="relative z-10 h-[88dvh] w-[min(92vw,64rem)] origin-center"
          data-lightbox-source-transition="pending"
        >
          <motion.div
            className="relative h-full w-full overflow-hidden bg-black"
            style={{ y: dragDismiss.y, scale: dragDismiss.imageScale, touchAction: "none" }}
            data-lightbox-drag-enabled={dragDismiss.isEnabled ? "true" : "false"}
            {...dragDismiss.bindings}
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => {
              if (!dragDismiss.isEnabled) event.stopPropagation();
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox renders local data-URL images, not static assets */}
            {displayMode === "original-cropped" ? (
              <OriginalCroppedImage originalSrc={src} thumbnailSrc={thumbnailSrc} cropBox={cropBox} alt={alt} className="h-full w-full" />
            ) : (
              <img loading="lazy" decoding="async" draggable={false} src={src} alt={alt} className="h-full w-full object-contain" />
            )}

            <button
              type="button"
              className="absolute top-2 right-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition-colors hover:bg-black/75 active:bg-black/80"
              data-lightbox-close="true"
              data-parity-id="parity.app.app.src.components.motion.common.c59e73fe7f"
              onClick={(event) => {
                event.stopPropagation();
                handleDismiss();
              }}
              aria-label="关闭图片预览"
            >
              <X size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </motion.div>
        </div>
      </motion.div>
    </OverlayPortal>
  );
}

export function MotionImageLightbox(props: MotionImageLightboxProps) {
  return (
    <AnimatePresence>
      {props.open ? <MotionImageLightboxLayer key="motion-image-lightbox" {...props} /> : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionPopoverMenu – opacity + scale from anchor                   */
/* ------------------------------------------------------------------ */

const MENU_ITEM_SELECTOR =
  'button, a[href], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

function getEnabledMenuItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (node) => !node.hasAttribute("disabled") && node.getAttribute("aria-disabled") !== "true" && node.tabIndex !== -1,
  );
}

/**
 * Guard only the click generated by one outside pointer sequence. The guard
 * releases on that click, pointer cancellation, or the first frame after the
 * matching pointerup; it never leaves a time-based global suppression window.
 */
function suppressClickForPointerSequence(pointerId: number): () => void {
  let active = true;
  let releaseFrame: number | null = null;

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (releaseFrame !== null) window.cancelAnimationFrame(releaseFrame);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("pointerup", handlePointerUp, true);
    document.removeEventListener("pointercancel", handlePointerCancel, true);
  };
  const handleClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    // A click from this sequence is dispatched before the next animation frame.
    // If no click is generated (drag/cancel), release without delaying input.
    releaseFrame = window.requestAnimationFrame(cleanup);
  };
  const handlePointerCancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) cleanup();
  };

  document.addEventListener("click", handleClick, true);
  document.addEventListener("pointerup", handlePointerUp, true);
  document.addEventListener("pointercancel", handlePointerCancel, true);
  return cleanup;
}

interface MotionPopoverMenuProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  /**
   * The trigger used for spatial positioning and focus restoration. Existing
   * callers may omit it; a local marker preserves the old bottom-right anchor
   * while the menu still renders through the shared OverlayPortal.
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

interface MotionPopoverMenuLayerProps extends Omit<MotionPopoverMenuProps, "visible"> {
  positioningAnchorRef: React.RefObject<HTMLElement | null>;
  preferAbove: boolean;
}

function MotionPopoverMenuLayer({
  onClose,
  children,
  className,
  ariaLabel,
  anchorRef,
  positioningAnchorRef,
  preferAbove,
}: MotionPopoverMenuLayerProps) {
  useScrollLock(true);
  const prefersReducedMotion = useReducedMotion();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const pointerSequenceCleanupRef = useRef<(() => void) | null>(null);
  const { overlayId, isTopmost, requestDismiss } = useOverlayLayer({
    kind: "popover",
    onDismiss: () => onClose(),
    restoreFocusTo: anchorRef,
  });

  // Existing call sites provide native buttons. Promote them into menu items
  // without forcing a breaking children API migration.
  useLayoutEffect(() => {
    const menu = popoverRef.current;
    if (!menu) return;
    const candidates = Array.from(menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
    candidates.forEach((candidate) => {
      if (!candidate.hasAttribute("role")) candidate.setAttribute("role", "menuitem");
      if (candidate.hasAttribute("disabled")) candidate.setAttribute("aria-disabled", "true");
    });
  }, [children]);

  useTopmostFocusScope(popoverRef, isTopmost, '[role="menuitem"]:not([aria-disabled="true"])');

  useLayoutEffect(() => {
    let retryFrame: number | null = null;
    const update = (): boolean => {
      const anchorEl = positioningAnchorRef.current;
      const popoverEl = popoverRef.current;
      if (!anchorEl || !popoverEl) return false;
      const rect = anchorEl.getBoundingClientRect();
      const popoverH = popoverEl.offsetHeight;
      const popoverW = popoverEl.offsetWidth;
      const visualViewport = window.visualViewport;
      const viewportLeft = visualViewport?.offsetLeft ?? 0;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const margin = 8;
      const gap = 8;

      let top: number;
      let placement: "above" | "below";
      const belowSpace = viewportBottom - rect.bottom - gap - margin;
      const aboveSpace = rect.top - viewportTop - gap - margin;
      if ((preferAbove && aboveSpace >= popoverH) || belowSpace < popoverH) {
        placement = "above";
        top = rect.top - popoverH - gap;
      } else {
        placement = "below";
        top = rect.bottom + gap;
      }
      const maxTop = Math.max(viewportTop + margin, viewportBottom - popoverH - margin);
      top = Math.max(viewportTop + margin, Math.min(maxTop, top));

      let left = rect.right - popoverW;
      const maxLeft = Math.max(viewportLeft + margin, viewportRight - popoverW - margin);
      left = Math.max(viewportLeft + margin, Math.min(maxLeft, left));

      const originX = Math.max(0, Math.min(popoverW, rect.left + rect.width / 2 - left));
      const originY = Math.max(0, Math.min(popoverH, rect.top + rect.height / 2 - top));

      popoverEl.style.top = `${top}px`;
      popoverEl.style.left = `${left}px`;
      popoverEl.style.transformOrigin = `${originX}px ${originY}px`;
      popoverEl.dataset.placement = placement;
      return true;
    };
    if (!update()) retryFrame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      if (retryFrame !== null) window.cancelAnimationFrame(retryFrame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [positioningAnchorRef, preferAbove]);

  useEffect(() => {
    if (!isTopmost) return;
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const popoverEl = popoverRef.current;
      const anchorEl = positioningAnchorRef.current;
      if (popoverEl && popoverEl.contains(target)) return;
      if (anchorEl && anchorEl.contains(target)) return;
      const result = requestDismiss("backdrop");
      if (!result.handled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pointerSequenceCleanupRef.current?.();
      pointerSequenceCleanupRef.current = suppressClickForPointerSequence(event.pointerId);
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      pointerSequenceCleanupRef.current?.();
      pointerSequenceCleanupRef.current = null;
    };
  }, [isTopmost, positioningAnchorRef, requestDismiss]);

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isTopmost) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      requestDismiss("escape");
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menu = popoverRef.current;
    if (!menu) return;
    const items = getEnabledMenuItems(menu);
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    else nextIndex = currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1;
    items[nextIndex]?.focus();
  }, [isTopmost, requestDismiss]);

  return (
    <OverlayPortal>
      <motion.div
        ref={popoverRef}
        role="menu"
        aria-label={ariaLabel ?? "更多操作"}
        aria-orientation="vertical"
        aria-hidden={isTopmost ? undefined : "true"}
        inert={isTopmost ? undefined : true}
        tabIndex={-1}
        className={`fixed z-[70] min-w-[120px] max-w-[calc(100vw-16px)] rounded-lg border border-ink/10 bg-white py-1 shadow-lg outline-none ${className ?? ""}`}
        style={{ top: -9999, left: -9999, transformOrigin: "100% 0" }}
        variants={prefersReducedMotion
          ? { initial: { opacity: 0 }, in: { opacity: 1 }, out: { opacity: 0 } }
          : anchoredPopoverScale}
        initial="initial"
        animate="in"
        exit="out"
        transition={{ duration: duration.fast, ease: ease.out }}
        data-overlay-layer={overlayId}
        data-overlay-kind="popover"
        data-overlay-topmost={isTopmost ? "true" : "false"}
        data-parity-id="parity.app.app.src.components.motion.common.8e918697ef"
        onKeyDown={handleMenuKeyDown}
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        {children}
      </motion.div>
    </OverlayPortal>
  );
}

export function MotionPopoverMenu({
  visible,
  onClose,
  children,
  className,
  ariaLabel,
  anchorRef,
}: MotionPopoverMenuProps) {
  const legacyAnchorRef = useRef<HTMLSpanElement | null>(null);
  const positioningAnchorRef = (anchorRef ?? legacyAnchorRef) as React.RefObject<HTMLElement | null>;

  return (
    <>
      {!anchorRef ? (
        <span
          ref={legacyAnchorRef}
          className="pointer-events-none absolute right-0 top-0 h-px w-px"
          aria-hidden="true"
          data-popover-legacy-anchor="true"
        />
      ) : null}
      <AnimatePresence>
        {visible ? (
          <MotionPopoverMenuLayer
            key="motion-popover-menu"
            onClose={onClose}
            className={className}
            ariaLabel={ariaLabel}
            anchorRef={anchorRef}
            positioningAnchorRef={positioningAnchorRef}
            preferAbove={!anchorRef}
          >
            {children}
          </MotionPopoverMenuLayer>
        ) : null}
      </AnimatePresence>
    </>
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
      aria-busy={clamped < 100 || undefined}
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
        role="progressbar"
        aria-label={`${label}进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-valuetext={stage}
      >
        <div
          className="h-full rounded-full bg-denim"
          style={{
            transform: `scaleX(${clamped / 100})`,
            transformOrigin: "left center",
            transition: prefersReducedMotion ? "none" : "transform 0.3s ease-out",
            willChange: clamped > 0 && clamped < 100 ? "transform" : undefined,
          }}
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {label}：{stage}
      </span>
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
            willChange: "transform",
          }}
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
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
  const prefersReducedMotion = useReducedMotion();
  // Compatibility prop: older callers can still request the richer reveal,
  // but no path interpolates intrinsic height. This avoids repeated layout on
  // image-heavy content and makes the reduced-motion branch opacity-only.
  const shouldAnimateHeight = animateHeight && !prefersReducedMotion;
  const revealFrom = prefersReducedMotion
    ? { opacity: 0 }
    : shouldAnimateHeight ? { opacity: 0, y: 8 } : { opacity: 0, y: 4 };
  const revealTo = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 };

  return (
    <AnimatePresence initial={false}>
      {expanded ? (
        <motion.div
          className={`overflow-hidden ${className ?? ""}`}
          initial={revealFrom}
          animate={revealTo}
          exit={revealFrom}
          transition={{
            duration: prefersReducedMotion ? duration.fast : duration.normal,
            ease: ease.app,
          }}
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
/* Retired duplicate API: use NavigationMotion or SettingsSubpageMotion. */
