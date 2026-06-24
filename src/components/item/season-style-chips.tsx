"use client";

/**
 * v1.1.23 six-page design §4.5: SeasonStyleChips 季节/风格多选 chip。
 *
 * - 季节 (SEASON_LABELS) / 风格 (STYLE_LABELS) 多选 chip。
 * - 选中态: bg-denim text-white；未选: border border-ink/10 bg-white text-ink/60。
 * - 编辑页使用，maxSelected 可选（季节 4，风格 5）。
 * - view 模式: 详情页 P3/P5 用 ItemRow 展示 "春 / 秋" 中文 join，缺失时显示"未识别"。
 */

import { SEASON_LABELS, STYLE_LABELS } from "@/lib/types";
import { ItemRow } from "@/components/item/row";
import { ReviewPill } from "@/components/item/review-pill";

export interface SeasonStyleChipsViewProps {
  mode: "view";
  kind: "season" | "style";
  values: string[];
}

export interface SeasonStyleChipsEditProps {
  mode: "edit";
  kind: "season" | "style";
  values: string[];
  onChange: (next: string[]) => void;
  /** 编辑页字段级"待确认"开关。 */
  review?: boolean;
  /** 多选上限；超出时不再 toggle 进。 */
  maxSelected?: number;
  onLimit?: (message: string) => void;
  disabled?: boolean;
}

export type SeasonStyleChipsProps = SeasonStyleChipsViewProps | SeasonStyleChipsEditProps;

function labelsFor(kind: "season" | "style"): Record<string, string> {
  return kind === "season" ? SEASON_LABELS : (STYLE_LABELS as Record<string, string>);
}

function titleFor(kind: "season" | "style"): string {
  return kind === "season" ? "季节" : "风格";
}

function placeholder(): string {
  return "未识别";
}

export function SeasonStyleChips(props: SeasonStyleChipsProps) {
  if (props.mode === "view") {
    const labels = labelsFor(props.kind);
    const value = props.values
      .map((v) => labels[v] ?? v)
      .filter(Boolean)
      .join(" / ");
    return <ItemRow label={titleFor(props.kind)} value={value || undefined} placeholder={placeholder()} />;
  }

  const { kind, values, onChange, review, maxSelected, onLimit, disabled } = props;
  const labels = labelsFor(kind);
  const options = Object.keys(labels);
  return (
    <div className="grid gap-1 text-sm font-medium">
      <span className="flex items-center gap-2">
        <span>
          {titleFor(kind)}
          {maxSelected ? <span className="ml-1 text-ink/45">（最多 {maxSelected} 个）</span> : null}
        </span>
        {review ? <ReviewPill /> : null}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (active) {
                  onChange(values.filter((v) => v !== opt));
                  return;
                }
                if (maxSelected && values.length >= maxSelected) {
                  onLimit?.(`最多只能选 ${maxSelected} 个${titleFor(kind)}`);
                  return;
                }
                onChange([...values, opt]);
              }}
              className={[
                "h-9 rounded-full px-3 text-xs font-semibold transition-colors",
                active
                  ? "bg-denim text-white"
                  : "border border-ink/10 bg-white text-ink/60 hover:bg-mist",
                disabled ? "opacity-45" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {labels[opt] ?? opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
