/**
 * App-level motion tokens.
 * Tuned for mobile-first feel: durations short, easing decelerated.
 * All consumers should honor reducedMotion="user" via MotionConfig.
 */

export const duration = {
  fast: 0.12,
  normal: 0.22,
  panel: 0.32,
  slow: 0.45,
} as const;

/** Deceleration easing for natural-feeling enter / layout animations. */
export const ease = {
  app: [0.2, 0.8, 0.2, 1] as const,
  /** Alias of `app`, matches the common "ease-out" naming used by newer UI specs. */
  out: [0.2, 0.8, 0.2, 1] as const,
  decelerate: [0.0, 0.0, 0.0, 1] as const,
  accelerate: [0.4, 0.0, 1.0, 1.0] as const,
};

const controlSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 41,
  mass: 1,
  bounce: 0,
};

const panelSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 36,
  mass: 1,
  bounce: 0,
};

const momentumSpring = {
  type: "spring" as const,
  stiffness: 320,
  damping: 27,
  mass: 1,
  bounce: 0.12,
};

export const spring = {
  /** Critically damped feedback for buttons, indicators, and ordinary state changes. */
  control: controlSpring,
  /** Non-bouncing, interruptible movement for panels and page-level surfaces. */
  panel: panelSpring,
  /** Reserved for velocity-carrying drag/flick release; never use on ordinary controls. */
  momentum: momentumSpring,
  /** @deprecated Compatibility alias. Prefer `spring.control`. */
  snappy: controlSpring,
  /** @deprecated Compatibility alias. Prefer `spring.panel`. */
  soft: panelSpring,
  /** @deprecated Compatibility alias. Prefer `spring.panel`. */
  gentle: panelSpring,
};

/** Shared opacity transition */
export const fade = {
  in: { opacity: 1 },
  out: { opacity: 0 },
};

/** Slide-up-from-bottom entrance (for BottomSheet / Toast). */
export const slideUp = {
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: 24 },
  initial: { opacity: 0, y: 24 },
};

/**
 * v0.9.25-dev: Top-anchored Toast drop entrance.
 * Used for global floating toasts that should not push page content down.
 * Subtle y: -10 → 0 enter, 0 → -8 exit (gentle, won't fight reduced-motion user prefs).
 */
export const toastDrop = {
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -8 },
  initial: { opacity: 0, y: -10 },
};

/** Slide-right-from-side entrance (for sub-page push). */
export const slideRight = {
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: 40 },
  initial: { opacity: 0, x: 40 },
};

/** Slide-right-from-side exit (pop back). */
export const slideRightExit = {
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: -30 },
};

/** Scale + opacity for modals (desktop centric fallback). */
export const scaleModal = {
  in: { opacity: 1, scale: 1 },
  out: { opacity: 0, scale: 0.92 },
  initial: { opacity: 0, scale: 0.92 },
};

/** Light tab-switch fade-up (opacity + y, no horizontal displacement). */
export const tabFade = {
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -8 },
  initial: { opacity: 0, y: 8 },
};

/** Light stagger reveal for cards entering in sequence. */
export const staggerReveal = {
  in: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 12 },
};

/** Little scale pop for badge / icon feedback. */
export const pop = {
  initial: { scale: 0 },
  animate: { scale: 1 },
  exit: { scale: 0 },
};
