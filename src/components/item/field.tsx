"use client";

/**
 * v1.1.23 six-page design §2.6: 编辑页 ItemField 统一组件。
 *
 * - 用于 P4 (衣橱编辑) / P6 (种草编辑) 的 label + control 单行。
 * - label 13sp + 必填红星 + 右上 review-pill slot + hint/计数 0/100。
 * - 不引入 AI 置信度胶囊；如需"待确认"由 review-pill slot 接入。
 */

import type { ReactNode } from "react";
import { ReviewPill } from "@/components/item/review-pill";

export interface ItemFieldProps {
  label: string;
  /** 是否必填；true 时 label 后接红星。 */
  required?: boolean;
  /** 字段级"待确认"开关；true 时显示胶囊。 */
  review?: boolean;
  /** 任意子控件（input / select / chip group / slider / textarea）。 */
  children: ReactNode;
  /** 描述/提示行（编辑页字段下方小灰字）。 */
  hint?: ReactNode;
  /** 计数提示，常见为 0/100 (notes)。 */
  counter?: ReactNode;
  className?: string;
}

export function ItemField({ label, required = false, review = false, children, hint, counter, className }: ItemFieldProps) {
  return (
    <div className={["grid gap-1 text-sm font-medium", className ?? ""].filter(Boolean).join(" ")}>
      <span className="flex items-center gap-2">
        <span>
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </span>
        {review ? <ReviewPill /> : null}
      </span>
      {children}
      {hint || counter ? (
        <span className="flex items-center justify-between text-[11px] text-ink/45">
          <span>{hint}</span>
          {counter ? <span>{counter}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
