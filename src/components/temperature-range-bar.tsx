"use client";

/**
 * v1.1.22 Step 2 (P0-5) — TemperatureRangeBar
 *
 * 只读展示适穿温度区间。0-40℃ 蓝→红渐变轨道 + 两个圆点标记 +
 * 高亮实色填充 + 上方文字标签。空值（minC 和 maxC 都为 null/undefined）
 * 渲染「未识别」占位。
 *
 * 设计要点：
 * - 蓝→红渐变模拟冷→热，对应 0℃→40℃
 * - 单边界（只设 minC 或只设 maxC）：只显示圆点，不画填充（避免误导）
 * - 双边界都设：填充区间用同色渐变实色（alpha 1.0），背景渐变降低透明度
 * - 圆点 size="md" 20px / size="sm" 16px，可被父级 flex 撑开
 * - 不发任何网络/AI 请求，纯本地 UI 组件
 */

import type { TemperatureRange } from "@/lib/types";
import { TEMPERATURE_MIN_C as TEMP_MIN, TEMPERATURE_MAX_C as TEMP_MAX } from "@/lib/temperature-range";


/** 0-40℃ 冷蓝→热红渐变。 */
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

interface Props {
  value: TemperatureRange | null | undefined;
  className?: string;
  /** 是否在上方显示「18℃ ~ 30℃」文字标签。默认 true。 */
  showLabel?: boolean;
  /** sm 用于紧凑列表/详情；md 用于表单/编辑态。默认 md。 */
  size?: "sm" | "md";
  /** 文字大小。默认 size 对应。 */
  labelClassName?: string;
}

const TRACK_H_SM = 8;
const TRACK_H_MD = 12;
const HANDLE_SM = 16;
const HANDLE_MD = 20;

export function TemperatureRangeBar({
  value,
  className,
  showLabel = true,
  size = "md",
  labelClassName,
}: Props) {
  const hasMin = value?.minC != null;
  const hasMax = value?.maxC != null;
  const empty = !value || (!hasMin && !hasMax);

  if (empty) {
    return (
      <span className={["text-ink/40 text-sm", labelClassName].filter(Boolean).join(" ")}>
        未识别
      </span>
    );
  }

  const minC = value!.minC ?? TEMP_MIN;
  const maxC = value!.maxC ?? TEMP_MAX;
  const trackH = size === "sm" ? TRACK_H_SM : TRACK_H_MD;
  const handleSize = size === "sm" ? HANDLE_SM : HANDLE_MD;
  const bothSet = hasMin && hasMax;
  const fillLeft = hasMin ? toPct(minC) : 0;
  const fillWidth = bothSet ? Math.max(0, toPct(maxC) - fillLeft) : 0;

  const ariaLabel = hasMin && hasMax
    ? `适穿温度 ${minC}℃ 到 ${maxC}℃`
    : hasMin
      ? `适穿温度最低 ${minC}℃`
      : `适穿温度最高 ${maxC}℃`;

  return (
    <div className={["flex w-full min-w-0 flex-col gap-1", className].filter(Boolean).join(" ")}>
      {showLabel && (
        <div
          className={[
            "flex items-center justify-between text-ink/70",
            size === "sm" ? "text-[11px]" : "text-xs",
            labelClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="font-medium tabular-nums">
            {hasMin ? `${minC}℃` : <span className="text-ink/30">不限</span>}
          </span>
          <span className="font-medium tabular-nums">
            {hasMax ? `${maxC}℃` : <span className="text-ink/30">不限</span>}
          </span>
        </div>
      )}
      <div
        className="relative w-full"
        style={{ height: trackH }}
        role="img"
        aria-label={ariaLabel}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: TEMP_GRADIENT, opacity: 0.35 }}
          aria-hidden
        />
        {bothSet && (
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
              background: TEMP_GRADIENT,
            }}
            aria-hidden
          />
        )}
        {hasMin && (
          <div
            className="absolute top-1/2 rounded-full border-2 border-white bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
            style={{
              left: `${toPct(minC)}%`,
              width: handleSize,
              height: handleSize,
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden
          />
        )}
        {hasMax && (
          <div
            className="absolute top-1/2 rounded-full border-2 border-white bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
            style={{
              left: `${toPct(maxC)}%`,
              width: handleSize,
              height: handleSize,
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
