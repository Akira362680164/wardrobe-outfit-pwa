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
import { getCapsuleGeometry } from "../../../utils/capsule-layout";

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
    titleTopRpx: 0,
    planId: "",
    plan: null as PlanDetailView | null,
    rows: [] as DayArrangement[],
    loading: true,
    deleting: false,
    deleteSheetOpen: false,
    error: "",
    statusActionLabel: "",
  },

  onLoad(query?: { id?: string }) {
    this.setData({ titleTopRpx: getTitleTopRpx() });
    wx.setNavigationBarTitle({ title: "计划详情" });
    if (!query?.id) {
      this.setData({ loading: false, error: "缺少计划 ID" });
      return;
    }
    this.setData({ planId: query.id });
    void this.loadPlan(query.id);
  },

  onShow() {
    if (this.data.planId) void this.loadPlan(this.data.planId, true);
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
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

  async loadPlan(id: string, silent = false) {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        error: state === "logged_out" ? "请先登录后查看衣橱数据" : "请先配置后端 API 域名",
        statusActionLabel: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    if (!silent) this.setData({ loading: true });
    this.setData({ error: "" });
    try {
      const [plan, snapshot] = await Promise.all([fetchCalendarPlanDetail(id), fetchPlanningSnapshot()]);
      const rows = buildRows(plan, snapshot.outfitPlanEntries, snapshot.outfits);
      this.setData({ plan: toPlanView(plan), rows, loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取计划详情失败", statusActionLabel: "重试" });
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
      outfitName: entry?.title || outfit?.name || "",
      outfitMeta: outfit ? `${outfit.itemCount}件 · ${outfit.sceneText}` : entry?.scene || "",
      imageUrl: outfit?.imageUrl || "",
      empty: !entry || !outfit,
      broken: Boolean(entry && !outfit),
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

function getTitleTopRpx(): number {
  return getCapsuleGeometry().topRpx;
}
