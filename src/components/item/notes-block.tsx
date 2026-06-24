"use client";

/**
 * v1.1.23 six-page design §4.6: 备注 NotesBlock 统一组件。
 *
 * - view 模式: P3/P5 详情页，多行文本，最多 6 行省略（用 line-clamp-6）。
 * - edit 模式: P4/P6 编辑页 textarea；可选 hint 与 0/100 计数。
 * - 详情页缺失显示灰字"未填写"，不带 AI 标签。
 */

import type { ReactNode } from "react";

export interface NotesBlockProps {
  value?: string;
  mode: "view" | "edit";
  /** 编辑模式 onChange 回调。 */
  onChange?: (next: string) => void;
  /** 0/100 计数；编辑页常用。 */
  counter?: ReactNode;
  /** 字段级"待确认"开关；编辑页允许。详情页禁止。 */
  review?: boolean;
  /** textarea 行高，编辑页用，默认 4。 */
  rows?: number;
  /** 最大字数，编辑页按具体业务传入；默认 1000。 */
  maxLength?: number;
  placeholder?: string;
  /** 显式设置 id / scroll ref 接入。 */
  textareaId?: string;
  /** 显式 ref 转发 (用于 focus 滚动)。 */
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
  className?: string;
}

export function NotesBlock({
  value,
  mode,
  onChange,
  counter,
  review = false,
  rows = 4,
  maxLength = 1000,
  placeholder = "可填写穿着感受、搭配想法、注意事项等",
  textareaId,
  textareaRef,
  onKeyDown,
  onFocus,
  className,
}: NotesBlockProps) {
  if (mode === "view") {
    const has = value && value.trim().length > 0;
    return (
      <p
        className={[
          "break-words text-sm leading-relaxed",
          has ? "text-ink/65" : "text-ink/35",
          "line-clamp-6",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {has ? value : "未填写"}
      </p>
    );
  }

  return (
    <label className="grid gap-1 text-sm font-medium">
      <span className="flex items-center gap-2">
        <span>备注</span>
        {review ? (
          <span
            data-review-pill="true"
            className="inline-flex shrink-0 items-center rounded-full bg-clay/10 px-2 py-0.5 text-[10px] font-semibold text-clay"
          >
            待确认
          </span>
        ) : null}
      </span>
      <textarea
        id={textareaId}
        ref={textareaRef}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="rounded-lg border border-ink/10 bg-white px-3 py-2 text-base outline-none focus:border-denim"
      />
      {counter ? <span className="text-right text-[11px] text-ink/45">{counter}</span> : null}
    </label>
  );
}
