import type {
  MiniCalendarPlan,
  MiniOutfit,
  MiniOutfitPlanEntry,
} from "../services/workspace";
import {
  getBackupOutfitPlanEntries,
  getDisplayOutfitId,
  getOutfitPlanDateRelation,
  resolvePrimaryOutfitPlanEntry,
} from "./outfit-plan-state";
import { formatDateLabel, formatDateWithWeek } from "./calendar";

export const TONE_CLASS: Record<MiniCalendarPlan["tone"], string> = {
  denim: "tone-denim",
  moss: "tone-moss",
  clay: "tone-clay",
  amber: "tone-amber",
  rose: "tone-rose",
  purple: "tone-purple",
  slate: "tone-slate",
};

export type DayCardActionKey = "mark_worn" | "delete_worn" | "change" | "backup" | "empty_primary";

export interface PlanToneView {
  id: string;
  title: string;
  typeLabel: string;
  toneClass: string;
}

export interface DayCardAction {
  key: DayCardActionKey;
  label: string;
  tone: "primary" | "secondary" | "danger";
}

export interface OutfitPlanDayCardView {
  dateLabel: string;
  weekdayLabel: string;
  plans: PlanToneView[];
  primary: {
    entryId: string;
    outfitId: string;
    name: string;
    imageUrl: string;
    itemImages: string[];
    meta: string;
    statusLabel: string;
    statusClass: string;
  } | null;
  actions: DayCardAction[];
  backups: Array<{
    entryId: string;
    outfitId: string;
    name: string;
    imageUrl: string;
    itemImages: string[];
  }>;
  empty: {
    title: string;
    copy: string;
    actionLabel: string;
  } | null;
}

export function toPlanToneViews(plans: MiniCalendarPlan[]): PlanToneView[] {
  return plans.map((plan) => ({
    id: plan.id,
    title: plan.title || plan.typeLabel,
    typeLabel: plan.typeLabel,
    toneClass: TONE_CLASS[plan.tone],
  }));
}

export function buildOutfitPlanDayCard(input: {
  dateKey: string;
  todayKey: string;
  plans: MiniCalendarPlan[];
  entries: MiniOutfitPlanEntry[];
  outfits: MiniOutfit[];
}): OutfitPlanDayCardView {
  const relation = getOutfitPlanDateRelation(input.dateKey, input.todayKey);
  const primaryEntry = resolvePrimaryOutfitPlanEntry(input.entries);
  const visiblePrimaryEntry = relation === "past" && primaryEntry?.status !== "worn" ? undefined : primaryEntry;
  const primaryOutfit = visiblePrimaryEntry
    ? input.outfits.find((outfit) => outfit.id === getDisplayOutfitId(visiblePrimaryEntry))
    : undefined;
  const dateLabel = formatDateLabel(input.dateKey);
  const weekdayLabel = formatDateWithWeek(input.dateKey).split(" ")[1] || "";
  const primary = visiblePrimaryEntry && primaryOutfit
    ? {
        entryId: visiblePrimaryEntry.id,
        outfitId: primaryOutfit.id,
        name: visiblePrimaryEntry.title || primaryOutfit.name,
        imageUrl: primaryOutfit.imageUrl,
        itemImages: primaryOutfit.itemImages,
        meta: `${primaryOutfit.itemCount}件 · ${primaryOutfit.sceneText}`,
        statusLabel: visiblePrimaryEntry.status === "worn"
          ? "实际已穿"
          : visiblePrimaryEntry.status === "changed"
            ? "已变更"
            : relation === "past"
              ? "计划未确认"
              : "计划",
        statusClass: visiblePrimaryEntry.status === "worn"
          ? "is-worn"
          : visiblePrimaryEntry.status === "changed"
            ? "is-changed"
            : "is-planned",
      }
    : null;

  const wornAction: DayCardAction = visiblePrimaryEntry?.status === "worn"
    ? { key: "delete_worn", label: "删除已穿", tone: "danger" }
    : { key: "mark_worn", label: relation === "past" ? "补记已穿" : "标记已穿", tone: "primary" };
  const actions: DayCardAction[] = primary
    ? relation === "past"
      ? [wornAction]
      : relation === "today"
        ? [wornAction, { key: "change", label: "更改套装", tone: "secondary" }, { key: "backup", label: "添加备选", tone: "secondary" }]
        : [{ key: "change", label: "更改套装", tone: "secondary" }, { key: "backup", label: "添加备选", tone: "secondary" }]
    : [];

  const backups = getBackupOutfitPlanEntries(input.entries, visiblePrimaryEntry)
    .map((entry) => {
      const outfit = input.outfits.find((item) => item.id === getDisplayOutfitId(entry));
      return outfit
        ? {
            entryId: entry.id,
            outfitId: outfit.id,
            name: entry.title || outfit.name,
            imageUrl: outfit.imageUrl,
            itemImages: outfit.itemImages,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    dateLabel,
    weekdayLabel,
    plans: toPlanToneViews(input.plans),
    primary,
    actions,
    backups,
      empty: primary
      ? null
      : {
          title: relation === "past" ? `${dateLabel}还没有穿着记录` : relation === "today" ? "今天还没有安排穿搭" : `${dateLabel}还没有安排穿搭`,
          copy: "",
          actionLabel: relation === "past" ? "补记已穿" : "安排穿搭",
        },
  };
}
