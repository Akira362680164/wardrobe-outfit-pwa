"use client";

import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  getNavigationMotionStates,
  readPresentedWindowScrollY,
  restoreWindowScrollBeforePaint,
} from "@/components/navigation-motion";
import type { NavigationDirection } from "@/lib/app-route";
import { duration, ease, spring } from "@/lib/motion-tokens";

export type SettingsPageName = "home" | "profile" | "photos" | "minimax" | "wardrobes" | "weather_location";

export interface SettingsPageTransition {
  id: number;
  fromPage: SettingsPageName;
  toPage: SettingsPageName;
  direction: Extract<NavigationDirection, "push" | "pop">;
}

const SETTINGS_PAGE_LABELS: Record<SettingsPageName, string> = {
  home: "设置",
  profile: "穿衣画像",
  photos: "AI 试穿参考照片",
  minimax: "MiniMax 设置",
  wardrobes: "衣橱位置",
  weather_location: "天气地点",
};

export function createSettingsPageTransition(
  id: number,
  fromPage: SettingsPageName,
  toPage: SettingsPageName,
  direction: SettingsPageTransition["direction"],
): SettingsPageTransition {
  return { id, fromPage, toPage, direction };
}

function SettingsSubpageMotionPage({
  page,
  direction,
  reduceMotion,
  children,
}: {
  page: SettingsPageName;
  direction: SettingsPageTransition["direction"];
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const isPresent = useIsPresent();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const variants = useMemo<Variants>(() => ({
    enter: (activeDirection: SettingsPageTransition["direction"]) => ({
      ...getNavigationMotionStates(activeDirection, reduceMotion).enter,
      transition: reduceMotion
        ? { duration: duration.fast, ease: ease.app }
        : { ...spring.panel, opacity: { duration: 0.14, ease: ease.app } },
    }),
    center: (activeDirection: SettingsPageTransition["direction"]) => ({
      ...getNavigationMotionStates(activeDirection, reduceMotion).center,
      transition: reduceMotion
        ? { duration: duration.fast, ease: ease.app }
        : { ...spring.panel, opacity: { duration: 0.14, ease: ease.app } },
    }),
    exit: (activeDirection: SettingsPageTransition["direction"]) => ({
      ...getNavigationMotionStates(activeDirection, reduceMotion).exit,
      transition: reduceMotion
        ? { duration: duration.fast, ease: ease.app }
        : { ...spring.panel, opacity: { duration: 0.14, ease: ease.app } },
    }),
  }), [reduceMotion]);

  useLayoutEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      ref={pageRef}
      className="relative min-w-0"
      style={{ gridArea: "1 / 1", pointerEvents: isPresent ? "auto" : "none" }}
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      role="region"
      aria-label={isPresent ? `${SETTINGS_PAGE_LABELS[page]}页面` : undefined}
      aria-hidden={isPresent ? undefined : true}
      inert={isPresent ? undefined : true}
      tabIndex={-1}
      data-settings-navigation-presence={isPresent ? "current" : "exiting"}
    >
      {children}
    </motion.div>
  );
}

/**
 * Settings owns one nested hierarchy inside the outer settings_home route.
 * Only the list position is restored: child pages intentionally start at top.
 */
export function SettingsSubpageMotion({
  transition,
  children,
}: {
  transition: SettingsPageTransition;
  children: React.ReactNode;
}) {
  const reduceMotion = Boolean(useReducedMotion());
  const renderedPageRef = useRef<SettingsPageName>(transition.toPage);
  const homeScrollYRef = useRef(0);
  const cancelPendingRestoreRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (renderedPageRef.current === "home") {
      homeScrollYRef.current = readPresentedWindowScrollY();
    }
    const targetScrollY = transition.toPage === "home" ? homeScrollYRef.current : 0;
    cancelPendingRestoreRef.current?.();
    cancelPendingRestoreRef.current = restoreWindowScrollBeforePaint(targetScrollY);
    renderedPageRef.current = transition.toPage;
  }, [transition.id, transition.toPage]);

  useEffect(() => () => cancelPendingRestoreRef.current?.(), []);

  return (
    <div
      className="grid min-w-0 overflow-x-clip"
      data-settings-navigation-direction={transition.direction}
      data-settings-navigation-from={transition.fromPage}
      data-settings-navigation-to={transition.toPage}
    >
      <AnimatePresence mode="sync" initial={false} custom={transition.direction}>
        <SettingsSubpageMotionPage
          key={transition.id}
          page={transition.toPage}
          direction={transition.direction}
          reduceMotion={reduceMotion}
        >
          {children}
        </SettingsSubpageMotionPage>
      </AnimatePresence>
    </div>
  );
}
