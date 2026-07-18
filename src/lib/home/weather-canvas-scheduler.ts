const FRAME_INTERVAL_MS = 1000 / 29;

export interface WeatherFrameScheduler {
  setVisible(value: boolean): void;
  setForeground(value: boolean): void;
  setReducedMotion(value: boolean): void;
  advanceForTest(time: number): void;
  destroy(): void;
}

export function createWeatherFrameScheduler(draw: (time: number) => void): WeatherFrameScheduler {
  let visible = false;
  let foreground = true;
  let reducedMotion = false;
  let destroyed = false;
  let raf = 0;
  let lastTime: number | null = null;
  let budget = 0;
  let started = false;
  let resumePending = false;

  const runnable = () => !destroyed && visible && foreground && !reducedMotion;
  const cancel = () => {
    if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    raf = 0;
    lastTime = null;
    budget = 0;
  };
  const step = (time: number) => {
    if (!runnable()) return;
    if (lastTime === null) {
      lastTime = time;
      if (started && resumePending) budget = FRAME_INTERVAL_MS;
      resumePending = false;
    } else {
      budget += Math.min(100, Math.max(0, time - lastTime));
      lastTime = time;
    }
    if (budget >= FRAME_INTERVAL_MS) {
      budget -= FRAME_INTERVAL_MS;
      started = true;
      draw(time);
    }
  };
  const tick = (time: number) => {
    raf = 0;
    step(time);
    schedule();
  };
  const schedule = () => {
    if (!runnable() || raf || typeof requestAnimationFrame !== "function") return;
    raf = requestAnimationFrame(tick);
  };
  const setGate = (key: "visible" | "foreground" | "reduced", value: boolean) => {
    const wasRunning = runnable();
    if (key === "visible") visible = value;
    else if (key === "foreground") foreground = value;
    else reducedMotion = value;
    const nowRunning = runnable();
    if (!nowRunning) cancel();
    else {
      resumePending = wasRunning === false && started;
      schedule();
    }
  };

  return {
    setVisible: (value) => setGate("visible", value),
    setForeground: (value) => setGate("foreground", value),
    setReducedMotion: (value) => setGate("reduced", value),
    advanceForTest: step,
    destroy: () => { destroyed = true; cancel(); },
  };
}

export const WEATHER_CANVAS_TARGET_FPS = 29;
export const WEATHER_CANVAS_MAX_DPR = 2;
