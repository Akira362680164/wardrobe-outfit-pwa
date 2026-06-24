"use client";

/**
 * v1.1.23 six-page design §2.5: WishlistExtras 业务独有字段。
 *
 * - Step 3 / 编辑页 (P6): 状态 (3 态 select)，一行；不展示评估信息。
 * - 详情页 (P5): 状态行 + 评估信息 (DetailAiCard 摘要) — 评估只在 P5 显示，
 *   不在编辑页/Step 3 出现，与设计稿 §5.5 一致。
 * - 不展示 AI 置信度胶囊；不展示 review-pill (详情页禁止)。
 */

import type { ReactNode } from "react";
import type { WishlistStatus, WishlistAssessment } from "@/lib/types";
import { ItemRow } from "@/components/item/row";
import { ItemField } from "@/components/item/field";

const WISHLIST_STATUS_LABELS: Record<WishlistStatus, string> = {
  interested: "感兴趣",
  rejected: "不感兴趣",
  archived: "归档",
};

const WISHLIST_STATUS_OPTIONS: WishlistStatus[] = ["interested", "rejected", "archived"];

export interface WishlistExtrasViewProps {
  mode: "view";
  status: WishlistStatus;
  /** 评估信息 (P5 详情页独有)。无值时 DetailAiCard 由调用方处理 empty 文案。 */
  assessment?: WishlistAssessment | null;
  /** 评估规则摘要（无 Key 时显示的本地兜底）。 */
  ruleSummary?: { summary: string; matchCount: number; similarCount: number };
  /** AI 评估是否加载中。 */
  assessing?: boolean;
  /** 是否有 MiniMax Key；用于 sourceLabel 文案选择。 */
  hasMiniMaxKey?: boolean;
  /** 操作按钮（生成/刷新评估）。 */
  assessmentAction?: ReactNode;
}

export interface WishlistExtrasEditProps {
  mode: "edit";
  status: WishlistStatus;
  onPatch: (patch: { status: WishlistStatus }) => void;
  statusReview?: boolean;
}

export type WishlistExtrasProps = WishlistExtrasViewProps | WishlistExtrasEditProps;

export function WishlistExtras(props: WishlistExtrasProps) {
  if (props.mode === "view") {
    return (
      <>
        <ItemRow label="状态" value={WISHLIST_STATUS_LABELS[props.status] ?? "未知"} />
      </>
    );
  }

  const { status, onPatch, statusReview } = props;
  return (
    <ItemField label="状态" review={statusReview}>
      <select
        value={status}
        onChange={(e) => onPatch({ status: e.target.value as WishlistStatus })}
        className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
      >
        {WISHLIST_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {WISHLIST_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </ItemField>
  );
}
