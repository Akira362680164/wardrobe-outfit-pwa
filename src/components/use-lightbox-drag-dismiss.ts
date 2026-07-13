"use client";

import { animate, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import {
  estimateGestureVelocity,
  projectGestureEndpoint,
  recordGestureVelocitySample,
  resolveGestureAxisIntent,
  rubberBandDistance,
  unRubberBandDistance,
  type GestureAxisIntent,
  type GestureVelocitySample,
} from "@/lib/carousel-logic";

export interface LightboxDragDismissGate {
  enabled?: boolean;
  zoomScale?: number;
  isPanning?: boolean;
}

export function canDragDismissLightbox({
  enabled = true,
  zoomScale = 1,
  isPanning = false,
}: LightboxDragDismissGate): boolean {
  return enabled && Number.isFinite(zoomScale) && zoomScale <= 1.01 && !isPanning;
}

export interface LightboxDragDismissDecisionInput extends LightboxDragDismissGate {
  offsetY: number;
  velocityY: number;
  viewportHeight: number;
}

export interface LightboxDragDismissDecision {
  shouldDismiss: boolean;
  projectedY: number;
  thresholdY: number;
  releaseVelocityY: number;
}

export function resolveLightboxDragDismiss(
  input: LightboxDragDismissDecisionInput,
): LightboxDragDismissDecision {
  const viewportHeight = Math.max(1, input.viewportHeight);
  const thresholdY = Math.max(96, Math.min(160, viewportHeight * 0.18));
  const releaseVelocityY = Number.isFinite(input.velocityY)
    ? Math.max(-2600, Math.min(2600, input.velocityY))
    : 0;
  const projectedY = projectGestureEndpoint(input.offsetY, releaseVelocityY);
  const shouldDismiss = canDragDismissLightbox(input)
    && input.offsetY >= 18
    && projectedY >= thresholdY;
  return { shouldDismiss, projectedY, thresholdY, releaseVelocityY };
}

interface LightboxPointerStart {
  pointerId: number;
  x: number;
  y: number;
  presentationY: number;
  inheritedVelocityY: number;
  intent: GestureAxisIntent;
  capturedTarget: HTMLDivElement | null;
  samples: GestureVelocitySample[];
}

function readElementTranslateY(element: HTMLElement, fallback: number): number {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return fallback;
  try {
    if (typeof DOMMatrixReadOnly !== "undefined") return new DOMMatrixReadOnly(transform).m42;
  } catch {
    // Fall through to the matrix parser for older Android WebViews.
  }
  const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]?.split(",").map(Number) ?? [];
  const value = values.length === 16 ? values[13] : values[5];
  return Number.isFinite(value) ? value! : fallback;
}

export interface UseLightboxDragDismissOptions extends LightboxDragDismissGate {
  onDismiss: () => void;
  viewportHeight?: number;
}

export interface LightboxDragDismissBindings {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export interface LightboxDragDismissController {
  y: MotionValue<number>;
  imageScale: MotionValue<number>;
  backdropOpacity: MotionValue<number>;
  bindings: LightboxDragDismissBindings;
  isEnabled: boolean;
  reset: () => void;
}

/**
 * Runtime-ready controller for C2 to compose into MotionImageLightbox. B2 keeps
 * it isolated so the shared overlay implementation remains single-owner.
 */
export function useLightboxDragDismiss({
  onDismiss,
  viewportHeight,
  enabled = true,
  zoomScale = 1,
  isPanning = false,
}: UseLightboxDragDismissOptions): LightboxDragDismissController {
  const y = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const pointerRef = useRef<LightboxPointerStart | null>(null);
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const animationPresentationRef = useRef({ position: 0, velocity: 0, time: 0 });
  const suppressedPointerRef = useRef<number | null>(null);
  const clearFrameRef = useRef<number | null>(null);
  const dismissRequestedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const isEnabled = canDragDismissLightbox({ enabled, zoomScale, isPanning });
  const getViewportHeight = useCallback(
    () => Math.max(1, viewportHeight ?? (typeof window === "undefined" ? 844 : window.innerHeight)),
    [viewportHeight],
  );

  const imageScale = useTransform(y, (value) => {
    const progress = Math.min(1, Math.max(0, value) / getViewportHeight());
    return 1 - progress * 0.06;
  });
  const backdropOpacity = useTransform(y, (value) => {
    const progress = Math.min(1, Math.max(0, value) / (getViewportHeight() * 0.72));
    return 1 - progress * 0.58;
  });

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const releaseCapture = useCallback((start: LightboxPointerStart | null) => {
    const target = start?.capturedTarget;
    if (!target || !start) return;
    try {
      if (target.hasPointerCapture(start.pointerId)) target.releasePointerCapture(start.pointerId);
    } catch {
      // Capture may already be gone after native scrolling or an overlay close.
    }
  }, []);

  const clearSuppression = useCallback(() => {
    suppressedPointerRef.current = null;
    if (clearFrameRef.current !== null) {
      window.cancelAnimationFrame(clearFrameRef.current);
      clearFrameRef.current = null;
    }
  }, []);

  const clearSuppressionAfterSequence = useCallback(() => {
    if (clearFrameRef.current !== null) window.cancelAnimationFrame(clearFrameRef.current);
    clearFrameRef.current = window.requestAnimationFrame(() => {
      suppressedPointerRef.current = null;
      clearFrameRef.current = null;
    });
  }, []);

  const animateTo = useCallback((targetY: number, velocityY = 0, onComplete?: () => void) => {
    stopAnimation();
    if (reduceMotion) {
      y.set(targetY);
      animationPresentationRef.current = { position: targetY, velocity: 0, time: performance.now() };
      onComplete?.();
      return;
    }
    let previousPosition = y.get();
    let previousTime = performance.now();
    animationPresentationRef.current = { position: previousPosition, velocity: velocityY, time: previousTime };
    animationRef.current = animate(y, targetY, {
      type: "spring",
      stiffness: 340,
      damping: 32,
      mass: 0.9,
      velocity: velocityY,
      restDelta: 0.35,
      restSpeed: 8,
      onUpdate: (position) => {
        const now = performance.now();
        const elapsed = now - previousTime;
        const velocity = elapsed > 0 ? ((position - previousPosition) / elapsed) * 1000 : 0;
        animationPresentationRef.current = { position, velocity, time: now };
        previousPosition = position;
        previousTime = now;
      },
      onComplete,
    });
  }, [reduceMotion, stopAnimation, y]);

  const reset = useCallback(() => {
    const active = pointerRef.current;
    pointerRef.current = null;
    releaseCapture(active);
    dismissRequestedRef.current = false;
    clearSuppression();
    animateTo(0);
  }, [animateTo, clearSuppression, releaseCapture]);

  useEffect(() => {
    if (!isEnabled && (pointerRef.current || y.get() !== 0)) reset();
  }, [isEnabled, reset, y]);

  useEffect(() => () => {
    stopAnimation();
    releaseCapture(pointerRef.current);
    if (clearFrameRef.current !== null) window.cancelAnimationFrame(clearFrameRef.current);
  }, [releaseCapture, stopAnimation]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEnabled || dismissRequestedRef.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearSuppression();
    const presentationY = readElementTranslateY(event.currentTarget, y.get());
    const inheritedVelocityY = animationPresentationRef.current.time > 0
      ? animationPresentationRef.current.velocity
      : y.getVelocity();
    stopAnimation();
    y.set(presentationY);
    animationPresentationRef.current = { position: presentationY, velocity: inheritedVelocityY, time: performance.now() };
    pointerRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      presentationY,
      inheritedVelocityY,
      intent: "pending",
      capturedTarget: null,
      samples: [{ position: presentationY, time: performance.now() }],
    };
  }, [clearSuppression, isEnabled, stopAnimation, y]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.pointerId !== event.pointerId || !isEnabled) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (start.intent === "pending") {
      const nextIntent = resolveGestureAxisIntent(deltaX, deltaY);
      if (nextIntent === "pending") return;
      start.intent = nextIntent;
      suppressedPointerRef.current = event.pointerId;
      if (nextIntent === "horizontal") {
        animateTo(0, start.inheritedVelocityY);
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.capturedTarget = event.currentTarget;
      } catch {
        // pointercancel remains the recovery path when capture is unavailable.
      }
    }
    if (start.intent !== "vertical") return;
    event.preventDefault();
    const height = getViewportHeight();
    const rawPresentationY = start.presentationY < 0
      ? unRubberBandDistance(start.presentationY, height)
      : start.presentationY;
    const rawY = rawPresentationY + deltaY;
    const presentationY = rawY < 0 ? rubberBandDistance(rawY, height) : rawY;
    y.set(presentationY);
    recordGestureVelocitySample(start.samples, { position: presentationY, time: performance.now() });
  }, [animateTo, getViewportHeight, isEnabled, y]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    releaseCapture(start);

    if (start.intent !== "vertical" || !isEnabled) {
      animateTo(0, start.intent === "pending" ? start.inheritedVelocityY : 0);
      if (start.intent !== "pending") clearSuppressionAfterSequence();
      return;
    }

    const height = getViewportHeight();
    const rawPresentationY = start.presentationY < 0
      ? unRubberBandDistance(start.presentationY, height)
      : start.presentationY;
    const rawY = rawPresentationY + (event.clientY - start.y);
    const finalY = rawY < 0 ? rubberBandDistance(rawY, height) : rawY;
    y.set(finalY);
    recordGestureVelocitySample(start.samples, { position: finalY, time: performance.now() });
    const sampledVelocity = estimateGestureVelocity(start.samples);
    const releaseVelocityY = Math.abs(sampledVelocity) > 1
      ? sampledVelocity
      : start.inheritedVelocityY;
    const decision = resolveLightboxDragDismiss({
      offsetY: finalY,
      velocityY: releaseVelocityY,
      viewportHeight: height,
      enabled,
      zoomScale,
      isPanning,
    });

    if (decision.shouldDismiss) {
      dismissRequestedRef.current = true;
      animateTo(
        Math.max(height + 64, finalY + 120),
        decision.releaseVelocityY,
        () => onDismissRef.current(),
      );
    } else {
      animateTo(0, decision.releaseVelocityY);
    }
    clearSuppressionAfterSequence();
  }, [animateTo, clearSuppressionAfterSequence, enabled, getViewportHeight, isEnabled, isPanning, releaseCapture, y, zoomScale]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    releaseCapture(start);
    clearSuppression();
    animateTo(0);
  }, [animateTo, clearSuppression, releaseCapture]);

  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const suppressedPointerId = suppressedPointerRef.current;
    if (suppressedPointerId === null) return;
    const nativePointerId = (event.nativeEvent as MouseEvent & { pointerId?: number }).pointerId;
    if (nativePointerId !== undefined && nativePointerId !== suppressedPointerId) return;
    event.preventDefault();
    event.stopPropagation();
    clearSuppression();
  }, [clearSuppression]);

  return {
    y,
    imageScale,
    backdropOpacity,
    isEnabled,
    reset,
    bindings: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onClickCapture: handleClickCapture,
    },
  };
}
