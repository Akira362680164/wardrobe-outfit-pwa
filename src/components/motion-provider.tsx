"use client";

import { MotionConfig } from "motion/react";
import { ease, duration } from "@/lib/motion-tokens";

interface MotionProviderProps {
  children: React.ReactNode;
}

export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: duration.normal, ease: ease.app }}
    >
      {children}
    </MotionConfig>
  );
}
