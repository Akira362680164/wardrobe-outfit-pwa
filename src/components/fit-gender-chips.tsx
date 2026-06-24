"use client";

/**
 * v1.1.22 Step 5+6 (P0-1 + P0-2) — FitGenderChips（独立组件）
 *
 * 业务定义：让用户给一件衣物打「版型倾向」标签 — 男装 / 女装 / 中性 / 未识别。
 * 数据流向：AI 识别 device-minimax.ts 输出 + 用户手动改 → 持久化到 BaseItem.fitGender → recommendations.ts fitGenderScore 影响推荐打分。
 *
 * 设计要点（AGENTS.md 移动端硬规则 + §8.6 / §4.3 业务需求）：
 * - 4 选 1 chip 横排 flex-wrap（窄屏自动换行）
 * - min-h-[34px] 圆点按钮（>44px 不强制，因为是 chip 不是触摸目标）
 * - 选中态 bg-denim text-white，未选中 bg-[#fbfbf8] text-ink/58
 * - 可选 sourceLabel（AI 识别 vs 用户改徽章）
 * - 不发任何网络/AI 请求，纯本地 UI 组件
 *
 * 用法：
 *   <FitGenderChips value={draft.fitGender} onChange={(v) => updateFitGender(v)} />
 *   <FitGenderChips value={draft.fitGender} sourceLabel="AI 识别" onChange={...} />
 */

import { FIT_GENDER_LABELS } from "@/lib/display-labels";
import type { GarmentFitGender } from "@/lib/types";

export const FIT_GENDER_OPTIONS: ReadonlyArray<GarmentFitGender> = [
  "menswear",
  "womenswear",
  "unisex",
  "unknown",
];

interface Props {
  value: GarmentFitGender | null | undefined;
  onChange: (next: GarmentFitGender) => void;
  /** 来源徽章（AI 识别 / 用户改 / etc.）。可选。 */
  sourceLabel?: string;
  /** 标签文字，默认「适穿版型」。 */
  label?: string;
  className?: string;
  /** 用于 aria / test 钩子。 */
  id?: string;
}

export function FitGenderChips({
  value,
  onChange,
  sourceLabel,
  label = "适穿版型",
  className,
  id,
}: Props) {
  const current: GarmentFitGender = value ?? "unknown";
  return (
    <div className={["grid min-w-0 gap-1.5", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        {sourceLabel ? (
          <span className="text-[10px] text-ink/40">{sourceLabel}</span>
        ) : null}
      </div>
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-2"
      >
        {FIT_GENDER_OPTIONS.map((option) => {
          const active = option === current;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option)}
              className={[
                "min-h-[34px] rounded-full px-3 text-xs font-semibold transition",
                active
                  ? "bg-denim text-white"
                  : "border border-ink/10 bg-[#fbfbf8] text-ink/58 hover:border-ink/22",
              ].join(" ")}
            >
              {FIT_GENDER_LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
