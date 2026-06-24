"use client";

/**
 * v1.1.23 six-page design §2.6: 详情页 ItemRow 统一组件。
 *
 * - 用于 P3 (衣橱详情) / P5 (种草详情) 的 label/value 单行。
 * - 布局: grid-cols-[76px_1fr] sm:grid-cols-[96px_1fr], 与 detail-shell.DetailInfoRow
 *   完全一致；空值显示灰字"未填写"，不带 AI 标签。
 * - 业务独有字段 (衣橱位置/购买日期/状态) 由 wardrobe-extras 提供；不重复实现。
 */

import type { ReactNode } from "react";

export interface ItemRowProps {
  label: string;
  value?: ReactNode;
  /** 当 value 为空时显示的占位灰字，默认 "未填写"。 */
  placeholder?: string;
  className?: string;
  /** 强制渲染 value（用于把布尔标记类标志区分开）。默认 false: 空时显示 placeholder。 */
  forceShowValue?: boolean;
}

export function ItemRow({ label, value, placeholder = "未填写", className, forceShowValue = false }: ItemRowProps) {
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  const showValue = forceShowValue || !empty;
  return (
    <div className={["grid grid-cols-[76px_1fr] gap-3 text-sm sm:grid-cols-[96px_1fr]", className ?? ""].filter(Boolean).join(" ")}>
      <span className="text-xs font-medium text-ink/35">{label}</span>
      <span className={["min-w-0 break-words", showValue ? "text-ink/70" : "text-ink/35"].join(" ")}>
        {showValue ? value : placeholder}
      </span>
    </div>
  );
}
