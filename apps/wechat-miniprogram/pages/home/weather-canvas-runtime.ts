import {
  WEATHER_CANVAS_MAX_DPR,
  WEATHER_CANVAS_TARGET_FPS,
  canvasEligibility,
  createWeatherScene,
  renderWeatherScene,
  type WeatherScene,
} from "../../generated/wardora-weather-canvas";

type MiniCanvasNode = {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D;
  requestAnimationFrame(callback: (time: number) => void): number;
  cancelAnimationFrame(id: number): void;
};

export interface MiniWeatherCanvasRuntime {
  setForeground(value: boolean): void;
  setVisible(value: boolean): void;
  destroy(): void;
  readonly metrics: { dpr: number; frames: number; targetFps: number };
}

export async function createMiniWeatherCanvasRuntime(input: {
  page: object;
  code: string;
  stale: boolean;
  forecast: boolean;
  reducedMotion: boolean;
  onFailure: (error?: unknown) => void;
}): Promise<MiniWeatherCanvasRuntime> {
  const eligibility = canvasEligibility({ kind: "today", code: input.code, forecast: input.forecast, stale: input.stale });
  const measured = await measureCanvas(input.page);
  const canvas = measured.node;
  const width = Math.max(1, measured.width);
  const height = Math.max(1, measured.height);
  const dpr = Math.min(WEATHER_CANVAS_MAX_DPR, Math.max(1, Number((wx as any).getWindowInfo?.().pixelRatio ?? (wx as any).getSystemInfoSync?.().pixelRatio ?? 1)));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext("2d");
  context.scale(dpr, dpr);
  clipRoundedCard(context, width, height, 13);
  const scene = createWeatherScene(input.code, "today");
  scene.safeRects = safeRects(width, height);

  let foreground = true;
  let visible = true;
  let destroyed = false;
  let raf = 0;
  let lastTime: number | null = null;
  let budget = 0;
  let frames = 0;
  const dynamic = eligibility === "dynamic_today" && !input.reducedMotion;
  const interval = 1000 / WEATHER_CANVAS_TARGET_FPS;

  const fail = (error?: unknown) => {
    if (destroyed) return;
    destroyed = true;
    if (raf) canvas.cancelAnimationFrame(raf);
    raf = 0;
    input.onFailure(error);
  };
  const draw = (time: number, animate: boolean) => {
    try {
      renderWeatherScene(context, scene, width, height, time, animate, !dynamic, true);
      clearWeatherCopyLane(context, width, height);
      frames += 1;
    } catch (error) {
      fail(error);
    }
  };
  const runnable = () => dynamic && foreground && visible && !destroyed;
  const schedule = () => {
    if (!runnable() || raf) return;
    raf = canvas.requestAnimationFrame(tick);
  };
  const tick = (time: number) => {
    raf = 0;
    if (!runnable()) return;
    if (lastTime === null) lastTime = time;
    else {
      budget += Math.min(100, Math.max(0, time - lastTime));
      lastTime = time;
      if (budget >= interval) {
        budget -= interval;
        draw(time, true);
      }
    }
    schedule();
  };
  const pause = () => {
    if (raf) canvas.cancelAnimationFrame(raf);
    raf = 0;
    lastTime = null;
    budget = 0;
  };

  draw(0, false);
  schedule();

  return {
    setForeground(value) { foreground = value; if (runnable()) schedule(); else pause(); },
    setVisible(value) { visible = value; if (runnable()) schedule(); else pause(); },
    destroy() {
      destroyed = true;
      pause();
      try { context.clearRect(0, 0, width, height); } catch { /* native layer may already be detached */ }
    },
    get metrics() { return { dpr, frames, targetFps: WEATHER_CANVAS_TARGET_FPS }; },
  };
}

function clearWeatherCopyLane(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.globalCompositeOperation = "destination-out";
  const fade = context.createLinearGradient(0, 0, width, 0);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(.64, "rgba(0,0,0,1)");
  fade.addColorStop(.88, "rgba(0,0,0,0)");
  context.fillStyle = fade;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function clipRoundedCard(context: CanvasRenderingContext2D, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(r, 0);
  context.lineTo(width - r, 0);
  context.quadraticCurveTo(width, 0, width, r);
  context.lineTo(width, height - r);
  context.quadraticCurveTo(width, height, width - r, height);
  context.lineTo(r, height);
  context.quadraticCurveTo(0, height, 0, height - r);
  context.lineTo(0, r);
  context.quadraticCurveTo(0, 0, r, 0);
  context.closePath();
  context.clip();
}

function measureCanvas(page: object): Promise<{ node: MiniCanvasNode; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    (wx as any).createSelectorQuery().in(page).select("#home-weather-canvas").fields({ node: true, size: true }).exec((result: any[]) => {
      const value = result?.[0];
      if (!value?.node || !value.width || !value.height) reject(new Error("canvas_unavailable"));
      else resolve({ node: value.node, width: Number(value.width), height: Number(value.height) });
    });
  });
}

function safeRects(width: number, height: number): WeatherScene["safeRects"] {
  return [
    { x: width * .04, y: height * .04, w: width * .68, h: height * .22 },
    { x: width * .04, y: height * .28, w: width * .62, h: height * .62 },
  ];
}
