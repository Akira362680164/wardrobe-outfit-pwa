import {
  deleteCalendarPlan,
  fetchCalendarPlanDetail,
  fetchPlanningSnapshot,
  getWorkspaceReadState,
  type MiniCalendarPlan,
  type MiniOutfit,
  type MiniOutfitPlanEntry,
} from "../../../services/workspace";
import { enumerateDateRange, formatDateWithWeek } from "../../../utils/calendar";
import { getRuntimeRefreshSnapshot, markRuntimeDomainDirty } from "../../../utils/runtime-refresh";
import { getRecommendationPlanAvailabilityMessage, getRecommendationPlanSnapshotNames, isSnapshotRecommendationPlan } from "../../../utils/outfit-plan-state";

type DayArrangement = {
  date: string;
  label: string;
  statusLabel: string;
  outfitId: string;
  outfitName: string;
  outfitMeta: string;
  imageUrl: string;
  empty: boolean;
  broken: boolean;
};

type PlanDetailView = MiniCalendarPlan & {
  dateText: string;
  dayCount: number;
  toneClass: string;
  destinationText: string;
  activityText: string;
  memoText: string;
};
type DatasetEvent = { currentTarget: { dataset: Record<string, unknown> } };

const TONE_CLASS: Record<MiniCalendarPlan["tone"], string> = {
  denim: "tone-denim",
  moss: "tone-moss",
  clay: "tone-clay",
  amber: "tone-amber",
  rose: "tone-rose",
  purple: "tone-purple",
  slate: "tone-slate",
};

Page({
  data: {
    planId: "",
    plan: null as PlanDetailView | null,
    rows: [] as DayArrangement[],
    initialLoading: true,
    refreshing: false,
    deleting: false,
    deleteSheetOpen: false,
    error: "",
    statusActionLabel: "",
  },

  onLoad(query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: "计划详情" });
    if (!query?.id) {
      this.setData({ initialLoading: false, error: "缺少计划 ID" });
      return;
    }
    this.setData({ planId: query.id });
    void this.loadPlan(query.id);
  },

  onShow() {
    if (this.data.plan && getRuntimeRefreshSnapshot("planning").version !== (this as any).detailDomainVersion) {
      void this.loadPlan(this.data.planId);
    }
  },

  retryLoad() {
    const state = getWorkspaceReadState();
    if (state === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    if (state === "api_not_configured") {
      wx.switchTab({ url: "/pages/settings/index/index" });
      return;
    }
    if (this.data.planId) void this.loadPlan(this.data.planId);
  },

  async loadPlan(id: string) {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        initialLoading: false,
        refreshing: false,
        error: state === "logged_out" ? "请先登录后查看衣橱数据" : "请先配置后端 API 域名",
        statusActionLabel: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    const requestId = ((this as any).detailRequestId || 0) + 1;
    (this as any).detailRequestId = requestId;
    const hasData = Boolean(this.data.plan);
    this.setData({ initialLoading: !hasData, refreshing: hasData, error: "" });
    try {
      const [plan, snapshot] = await Promise.all([fetchCalendarPlanDetail(id), fetchPlanningSnapshot()]);
      if (requestId !== (this as any).detailRequestId) return;
      const rows = buildRows(plan, snapshot.outfitPlanEntries, snapshot.outfits);
      (this as any).detailDomainVersion = getRuntimeRefreshSnapshot("planning").version;
      this.setData({ plan: toPlanView(plan), rows, initialLoading: false, refreshing: false });
    } catch (error) {
      if (requestId !== (this as any).detailRequestId) return;
      this.setData({ initialLoading: false, refreshing: false, error: error instanceof Error ? error.message : "读取计划详情失败", statusActionLabel: "重试" });
      if (hasData) wx.showToast({ title: "计划刷新失败，已保留当前内容", icon: "none" });
    }
  },

  editPlan() {
    if (!this.data.planId) return;
    wx.navigateTo({ url: `/pages/trips/edit/index?id=${encodeURIComponent(this.data.planId)}` });
  },

  openDeleteSheet() {
    this.setData({ deleteSheetOpen: true });
  },

  closeDeleteSheet() {
    if (!this.data.deleting) this.setData({ deleteSheetOpen: false });
  },

  async confirmDelete() {
    const plan = this.data.plan;
    if (!plan || this.data.deleting) return;
    this.setData({ deleting: true });
    try {
      await deleteCalendarPlan(plan.id, plan.revision);
      markRuntimeDomainDirty("planning");
      wx.showToast({ title: "计划已删除", icon: "success" });
      this.setData({ deleteSheetOpen: false });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除计划失败", icon: "none" });
    } finally {
      this.setData({ deleting: false });
    }
  },

  openOutfit(event: DatasetEvent) {
    const id = String(event.currentTarget.dataset.id || "");
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },

  addDayOutfit(event: DatasetEvent) {
    const date = String(event.currentTarget.dataset.date || "");
    if (!date) return;
    wx.navigateTo({ url: `/pages/outfits/calendar/index?date=${encodeURIComponent(date)}` });
  },
});

function toPlanView(plan: MiniCalendarPlan): PlanDetailView {
  const dates = enumerateDateRange(plan.startDate, plan.endDate);
  return {
    ...plan,
    dateText: plan.startDate === plan.endDate ? plan.startDate.replace(/-/g, "/") : `${plan.startDate.replace(/-/g, "/")} - ${plan.endDate.replace(/-/g, "/")}`,
    dayCount: dates.length,
    toneClass: TONE_CLASS[plan.tone],
    destinationText: plan.destination || "未填写",
    activityText: plan.activities.length ? plan.activities.join(" / ") : "未填写",
    memoText: plan.weatherNote || plan.notes || "未填写",
  };
}

function buildRows(plan: MiniCalendarPlan, entries: MiniOutfitPlanEntry[], outfits: MiniOutfit[]): DayArrangement[] {
  return enumerateDateRange(plan.startDate, plan.endDate).map((date) => {
    const entry = entries
      .filter((item) => item.date === date && item.status !== "skipped" && (!item.calendarPlanId || item.calendarPlanId === plan.id))
      .sort((a, b) => {
        if (a.status !== b.status) return statusRank(a.status) - statusRank(b.status);
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })[0];
    const outfit = entry ? outfits.find((item) => item.id === entry.outfitId) : undefined;
    return {
      date,
      label: formatDateWithWeek(date),
      statusLabel: entry ? statusLabel(entry) : "",
      outfitId: outfit?.id || "",
      outfitName: entry?.title || outfit?.name || (entry && isSnapshotRecommendationPlan(entry) ? getRecommendationPlanSnapshotNames(entry).join(" · ") : ""),
      outfitMeta: outfit ? `${outfit.itemCount}件 · ${outfit.sceneText}` : entry && isSnapshotRecommendationPlan(entry) ? getRecommendationPlanAvailabilityMessage(entry, new Date().toISOString().slice(0, 10)) || `${entry.garmentSnapshots.length}件推荐衣物` : entry?.scene || "",
      imageUrl: outfit?.imageUrl || "",
      empty: !entry || (!outfit && !isSnapshotRecommendationPlan(entry)),
      broken: Boolean(entry && !outfit && !isSnapshotRecommendationPlan(entry)),
    };
  });
}

function statusLabel(entry: MiniOutfitPlanEntry): string {
  if (entry.status === "worn") return "实际已穿";
  if (entry.status === "changed") return "已变更";
  return "计划";
}

function statusRank(status: MiniOutfitPlanEntry["status"]): number {
  if (status === "worn") return 0;
  if (status === "planned") return 1;
  if (status === "changed") return 2;
  return 3;
}
