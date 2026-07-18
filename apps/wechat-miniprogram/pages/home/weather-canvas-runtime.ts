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

type WeatherCanvasCopy = { label: string; temperature: string; high: string; summary: string; meta: string; stale: boolean };

export async function createMiniWeatherCanvasRuntime(input: {
  page: object;
  code: string;
  stale: boolean;
  forecast: boolean;
  reducedMotion: boolean;
  copy: WeatherCanvasCopy;
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
  const fontSizeSetting = Number((wx as any).getAppBaseInfo?.().fontSizeSetting ?? 16);
  const fontScale = Math.min(1.18, Math.max(1, fontSizeSetting / 16));
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
      renderWeatherScene(context, scene, width, height, time, animate, !dynamic);
      drawWeatherCopy(context, width, height, input.copy, fontScale);
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
    destroy() { destroyed = true; pause(); },
    get metrics() { return { dpr, frames, targetFps: WEATHER_CANVAS_TARGET_FPS }; },
  };
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

function drawWeatherCopy(context: CanvasRenderingContext2D, width: number, height: number, copy: WeatherCanvasCopy, scale: number): void {
  const x = 9;
  const maxWidth = Math.max(1, width - 18);
  context.save();
  context.textBaseline = "top";
  context.fillStyle = "rgba(29,34,40,.62)";
  context.font = `700 ${Math.round(12 * scale)}px sans-serif`;
  context.fillText(copy.label, x, 7, maxWidth);
  if (copy.stale) {
    context.textAlign = "right";
    context.font = `650 ${Math.round(9 * scale)}px sans-serif`;
    context.fillStyle = "#805428";
    context.fillText("较早天气", width - x, 8, maxWidth * .55);
    context.textAlign = "left";
  } else if (copy.high) {
    context.textAlign = "right";
    context.font = `650 ${Math.round(10 * scale)}px sans-serif`;
    context.fillStyle = "rgba(29,34,40,.58)";
    context.fillText(copy.high, width - x, 8, maxWidth * .55);
    context.textAlign = "left";
  }
  context.fillStyle = "#1d2228";
  context.font = `800 ${Math.round(24 * scale)}px sans-serif`;
  context.fillText(copy.temperature, x, 27, maxWidth);
  context.font = `700 ${Math.round(12 * scale)}px sans-serif`;
  context.fillText(copy.summary, x, 60, maxWidth);
  context.fillStyle = "rgba(29,34,40,.58)";
  context.font = `500 ${Math.round(11 * scale)}px sans-serif`;
  context.fillText(copy.meta, x, Math.max(86, height - Math.round(18 * scale)), maxWidth);
  context.restore();
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
