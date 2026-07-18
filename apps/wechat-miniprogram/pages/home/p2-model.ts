import type { MiniGarment, PlanningSnapshot } from "../../services/workspace";

export type RecommendationSelection = {
  candidateId: string;
  garmentIds: string[];
  garments: Array<{ id: string; category: string }>;
};

export function buildReplacementChoices(selected: RecommendationSelection, sourceIndex: number, garments: MiniGarment[]) {
  const source = selected.garments[sourceIndex];
  if (!source) return [{ id: "", label: "不替换" }];
  const selectedIds = new Set(selected.garmentIds);
  return [
    { id: "", label: "不替换" },
    ...garments
      .filter((garment) => garment.category === source.category && garment.status === "active" && Boolean(garment.imageUrl) && !selectedIds.has(garment.id))
      .map((garment) => ({ id: garment.id, label: garment.name })),
  ];
}

export function hasAcceptedPlanReadback(planning: PlanningSnapshot, date: string, candidateId: string, garmentIds: string[], planId = ""): boolean {
  const expected = [...garmentIds].sort().join("|");
  return planning.outfitPlanEntries.some((entry) => {
    if (entry.date !== date || !entry.isPrimary || entry.status !== "planned") return false;
    if (planId && entry.id !== planId) return false;
    const payloadCandidate = String(entry.rawPayload.recommendationCandidateId ?? entry.rawPayload.candidateId ?? "");
    return payloadCandidate === candidateId && [...entry.garmentIds].sort().join("|") === expected;
  });
}

export function isPlanCanceledReadback(planning: PlanningSnapshot, date: string, canceledId: string, backupId?: string): boolean {
  const primary = planning.outfitPlanEntries.find((entry) => entry.date === date && entry.isPrimary && entry.status !== "skipped");
  return primary?.id !== canceledId && (!backupId || primary?.id === backupId);
}

export function hasWornStateReadback(planning: PlanningSnapshot, planId: string, worn: boolean): boolean {
  const plan = planning.outfitPlanEntries.find((entry) => entry.id === planId);
  return Boolean(plan) && (plan!.status === "worn") === worn;
}

export function homeActionErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/409|conflict|revision/i.test(message)) return "内容已经在另一处更新，请返回首页刷新后再试。";
  if (/blocked|unavailable|repair|laundry|archived/i.test(message)) return "这套穿搭里有当前不可用的衣物，请更换后再试。";
  if (/readback_missing|timeout|network|request:fail/i.test(message)) return "网络不稳定，尚未确认成功。请保持当前选择并重试。";
  return "操作暂时没有完成，请保持当前选择并重试。";
}
