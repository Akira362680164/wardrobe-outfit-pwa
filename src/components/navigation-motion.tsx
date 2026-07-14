"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { AppRoute, NavigationDirection, NavigationTransition } from "@/lib/app-route";
import { getRouteScrollKey } from "@/lib/app-route";
import { duration, ease, spring } from "@/lib/motion-tokens";

type NavigationMotionState = {
  opacity: number;
  x?: number;
  y?: number;
  zIndex?: number;
};

export interface NavigationMotionStates {
  enter: NavigationMotionState;
  center: NavigationMotionState;
  exit: NavigationMotionState;
}

/** Pure motion map used by both the runtime and the C1 regression harness. */
export function getNavigationMotionStates(
  direction: NavigationDirection,
  reduceMotion: boolean,
): NavigationMotionStates {
  if (reduceMotion) {
    return {
      enter: { opacity: 0.96, zIndex: 2 },
      center: { opacity: 1, zIndex: 2 },
      exit: { opacity: 0.96, zIndex: 1 },
    };
  }

  switch (direction) {
    case "tab":
      return {
        enter: { opacity: 0.96, y: 4, zIndex: 2 },
        center: { opacity: 1, y: 0, zIndex: 2 },
        exit: { opacity: 0.96, y: -2, zIndex: 1 },
      };
    case "push":
      return {
        enter: { opacity: 0.98, x: 24, zIndex: 2 },
        center: { opacity: 1, x: 0, zIndex: 2 },
        exit: { opacity: 0.96, x: -6, zIndex: 1 },
      };
    case "pop":
      return {
        enter: { opacity: 0.96, x: -6, zIndex: 1 },
        center: { opacity: 1, x: 0, zIndex: 1 },
        exit: { opacity: 0.98, x: 24, zIndex: 2 },
      };
    case "replace":
      return {
        enter: { opacity: 0.96, zIndex: 2 },
        center: { opacity: 1, zIndex: 2 },
        exit: { opacity: 0.96, zIndex: 1 },
      };
  }
}

function getNavigationTransition(direction: NavigationDirection, reduceMotion: boolean) {
  if (reduceMotion || direction === "tab" || direction === "replace") {
    return { duration: direction === "tab" ? 0.14 : duration.fast, ease: ease.app };
  }
  return {
    ...spring.panel,
    opacity: { duration: 0.14, ease: ease.app },
  };
}

export type NavigationScrollPositions = Record<string, number>;

/**
 * Save the screen that was actually rendered, then resolve the destination's
 * independent scroll position. Mutating the in-memory map is deliberate: the
 * App never persists business or navigation data to device storage.
 */
export function saveAndResolveNavigationScroll(
  positions: NavigationScrollPositions,
  renderedRoute: AppRoute,
  destinationRoute: AppRoute,
  presentedScrollY: number,
): number {
  const safePresentedY = Number.isFinite(presentedScrollY) ? Math.max(0, presentedScrollY) : 0;
  positions[getRouteScrollKey(renderedRoute)] = safePresentedY;
  return positions[getRouteScrollKey(destinationRoute)] ?? 0;
}

/** Read the visually frozen position while an Overlay scroll lock owns body. */
export function readPresentedWindowScrollY(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  if (document.body.style.position === "fixed") {
    const lockedTop = Number.parseFloat(document.body.style.top);
    if (Number.isFinite(lockedTop)) return Math.max(0, -lockedTop);
  }
  return Math.max(0, window.scrollY || window.pageYOffset || 0);
}

function isBodyScrollLocked(): boolean {
  return typeof document !== "undefined" && document.body.style.position === "fixed";
}

/**
 * Ordinary navigation restores synchronously from useLayoutEffect. If a Sheet
 * is still completing its exit, defer only until its fixed-body lock releases;
 * the queued frame runs after the lock's own restoration and before paint.
 */
export function restoreWindowScrollBeforePaint(targetScrollY: number): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const safeTargetY = Number.isFinite(targetScrollY) ? Math.max(0, targetScrollY) : 0;
  const restore = () => {
    window.scrollTo({ top: safeTargetY, left: 0, behavior: "instant" as ScrollBehavior });
  };

  if (!isBodyScrollLocked()) {
    restore();
    return () => undefined;
  }

  // Keep the incoming route at its own visual position behind the exiting
  // Sheet/fullscreen layer. The lock still owns the real window scroll until
  // exit completes; the observer below wins over its saved-Y writeback.
  document.body.style.top = `-${safeTargetY}px`;

  let canceled = false;
  let frameId: number | null = null;
  const observer = new MutationObserver(() => {
    if (canceled || isBodyScrollLocked()) return;
    observer.disconnect();
    // useScrollLock queues its saved-position restoration before observers run.
    // Queueing after it makes this route-specific target the final pre-paint value.
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      if (!canceled) restore();
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });

  return () => {
    canceled = true;
    observer.disconnect();
    if (frameId !== null) window.cancelAnimationFrame(frameId);
  };
}

function NavigationMotionPage({
  direction,
  reduceMotion,
  children,
}: {
  direction: NavigationDirection;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const isPresent = useIsPresent();
  const variants = useMemo<Variants>(() => ({
    enter: (activeDirection: NavigationDirection) => ({
      ...getNavigationMotionStates(activeDirection, reduceMotion).enter,
      transition: getNavigationTransition(activeDirection, reduceMotion),
    }),
    center: (activeDirection: NavigationDirection) => ({
      ...getNavigationMotionStates(activeDirection, reduceMotion).center,
      transition: getNavigationTransition(activeDirection, reduceMotion),
    }),
    exit: (activeDirection: NavigationDirection) => ({
      ...getNavigationMotionStates(activeDirection, reduceMotion).exit,
      transition: getNavigationTransition(activeDirection, reduceMotion),
    }),
  }), [reduceMotion]);

  return (
    <motion.div
      className="relative min-w-0"
      style={{ gridArea: "1 / 1", pointerEvents: isPresent ? "auto" : "none" }}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      aria-hidden={isPresent ? undefined : true}
      inert={isPresent ? undefined : true}
      data-navigation-presence={isPresent ? "current" : "exiting"}
    >
      {children}
    </motion.div>
  );
}

export function NavigationMotion({
  transition,
  children,
  className,
}: {
  transition: NavigationTransition;
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const scrollPositionsRef = useRef<NavigationScrollPositions>({});
  const renderedRouteRef = useRef<AppRoute>(transition.toRoute);
  const cancelPendingRestoreRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const targetScrollY = saveAndResolveNavigationScroll(
      scrollPositionsRef.current,
      renderedRouteRef.current,
      transition.toRoute,
      readPresentedWindowScrollY(),
    );
    cancelPendingRestoreRef.current?.();
    cancelPendingRestoreRef.current = restoreWindowScrollBeforePaint(targetScrollY);
    renderedRouteRef.current = transition.toRoute;
  }, [transition.id, transition.toRoute]);

  useEffect(() => () => cancelPendingRestoreRef.current?.(), []);

  return (
    <div
      className={["grid min-w-0", className].filter(Boolean).join(" ")}
      data-navigation-direction={transition.direction}
      data-navigation-source={transition.source}
      data-navigation-from={transition.fromRoute.name}
      data-navigation-to={transition.toRoute.name}
    >
      <AnimatePresence mode="sync" initial={false} custom={transition.direction}>
        <NavigationMotionPage
          key={transition.id}
          direction={transition.direction}
          reduceMotion={reduceMotion}
        >
          {children}
        </NavigationMotionPage>
      </AnimatePresence>
    </div>
  );
}
