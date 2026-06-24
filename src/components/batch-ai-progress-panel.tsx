"use client";

import { AlertTriangle, Check, Circle, Loader2, Pencil, RotateCcw } from "lucide-react";
import type { BatchAiItemStatus, BatchIntakeItem } from "@/lib/intake-draft";
import { summarizeBatchIntakeItems } from "@/lib/intake-draft";

export interface BatchAiProgressPanelProps {
  title: string;
  items: BatchIntakeItem[];
  emptyText?: string;
  onRetry?: (item: BatchIntakeItem) => void;
  onManualReview?: (item: BatchIntakeItem) => void;
  onOpenItem?: (item: BatchIntakeItem) => void;
}

const statusMeta: Record<BatchAiItemStatus, { label: string; tone: string }> = {
  pending: { label: "等待中", tone: "text-ink/35" },
  local_ready: { label: "本地草稿已生成", tone: "text-denim" },
  ai_queued: { label: "等待 AI", tone: "text-ink/45" },
  ai_running: { label: "正在识别", tone: "text-denim" },
  ai_done: { label: "AI 已完成", tone: "text-moss" },
  needs_review: { label: "需确认", tone: "text-clay" },
  failed: { label: "识别失败", tone: "text-red-500" },
  skipped: { label: "已跳过", tone: "text-ink/35" },
  confirmed: { label: "已确认", tone: "text-moss" },
};

export function BatchAiProgressPanel({
  title,
  items,
  emptyText = "暂无批量任务",
  onRetry,
  onManualReview,
  onOpenItem,
}: BatchAiProgressPanelProps) {
  const summary = summarizeBatchIntakeItems(items);
  if (items.length === 0) {
    return <div className="rounded-lg border border-dashed border-ink/12 bg-white/70 p-4 text-center text-xs text-ink/45">{emptyText}</div>;
  }

  return (
    <section className="rounded-lg border border-ink/8 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-ink/50">
            {summary.completed} / {summary.total} 已完成 · {summary.needsReview} 张需确认
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-denim/8 px-2 py-1 text-xs font-semibold text-denim">
          {summary.progressPercent}%
        </span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
        <div className="h-full rounded-full bg-denim transition-[width]" style={{ width: `${summary.progressPercent}%` }} />
      </div>

      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <BatchProgressRow
            key={item.id}
            item={item}
            onRetry={onRetry}
            onManualReview={onManualReview}
            onOpenItem={onOpenItem}
          />
        ))}
      </div>

      {summary.failed > 0 ? (
        <p className="mt-3 rounded-md bg-clay/8 px-2.5 py-2 text-[11px] leading-relaxed text-ink/60">
          {summary.failed} 张识别失败，但已保留本地基础草稿；成功项可以继续校对和保存。
        </p>
      ) : null}
    </section>
  );
}

function BatchProgressRow({
  item,
  onRetry,
  onManualReview,
  onOpenItem,
}: {
  item: BatchIntakeItem;
  onRetry?: (item: BatchIntakeItem) => void;
  onManualReview?: (item: BatchIntakeItem) => void;
  onOpenItem?: (item: BatchIntakeItem) => void;
}) {
  const meta = statusMeta[item.status];
  const title = item.draft.kind === "wishlist"
    ? item.draft.name.value
    : item.draft.kind === "outfit"
      ? item.draft.name.value
      : item.draft.name.value;

  return (
    <article className="flex min-w-0 gap-2 rounded-lg border border-ink/8 bg-[#fbfbf8] p-2.5">
      <div className="mt-0.5 shrink-0">{renderStatusIcon(item.status)}</div>
      <button type="button" onClick={() => onOpenItem?.(item)} className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">第 {item.index + 1} 张 · {title}</p>
          <span className={`shrink-0 text-[11px] font-medium ${meta.tone}`}>{meta.label}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-ink/45">
          {item.error ?? statusDescription(item.status)}
        </p>
      </button>
      {item.status === "failed" ? (
        <div className="flex shrink-0 items-center gap-1">
          {onRetry ? (
            <button type="button" onClick={() => onRetry(item)} className="grid h-8 w-8 place-items-center rounded-md bg-white text-denim" aria-label="重试">
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          ) : null}
          {onManualReview ? (
            <button type="button" onClick={() => onManualReview(item)} className="grid h-8 w-8 place-items-center rounded-md bg-white text-ink/60" aria-label="手动校对">
              <Pencil size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function renderStatusIcon(status: BatchAiItemStatus) {
  if (status === "ai_running") return <Loader2 size={15} className="animate-spin text-denim" aria-hidden="true" />;
  if (status === "failed") return <AlertTriangle size={15} className="text-red-500" aria-hidden="true" />;
  if (status === "ai_done" || status === "confirmed") return <Check size={15} className="text-moss" aria-hidden="true" />;
  if (status === "needs_review") return <AlertTriangle size={15} className="text-clay" aria-hidden="true" />;
  return <Circle size={15} className="text-ink/28" aria-hidden="true" />;
}

function statusDescription(status: BatchAiItemStatus): string {
  switch (status) {
    case "pending": return "等待本地处理";
    case "local_ready": return "可先手动校对，也可继续 AI 补全";
    case "ai_queued": return "已进入 AI 队列";
    case "ai_running": return "正在生成语义草稿";
    case "ai_done": return "已识别字段，可继续校对";
    case "needs_review": return "有低置信字段，需要确认";
    case "failed": return "已保留本地基础草稿";
    case "skipped": return "已跳过此项";
    case "confirmed": return "已确认可保存";
  }
}
