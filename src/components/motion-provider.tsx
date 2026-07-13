"use client";

import { MotionConfig } from "motion/react";
import { ease, duration } from "@/lib/motion-tokens";
import { OverlayRoot } from "@/components/overlay-root";

interface MotionProviderProps {
  children: React.ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: duration.normal, ease: ease.app }}
    >
      <OverlayRoot>{children}</OverlayRoot>
    </MotionConfig>
  );
}
