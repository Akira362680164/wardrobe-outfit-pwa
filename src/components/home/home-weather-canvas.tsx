"use client";

import { useEffect, useRef, useState } from "react";
import type { QWeatherVisualDefinition } from "@wardrobe/domain-catalog";

import { canvasEligibility, createWeatherScene, renderWeatherScene, type WeatherSafeRect } from "@/lib/home/weather-canvas-engine";
import { createWeatherFrameScheduler, WEATHER_CANVAS_MAX_DPR, WEATHER_CANVAS_TARGET_FPS } from "@/lib/home/weather-canvas-scheduler";

declare global {
  interface Window {
    __wardoraWeatherCanvas?: { status: string; code: string; fps: number; dpr: number; clock: number; eligibility: string };
    __wardoraWeatherCanvasTest?: { preview(kind: "scene" | "lightning" | "hail", clock: number): void };
  }
}

export function HomeWeatherCanvas({ visual, forecast, stale }: { visual: QWeatherVisualDefinition; forecast: boolean; stale: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const eligibility = canvasEligibility({ kind: "today", code: visual.code, forecast, stale });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || eligibility !== "dynamic_today") return;
    const context = canvas.getContext("2d");
    if (!context) { setFailed(true); return; }
    let scene = createWeatherScene(visual.code, "today");
    let width = 0, height = 0, dpr = 1, frames = 0, fpsSince = performance.now(), fps = 0, alive = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updateDiagnostics = (status: string) => {
      window.__wardoraWeatherCanvas = { status, code: scene.code, fps, dpr, clock: Number(scene.clock.toFixed(2)), eligibility };
    };
    const refreshSafeRects = () => {
      const root = canvas.getBoundingClientRect(), card = canvas.parentElement;
      scene.safeRects = card ? Array.from(card.querySelectorAll<HTMLElement>("[data-weather-row]")).map((element): WeatherSafeRect => { const rect = element.getBoundingClientRect(); return { x: rect.left - root.left - 3, y: rect.top - root.top - 2, w: rect.width + 6, h: rect.height + 4 }; }) : [];
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, WEATHER_CANVAS_MAX_DPR);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0); refreshSafeRects();
    };
    const fail = () => { if (!alive) return; setFailed(true); scheduler.destroy(); updateDiagnostics("static_failure"); };
    const draw = (time: number, resumed: boolean) => {
      try {
        if (resumed) scene.lastDraw = time;
        renderWeatherScene(context, scene, width, height, time, true, false);
        frames++;
        if (time - fpsSince >= 1000) { fps = Math.round(frames * 1000 / (time - fpsSince)); frames = 0; fpsSince = time; }
        updateDiagnostics("running");
      } catch { fail(); }
    };
    const scheduler = createWeatherFrameScheduler(draw);
    const drawStill = (reset = false) => { try { if (reset) scene = createWeatherScene(visual.code, "today"); resize(); renderWeatherScene(context, scene, width, height, performance.now(), false, true); updateDiagnostics(reduced.matches ? "reduced_static" : "static_ready"); } catch { fail(); } };
    const intersection = new IntersectionObserver(([entry]) => { const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > .04); scheduler.setVisible(visible); updateDiagnostics(visible ? (reduced.matches ? "reduced_static" : "running") : "offscreen_paused"); }, { threshold: [0, .05, .5] });
    const resizeObserver = new ResizeObserver(() => drawStill());
    const onVisibility = () => { scheduler.setForeground(!document.hidden); updateDiagnostics(document.hidden ? "background_paused" : "running"); };
    const onReduced = () => { scheduler.setReducedMotion(reduced.matches); if (reduced.matches) { frames = 0; fps = 0; fpsSince = performance.now(); } drawStill(reduced.matches); };
    let removeAppState: (() => Promise<void>) | undefined;

    drawStill(); scheduler.setReducedMotion(reduced.matches); scheduler.setForeground(!document.hidden); intersection.observe(canvas); resizeObserver.observe(canvas);
    if (process.env.NODE_ENV !== "production") window.__wardoraWeatherCanvasTest = { preview: (kind, clock) => { scheduler.setReducedMotion(true); scene = createWeatherScene(visual.code, "today"); scene.clock = Math.max(0, clock); scene.event.lightningStart = kind === "lightning" ? 0 : -99; scene.event.hailStart = kind === "hail" ? 0 : -99; resize(); renderWeatherScene(context, scene, width, height, performance.now(), false, false); updateDiagnostics(`preview_${kind}`); } };
    document.addEventListener("visibilitychange", onVisibility); reduced.addEventListener("change", onReduced);
    void import("@capacitor/app").then(({ App }) => App.addListener("appStateChange", ({ isActive }) => { scheduler.setForeground(isActive && !document.hidden); updateDiagnostics(isActive ? "running" : "app_paused"); })).then((handle) => { removeAppState = () => handle.remove(); }).catch(() => undefined);

    return () => {
      alive = false; scheduler.destroy(); intersection.disconnect(); resizeObserver.disconnect(); document.removeEventListener("visibilitychange", onVisibility); reduced.removeEventListener("change", onReduced); void removeAppState?.();
      if (window.__wardoraWeatherCanvas?.code === scene.code) window.__wardoraWeatherCanvas = { ...window.__wardoraWeatherCanvas, status: "unmounted", fps: 0 };
      delete window.__wardoraWeatherCanvasTest;
    };
  }, [eligibility, visual.code]);

  if (eligibility !== "dynamic_today" || failed) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true" data-weather-canvas="today" data-target-fps={WEATHER_CANVAS_TARGET_FPS} />;
}
