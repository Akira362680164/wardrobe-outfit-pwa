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

import { useCallback, useEffect, useRef, useState } from "react";

import type { TemperatureRange } from "@/lib/types";
import { TEMPERATURE_RANGE_MAX_C as TEMP_MAX, TEMPERATURE_RANGE_MIN_C as TEMP_MIN, TEMPERATURE_RANGE_STEP_C as DEFAULT_STEP } from "@/lib/temperature-range";

const HANDLE_VISUAL = 20; // 视觉圆点
const HANDLE_HIT = 44; // 触摸/鼠标命中区（≥44px per AGENTS.md）
const TRACK_HEIGHT = 12;

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
  const dragStateRef = useRef<{ handle: Handle; pointerId: number } | null>(null);
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null);

  const minC = value?.minC;
  const maxC = value?.maxC;
  const hasMin = minC != null;
  const hasMax = maxC != null;
  const empty = !value || (!hasMin && !hasMax);

  // ── 公共：从 pointer event 提取百分比并约束 ───────────────────
  const percentFromEvent = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return clamp(pct, 0, 100);
  }, []);

  const updateFromDrag = useCallback(
    (handle: Handle, clientX: number) => {
      const pct = percentFromEvent(clientX);
      const c = clamp(pctToC(pct, step), TEMP_MIN, TEMP_MAX);
      if (handle === "min") {
        const upperBound = hasMax && maxC != null ? maxC : TEMP_MAX;
        const newMin = Math.min(c, upperBound);
        onChange({ minC: newMin, maxC });
      } else {
        const lowerBound = hasMin && minC != null ? minC : TEMP_MIN;
        const newMax = Math.max(c, lowerBound);
        onChange({ minC, maxC: newMax });
      }
    },
    [hasMax, maxC, hasMin, minC, onChange, percentFromEvent, step],
  );

  // ── Pointer 拖动：document-level 监听以支持拖出 handle 边界 ──────
  useEffect(() => {
    if (activeHandle == null) return;

    const handleMove = (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      e.preventDefault();
      updateFromDrag(state.handle, e.clientX);
    };
    const handleUp = (e: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      dragStateRef.current = null;
      setActiveHandle(null);
      // release capture
      try {
        (e.target as Element | null)?.releasePointerCapture?.(state.pointerId);
      } catch {
        // ignore
      }
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
    };
  }, [activeHandle, updateFromDrag]);

  // ── Handle pointer down：捕获指针 + 启动拖动 ───────────────────
  const onHandlePointerDown = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      // 鼠标左键 / 触摸 / 笔 才允许拖动
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = { handle, pointerId: e.pointerId };
      setActiveHandle(handle);
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      // 初次点击立即把 handle 移到 pointer 位置
      updateFromDrag(handle, e.clientX);
    },
    [updateFromDrag],
  );

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
      if (handle === "min") {
        const current = minC ?? TEMP_MIN;
        const upper = hasMax && maxC != null ? maxC : TEMP_MAX;
        const next = clamp(current + delta, TEMP_MIN, upper);
        onChange({ minC: next, maxC });
      } else {
        const current = maxC ?? TEMP_MAX;
        const lower = hasMin && minC != null ? minC : TEMP_MIN;
        const next = clamp(current + delta, lower, TEMP_MAX);
        onChange({ minC, maxC: next });
      }
    },
    [hasMax, maxC, hasMin, minC, onChange, step],
  );

  // ── 清空 ─────────────────────────────────────────────────────
  const onClear = () => {
    onChange({});
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
                onClick={onClear}
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
        className="relative w-full select-none touch-none"
        style={{ height: HANDLE_HIT, paddingTop: (HANDLE_HIT - TRACK_HEIGHT) / 2 }}
        // 关键：阻止轨道点击改变数值（AGENTS.md 移动端硬规则）
        onClick={(e) => e.preventDefault()}
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
            onPointerDown={onHandlePointerDown("min")}
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
            onPointerDown={onHandlePointerDown("max")}
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
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="absolute rounded-full border-0 bg-transparent p-0 cursor-grab active:cursor-grabbing"
      style={{
        left: `${pct}%`,
        top: (containerHeight - hitSize) / 2,
        width: hitSize,
        height: hitSize,
        transform: "translateX(-50%)",
        touchAction: "none",
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
