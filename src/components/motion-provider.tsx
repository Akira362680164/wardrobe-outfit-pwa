"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { ease, duration } from "@/lib/motion-tokens";
import { OverlayRoot } from "@/components/overlay-root";
import {
  MOTION_MEDIA_QUERIES,
  shouldReduceLargeAreaEffects,
} from "@/lib/motion-runtime-preferences";

interface MotionProviderProps {
  children: React.ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    const reducedTransparency = window.matchMedia(MOTION_MEDIA_QUERIES.reducedTransparency);
    const highContrast = window.matchMedia(MOTION_MEDIA_QUERIES.highContrast);
    const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };

    const syncPreferences = () => {
      root.dataset.motionEffects = shouldReduceLargeAreaEffects({
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency || undefined,
        deviceMemoryGb: navigatorWithMemory.deviceMemory,
      }) ? "reduced" : "standard";
      root.toggleAttribute("data-reduced-transparency", reducedTransparency.matches);
      root.toggleAttribute("data-high-contrast", highContrast.matches);
    };

    syncPreferences();
    reducedTransparency.addEventListener("change", syncPreferences);
    highContrast.addEventListener("change", syncPreferences);
    return () => {
      reducedTransparency.removeEventListener("change", syncPreferences);
      highContrast.removeEventListener("change", syncPreferences);
      delete root.dataset.motionEffects;
      root.removeAttribute("data-reduced-transparency");
      root.removeAttribute("data-high-contrast");
    };
  }, []);

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: duration.normal, ease: ease.app }}
    >
      <OverlayRoot>{children}</OverlayRoot>
    </MotionConfig>
  );
}
