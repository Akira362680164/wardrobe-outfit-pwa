/**
 * Pure gesture math shared by the weekly strip and monthly calendar tracks.
 *
 * The UI owns pointer capture and animation. This module only resolves intent,
 * rubber-band resistance, recent velocity and the projected snap destination so
 * both calendar surfaces use the same physical rules.
 */

export type CalendarTrackAxisIntent = "pending" | "horizontal" | "vertical";

export interface CalendarTrackPoint {
  x: number;
  y: number;
  time: number;
}

export interface CalendarTrackVelocitySample {
  position: number;
  time: number;
}

export interface CalendarTrackGestureSession {
  pointerId: number;
  start: CalendarTrackPoint;
  startTrackX: number;
  intent: CalendarTrackAxisIntent;
  samples: CalendarTrackVelocitySample[];
}

export interface CalendarTrackMoveResult {
  session: CalendarTrackGestureSession;
  trackX?: number;
  justClaimedHorizontal: boolean;
}

export const CALENDAR_TRACK_INTENT_THRESHOLD = 9;
export const CALENDAR_TRACK_VELOCITY_WINDOW_MS = 110;
export const CALENDAR_TRACK_PROJECTION_SECONDS = 0.2;

const RUBBER_BAND_CONSTANT = 0.55;

export function resolveCalendarTrackAxisIntent(
  deltaX: number,
  deltaY: number,
  threshold = CALENDAR_TRACK_INTENT_THRESHOLD,
): CalendarTrackAxisIntent {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (Math.max(absX, absY) < threshold) return "pending";
  return absX > absY ? "horizontal" : "vertical";
}

export function rubberBandDistance(distance: number, dimension: number): number {
  if (distance <= 0 || dimension <= 0) return 0;
  return (distance * dimension * RUBBER_BAND_CONSTANT)
    / (dimension + RUBBER_BAND_CONSTANT * distance);
}

export function applyCalendarTrackRubberBand(
  position: number,
  pageWidth: number,
): number {
  if (pageWidth <= 0) return position;
  const max = 0;
  const min = -2 * pageWidth;
  if (position > max) return max + rubberBandDistance(position - max, pageWidth);
  if (position < min) return min - rubberBandDistance(min - position, pageWidth);
  return position;
}

export function appendCalendarTrackVelocitySample(
  samples: CalendarTrackVelocitySample[],
  sample: CalendarTrackVelocitySample,
  windowMs = CALENDAR_TRACK_VELOCITY_WINDOW_MS,
): CalendarTrackVelocitySample[] {
  const cutoff = sample.time - windowMs;
  return [...samples, sample].filter((candidate) => candidate.time >= cutoff);
}

export function getCalendarTrackVelocity(
  samples: CalendarTrackVelocitySample[],
): number {
  if (samples.length < 2) return 0;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const elapsedMs = last.time - first.time;
  if (elapsedMs <= 0) return 0;
  return ((last.position - first.position) / elapsedMs) * 1000;
}

export function projectCalendarTrackPosition(
  position: number,
  velocity: number,
  projectionSeconds = CALENDAR_TRACK_PROJECTION_SECONDS,
): number {
  return position + velocity * projectionSeconds;
}

/**
 * Returns -1 / 0 / 1 for previous / current / next page.
 * Projection is intentionally clamped to the resident three-page track so one
 * flick can never skip multiple weeks or months.
 */
export function resolveCalendarTrackSnap(
  position: number,
  velocity: number,
  pageWidth: number,
): -1 | 0 | 1 {
  if (pageWidth <= 0) return 0;
  const projected = projectCalendarTrackPosition(position, velocity);
  const pageIndex = Math.max(0, Math.min(2, Math.round(-projected / pageWidth)));
  return (pageIndex - 1) as -1 | 0 | 1;
}

export function getCalendarTrackTargetX(pageOffset: -1 | 0 | 1, pageWidth: number): number {
  return -(pageOffset + 1) * pageWidth;
}

export function createCalendarTrackGestureSession(
  pointerId: number,
  point: CalendarTrackPoint,
  startTrackX: number,
): CalendarTrackGestureSession {
  return {
    pointerId,
    start: point,
    startTrackX,
    intent: "pending",
    samples: [{ position: point.x, time: point.time }],
  };
}

export function updateCalendarTrackGestureSession(
  session: CalendarTrackGestureSession,
  point: CalendarTrackPoint,
  pageWidth: number,
): CalendarTrackMoveResult {
  if (session.intent === "vertical") {
    return { session, justClaimedHorizontal: false };
  }

  const deltaX = point.x - session.start.x;
  const deltaY = point.y - session.start.y;
  const nextIntent = session.intent === "pending"
    ? resolveCalendarTrackAxisIntent(deltaX, deltaY)
    : session.intent;
  const justClaimedHorizontal = session.intent !== "horizontal" && nextIntent === "horizontal";
  const nextSession: CalendarTrackGestureSession = {
    ...session,
    intent: nextIntent,
    samples: nextIntent === "horizontal"
      ? appendCalendarTrackVelocitySample(session.samples, { position: point.x, time: point.time })
      : session.samples,
  };

  if (nextIntent !== "horizontal") {
    return { session: nextSession, justClaimedHorizontal };
  }

  return {
    session: nextSession,
    trackX: applyCalendarTrackRubberBand(session.startTrackX + deltaX, pageWidth),
    justClaimedHorizontal,
  };
}

export function finishCalendarTrackGestureSession(
  session: CalendarTrackGestureSession,
  point: CalendarTrackPoint,
  currentTrackX: number,
  pageWidth: number,
): { pageOffset: -1 | 0 | 1; velocity: number; wasHorizontal: boolean } {
  if (session.intent !== "horizontal") {
    return {
      pageOffset: resolveCalendarTrackSnap(currentTrackX, 0, pageWidth),
      velocity: 0,
      wasHorizontal: false,
    };
  }

  const samples = appendCalendarTrackVelocitySample(
    session.samples,
    { position: point.x, time: point.time },
  );
  const velocity = getCalendarTrackVelocity(samples);
  return {
    pageOffset: resolveCalendarTrackSnap(currentTrackX, velocity, pageWidth),
    velocity,
    wasHorizontal: true,
  };
}
