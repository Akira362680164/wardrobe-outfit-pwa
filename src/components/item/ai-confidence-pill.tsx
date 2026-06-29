"use client";

import type { ReactNode } from "react";
import type { AnyIntakeDraft, IntakeField, IntakeFieldConfidence } from "@/lib/intake-draft";

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

// ---------------------------------------------------------------------------
// 第一期 aggregate confidence 派生助手
// v1.1.23 六页设计 §3.1: 整件级 confidenceScore 0-100。
// 沿用 v1 识别流，不修改 prompt / 不修改 schema。派生自 IntakeField 列表：
//   - high / 用户主动输入 / "default" 占位 -> 100 分
//   - medium                                ->  65 分
//   - low / unknown                         ->  30 / 50 分
// 加权后做轻微修正：出现 low 扣 5；任一字段 needsReview 扣 5。
// 返回 null 时胶囊不渲染（无字段 / 未走 AI）。
// ---------------------------------------------------------------------------

const FIELD_BASE_SCORE: Record<IntakeFieldConfidence, number> = {
  high: 100,
  medium: 65,
  low: 30,
  unknown: 50,
};

function isIntakeFieldLike(value: unknown): value is IntakeField<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return "source" in candidate && "confidence" in candidate && "value" in candidate;
}

export function calculateDraftConfidenceScore(draft: AnyIntakeDraft | null | undefined): number | null {
  if (!draft || typeof draft !== "object") return null;
  // 优先使用 AI 整件级置信度 (0-1)，缺失时降级到字段平均。
  const topLevel = (draft as { aiConfidence?: unknown }).aiConfidence;
  if (typeof topLevel === "number" && Number.isFinite(topLevel)) {
    return Math.round(topLevel * 100);
  }
  const fields: IntakeField<unknown>[] = [];
  for (const value of Object.values(draft)) {
    if (isIntakeFieldLike(value)) fields.push(value);
  }
  if (fields.length === 0) return null;

  let total = 0;
  let lowCount = 0;
  let needsReviewCount = 0;
  for (const field of fields) {
    if (field.source === "user" || field.source === "default") {
      total += 100;
    } else {
      total += FIELD_BASE_SCORE[field.confidence] ?? 50;
    }
    if (field.confidence === "low") lowCount += 1;
    if (field.needsReview) needsReviewCount += 1;
  }
  let score = total / fields.length;
  if (lowCount > 0) score -= 5;
  if (needsReviewCount > 0) score -= 5;
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Math.round(score);
}
