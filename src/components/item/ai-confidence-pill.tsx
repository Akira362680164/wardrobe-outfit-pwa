"use client";

import type { ReactNode } from "react";
import type { AnyIntakeDraft } from "@/lib/intake-draft";

/**
 * v1.1.23 six-page design §3.1: 整件级 AI 置信度胶囊。
 *
 * - 仅用于衣橱录入 Step 3 / 种草录入 Step 3 (P1/P2) 的 QualityRow。
 * - 阈值：>=75 绿色，50-74 黄色，<50 红色；与设计稿 §8 一致。
 * - 文案：纯数字 + "AI" 前缀，如 "AI 86"。
 * - 无值处理：score 为 undefined / null / 非有限数 → 不渲染。
 * - 详情页 / 编辑页 (P3/P4/P5/P6) 严禁使用。
 */

export type AiConfidenceTone = "high" | "medium" | "low";

const TONE_CLASS: Record<AiConfidenceTone, string> = {
  high: "bg-moss/10 text-moss",
  medium: "bg-clay/10 text-clay",
  low: "bg-clay/20 text-clay",
};

export function classifyAiConfidence(score: number | null | undefined): AiConfidenceTone | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export interface AiConfidencePillProps {
  /** 整件级置信度 0-100。无值时整个胶囊不渲染。 */
  score?: number | null;
  className?: string;
  /** 仅在测试/调试时显示隐藏的内联数据属性。 */
  testId?: string;
}

export function AiConfidencePill({ score, className, testId }: AiConfidencePillProps): ReactNode {
  const tone = classifyAiConfidence(score);
  if (tone === null) return null;
  const rounded = Math.round(score as number);
  return (
    <span
      data-ai-confidence={tone}
      data-testid={testId ?? "ai-confidence-pill"}
      className={[
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE_CLASS[tone],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`AI 置信度 ${rounded}`}
    >
      AI {rounded}
    </span>
  );
}

export function calculateDraftConfidenceScore(draft: AnyIntakeDraft | null | undefined): number | null {
  if (!draft || typeof draft !== "object") return null;
  const score = (draft as { aiConfidenceScore?: unknown }).aiConfidenceScore;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.round(Math.min(100, Math.max(0, score)));
}
