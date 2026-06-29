"use client";

import type { ReactNode } from "react";

/**
 * v1.1.23 six-page design §3.2: 字段级 "待确认" 胶囊。
 *
 * - 仅用于 P1/P2 (Step 3 录入确认页) 与 P4/P6 (编辑页) 字段右上角。
 * - 触发条件 (4 条规则，禁止乱打):
 *   1. 低置信: 字段 confidence === "low" 或 needsReview === true 且 reason 非空
 *   2. 识别失败: AI 未能产出该字段
 *   3. 必填缺失: 该字段对当前 flowKind 属于必填但为空
 *   4. 归一化失败: 字段归一化报错
 * - 详情页 (P3/P5) 严禁使用 — 用 item/needs-touchup-note 替代。
 * - 文案固定 "待确认"。
 */

export interface ReviewPillProps {
  /** true 时显示胶囊；false / undefined 时不渲染。 */
  show?: boolean;
  className?: string;
  testId?: string;
  "aria-label"?: string;
}

export function ReviewPill({ show, className, testId, "aria-label": ariaLabel }: ReviewPillProps): ReactNode {
  if (!show) return null;
  return (
    <span
      data-review-pill="true"
      data-testid={testId ?? "review-pill"}
      aria-label={ariaLabel}
      className={[
        "inline-flex shrink-0 items-center rounded-full bg-clay/10 px-2 py-0.5 text-[10px] font-semibold text-clay",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      待确认
    </span>
  );
}
