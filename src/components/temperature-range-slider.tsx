"use client";

/**
 * v1.1.22 Step 2 (P0-5) + Step 6 (P0-2) — TemperatureRangeSlider
 *
 * 双端点可拖动温度滑块（编辑态）。底层视觉与 TemperatureRangeBar 一致
 * （-20-40℃ 蓝→红渐变轨道 + 两个圆点 + 高亮填充 + 上方文字），但 handle 可拖动。
 *
 * 设计要点（AGENTS.md 移动端硬规则 + §8.3 业务需求）：
 * - 滑块 handle 的可点击/可拖动区是 44×44（pointer hit area），视觉圆点 20×20
 * - 点击轨道不改变数值（避免误触）；只有按住 handle 才拖动
 * - 拖动时 handle 不可越过另一个 handle（min ≤ max 自动夹紧）
 * - -20-40℃ 整数步进（1℃ step）
 * - 键盘可访问：handle focusable，←→/Home/End 调整
 * - 不发任何网络/AI 请求，纯本地 UI 组件
 */

import { useCallback, useRef, useState } from "react";

import type { TemperatureRange } from "@/lib/types";
import { TEMPERATURE_RANGE_MAX_C as TEMP_MAX, TEMPERATURE_RANGE_MIN_C as TEMP_MIN, TEMPERATURE_RANGE_STEP_C as DEFAULT_STEP } from "@/lib/temperature-range";

const HANDLE_VISUAL = 20; // 视觉圆点
const HANDLE_HIT = 44; // 触摸/鼠标命中区（≥44px per AGENTS.md）
const TRACK_HEIGHT = 12;
export const SLIDER_INTENT_THRESHOLD_PX = 8;

const TEMP_GRADIENT =
  "linear-gradient(to right, hsl(210, 80%, 55%) 0%, hsl(190, 70%, 55%) 18%, hsl(45, 75%, 55%) 50%, hsl(20, 80%, 55%) 80%, hsl(0, 75%, 55%) 100%)";

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toPct(c: number) {
  return ((clamp(c, TEMP_MIN, TEMP_MAX) - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * 100;
}

function pctToC(pct: number, step: number) {
  const raw = (pct / 100) * (TEMP_MAX - TEMP_MIN) + TEMP_MIN;
  return Math.round(raw / step) * step;
}

export type SliderDragIntent = "pending" | "horizontal" | "vertical";

export function resolveSliderDragIntent(
  dx: number,
  dy: number,
  threshold = SLIDER_INTENT_THRESHOLD_PX,
): SliderDragIntent {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return "pending";
  return Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
}

export function temperatureFromPointer({
  clientX,
  grabOffsetX,
  trackLeft,
  trackWidth,
  step,
}: {
  clientX: number;
  grabOffsetX: number;
  trackLeft: number;
  trackWidth: number;
  step: number;
}): number {
  if (!Number.isFinite(trackWidth) || trackWidth <= 0) return TEMP_MIN;
  const pct = clamp(((clientX - grabOffsetX - trackLeft) / trackWidth) * 100, 0, 100);
  return clamp(pctToC(pct, step), TEMP_MIN, TEMP_MAX);
}

interface Props {
  value: TemperatureRange | null | undefined;
  onChange: (next: TemperatureRange) => void;
  className?: string;
  /** 步进 (℃). 默认 1。 */
  step?: number;
  /** 标签。默认「适穿温度」。 */
  label?: string;
  /** 是否允许清空（用户拖到边界外或点 × 时调用 onChange 传 {}）。默认 false。 */
  clearable?: boolean;
  id?: string;
}

type Handle = "min" | "max";

interface SliderDragState {
  handle: Handle;
  pointerId: number;
  startX: number;
  startY: number;
  grabOffsetX: number;
  intent: SliderDragIntent;
}

export function TemperatureRangeSlider({
  value,
  onChange,
  className,
  step = DEFAULT_STEP,
  label = "适穿温度",
  clearable = false,
  id,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<SliderDragState | null>(null);
  const valueRef = useRef<TemperatureRange>(value ?? {});
  valueRef.current = value ?? {};
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null);

  const minC = value?.minC;
  const maxC = value?.maxC;
  const hasMin = minC != null;
  const hasMax = maxC != null;
  const empty = !value || (!hasMin && !hasMax);

  const emitRange = useCallback((next: TemperatureRange) => {
    const current = valueRef.current;
    if (current.minC === next.minC && current.maxC === next.maxC) return;
    valueRef.current = next;
    onChange(next);
  }, [onChange]);

  const updateFromDrag = useCallback(
    (state: SliderDragState, clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const current = valueRef.current;
      const c = temperatureFromPointer({
        clientX,
        grabOffsetX: state.grabOffsetX,
        trackLeft: rect.left,
        trackWidth: rect.width,
        step,
      });
      if (state.handle === "min") {
        const upperBound = current.maxC ?? TEMP_MAX;
        const newMin = Math.min(c, upperBound);
        emitRange({ minC: newMin, maxC: current.maxC });
      } else {
        const lowerBound = current.minC ?? TEMP_MIN;
        const newMax = Math.max(c, lowerBound);
        emitRange({ minC: current.minC, maxC: newMax });
      }
    },
    [emitRange, step],
  );

  // ── Handle pointer down：捕获指针 + 启动拖动 ───────────────────
  const onHandlePointerDown = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      // 鼠标左键 / 触摸 / 笔 才允许拖动
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!e.isPrimary || dragStateRef.current) return;
      e.stopPropagation();
      const thumbRect = e.currentTarget.getBoundingClientRect();
      dragStateRef.current = {
        handle,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        grabOffsetX: e.clientX - (thumbRect.left + thumbRect.width / 2),
        intent: "pending",
      };
      setActiveHandle(handle);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [],
  );

  const onHandlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    if (state.intent === "pending") {
      state.intent = resolveSliderDragIntent(e.clientX - state.startX, e.clientY - state.startY);
    }
    if (state.intent !== "horizontal") return;
    e.preventDefault();
    updateFromDrag(state, e.clientX);
  }, [updateFromDrag]);

  const onHandlePointerEnd = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    dragStateRef.current = null;
    setActiveHandle(null);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore browsers that release capture before pointerup/pointercancel.
    }
  }, []);

  // ── 键盘可访问性：箭头 / Home / End ─────────────────────────
  const onHandleKeyDown = useCallback(
    (handle: Handle) => (e: React.KeyboardEvent) => {
      const delta = (() => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") return -step;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") return step;
        if (e.key === "Home") return handle === "min" ? -TEMP_MAX : -(TEMP_MAX - (minC ?? 0));
        if (e.key === "End") return handle === "max" ? TEMP_MAX : (maxC ?? TEMP_MAX) - TEMP_MIN;
        return 0;
      })();
      if (delta === 0) return;
      e.preventDefault();
      const currentRange = valueRef.current;
      if (handle === "min") {
        const current = currentRange.minC ?? TEMP_MIN;
        const upper = currentRange.maxC ?? TEMP_MAX;
        const next = clamp(current + delta, TEMP_MIN, upper);
        emitRange({ minC: next, maxC: currentRange.maxC });
      } else {
        const current = currentRange.maxC ?? TEMP_MAX;
        const lower = currentRange.minC ?? TEMP_MIN;
        const next = clamp(current + delta, lower, TEMP_MAX);
        emitRange({ minC: currentRange.minC, maxC: next });
      }
    },
    [emitRange, maxC, minC, step],
  );

  // ── 清空 ─────────────────────────────────────────────────────
  const onClear = () => {
    emitRange({});
  };

  // ── 渲染 ─────────────────────────────────────────────────────
  const showFill = hasMin && hasMax;
  const fillLeft = hasMin ? toPct(minC as number) : 0;
  const fillWidth = showFill ? Math.max(0, toPct(maxC as number) - fillLeft) : 0;

  return (
    <div className={["grid gap-1 text-sm font-medium min-w-0", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-ink/80">{label}</span>
        {empty ? (
          <span className="text-ink/30 text-xs font-normal">未设置</span>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-ink/65 text-xs tabular-nums">
              {hasMin ? `${minC}℃` : "不限"}
              <span className="mx-1 text-ink/30">~</span>
              {hasMax ? `${maxC}℃` : "不限"}
            </span>
            {clearable && (
              <button
                type="button"
                data-parity-id="parity.app.app.src.components.temperature.range.slider.54dbc15fb8" onClick={onClear}
                className="text-ink/40 hover:text-ink/70 text-xs"
                aria-label="清除适穿温度"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>
      <div
        ref={trackRef}
        className="relative w-full select-none touch-pan-y"
        data-slider-intent-lock="8px-pan-y"
        style={{ height: HANDLE_HIT, paddingTop: (HANDLE_HIT - TRACK_HEIGHT) / 2 }}
        // 关键：阻止轨道点击改变数值（AGENTS.md 移动端硬规则）
        data-parity-id="parity.app.app.src.components.temperature.range.slider.431c5a9203" onClick={(e) => e.preventDefault()}
      >
        {/* 轨道渐变 */}
        <div
          className="absolute left-0 right-0 rounded-full"
          style={{
            top: (HANDLE_HIT - TRACK_HEIGHT) / 2,
            height: TRACK_HEIGHT,
            background: TEMP_GRADIENT,
            opacity: 0.35,
          }}
          aria-hidden
        />
        {/* 填充 */}
        {showFill && (
          <div
            className="absolute rounded-full"
            style={{
              top: (HANDLE_HIT - TRACK_HEIGHT) / 2,
              height: TRACK_HEIGHT,
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
              background: TEMP_GRADIENT,
            }}
            aria-hidden
          />
        )}
        {/* min handle */}
        {hasMin && (
          <Handle
            side="min"
            id={id ? `${id}-min` : undefined}
            pct={toPct(minC as number)}
            visualSize={HANDLE_VISUAL}
            hitSize={HANDLE_HIT}
            containerHeight={HANDLE_HIT}
            active={activeHandle === "min"}
            data-parity-id="parity.app.app.src.components.temperature.range.slider.3e0d86554b" onPointerDown={onHandlePointerDown("min")}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
            onKeyDown={onHandleKeyDown("min")}
            label="最低温度"
            value={minC as number}
          />
        )}
        {/* max handle */}
        {hasMax && (
          <Handle
            side="max"
            id={id ? `${id}-max` : undefined}
            pct={toPct(maxC as number)}
            visualSize={HANDLE_VISUAL}
            hitSize={HANDLE_HIT}
            containerHeight={HANDLE_HIT}
            active={activeHandle === "max"}
            data-parity-id="parity.app.app.src.components.temperature.range.slider.09bdc5d708" onPointerDown={onHandlePointerDown("max")}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerEnd}
            onPointerCancel={onHandlePointerEnd}
            onKeyDown={onHandleKeyDown("max")}
            label="最高温度"
            value={maxC as number}
          />
        )}
      </div>
      {/* 隐藏 input 方便 form 提交 + 屏幕阅读器可读 */}
      {hasMin && (
        <input
          type="hidden"
          name={id ? `${id}.minC` : undefined}
          value={minC}
        />
      )}
      {hasMax && (
        <input
          type="hidden"
          name={id ? `${id}.maxC` : undefined}
          value={maxC}
        />
      )}
    </div>
  );
}

interface HandleProps {
  side: Handle;
  id?: string;
  pct: number;
  visualSize: number;
  hitSize: number;
  containerHeight: number;
  active: boolean;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove: React.PointerEventHandler<HTMLButtonElement>;
  onPointerUp: React.PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: React.PointerEventHandler<HTMLButtonElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
  label: string;
  value: number;
}

function Handle({
  side,
  id,
  pct,
  visualSize,
  hitSize,
  containerHeight,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  label,
  value,
}: HandleProps) {
  return (
    <button
      type="button"
      role="slider"
      id={id}
      aria-label={label}
      aria-valuemin={TEMP_MIN}
      aria-valuemax={TEMP_MAX}
      aria-valuenow={value}
      aria-orientation="horizontal"
      data-handle={side}
      data-parity-id="parity.app.app.src.components.temperature.range.slider.004c11cfec" onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      className="absolute rounded-full border-0 bg-transparent p-0 cursor-grab active:cursor-grabbing"
      style={{
        left: `${pct}%`,
        top: (containerHeight - hitSize) / 2,
        width: hitSize,
        height: hitSize,
        transform: "translateX(-50%)",
        touchAction: "pan-y",
      }}
    >
      <span
        className={[
          "block rounded-full border-2 border-white",
          active ? "bg-denim shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
        ].join(" ")}
        style={{
          width: visualSize,
          height: visualSize,
          margin: `${(hitSize - visualSize) / 2}px auto`,
        }}
        aria-hidden
      />
    </button>
  );
}
