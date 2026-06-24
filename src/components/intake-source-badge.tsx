"use client";

import type { IntakeField, IntakeFieldSource } from "@/lib/intake-draft";

export type IntakeSourceBadgeLabel = "AI" | "默认" | "已修改" | "待确认";

export function getIntakeSourceLabel(field?: IntakeField<unknown>): IntakeSourceBadgeLabel | undefined {
  if (!field) return undefined;
  if (field.source === "ai") return "AI";
  if (field.source === "user") return "已修改";
  if (field.needsReview || field.source === "local") return "待确认";
  return "默认";
}

export function IntakeSourceBadge({ label }: { label?: IntakeSourceBadgeLabel }) {
  if (!label) return null;
  const className =
    label === "AI"
      ? "bg-denim/10 text-denim"
      : label === "已修改"
        ? "bg-moss/10 text-moss"
        : label === "待确认"
          ? "bg-clay/10 text-clay"
          : "bg-mist text-ink/55";
  return (
    <span className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function sourceToFieldSource(source: IntakeSourceBadgeLabel): IntakeFieldSource {
  if (source === "AI") return "ai";
  if (source === "已修改") return "user";
  return "default";
}
