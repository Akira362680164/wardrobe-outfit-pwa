"use client";

/**
 * v1.1.23 six-page design §4.8: FormalityWarmthStepper 1-5 数字加减器。
 *
 * - 用于 P1/P2/P4/P6 穿着属性的正式度 / 保暖度编辑。
 * - 1-5 闭区间；点 +/– 步进 1，禁用越界按钮。
 * - view 模式: 详情页 P3/P5 用 ItemRow 展示 "2/5"，无值时显示"未识别"灰字。
 */

import { Minus, Plus } from "lucide-react";

export interface FormalityWarmthStepperProps {
  label: string;
  value: number | undefined;
  onChange: (next: number) => void;
  /** 编辑页字段级"待确认"开关。 */
  review?: boolean;
  /** 编辑模式下禁用 (例如正在保存)。 */
  disabled?: boolean;
}

export function FormalityWarmthStepper({ label, value, onChange, review, disabled = false }: FormalityWarmthStepperProps) {
  const v = typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(5, value)) : 0;
  const dec = () => {
    if (disabled) return;
    if (v > 1) onChange(v - 1);
  };
  const inc = () => {
    if (disabled) return;
    if (v < 5) onChange(v + 1);
  };
  return (
    <div className="grid gap-1 text-sm font-medium">
      <span className="flex items-center gap-2">
        <span>{label}</span>
        {review ? (
          <span
            data-review-pill="true"
            className="inline-flex shrink-0 items-center rounded-full bg-clay/10 px-2 py-0.5 text-[10px] font-semibold text-clay"
          >
            待确认
          </span>
        ) : null}
      </span>
      <div className="inline-flex h-11 items-center gap-3 rounded-lg border border-ink/10 bg-white px-3">
        <button
          type="button"
          onClick={dec}
          disabled={disabled || v <= 1}
          aria-label={`${label} 减一`}
          className="grid h-7 w-7 place-items-center rounded-md text-ink/60 hover:bg-mist disabled:opacity-30"
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <span className="min-w-[44px] text-center text-base font-semibold text-ink">
          {v > 0 ? `${v}/5` : "—"}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={disabled || v >= 5}
          aria-label={`${label} 加一`}
          className="grid h-7 w-7 place-items-center rounded-md text-ink/60 hover:bg-mist disabled:opacity-30"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
