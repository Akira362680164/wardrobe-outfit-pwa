import { fetchWishlist, getWorkspaceReadState, type MiniWishlistItem } from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";
import { selectCustomTab } from "../../../utils/custom-tab-bar";
import { runRuntimeDomainRefresh } from "../../../utils/runtime-refresh";

interface WishlistStatusChip {
  key: string;
  label: string;
  count: number;
}

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "想买", label: "想买" },
  { key: "已购买", label: "已购买" },
  { key: "已放弃", label: "已放弃" },
  { key: "已归档", label: "已归档" },
];

function buildStatusChips(items: MiniWishlistItem[]): WishlistStatusChip[] {
  return FILTERS.map((filter) => ({
    ...filter,
    count: filter.key === "all" ? items.length : items.filter((item) => item.statusText === filter.key).length,
  }));
}

function filterItems(items: MiniWishlistItem[], status: string, evaluation = "all"): MiniWishlistItem[] {
  return items.filter((item) => (status === "all" || item.statusText === status) && (evaluation === "all" || item.evaluation === evaluation));
}

function buildSummaryText(items: MiniWishlistItem[]): string {
  const firstStatus = FILTERS.slice(1).find((filter) => items.some((item) => item.statusText === filter.key));
  const statusCount = firstStatus ? items.filter((item) => item.statusText === firstStatus.key).length : 0;
  return firstStatus ? `${items.length} 件 · ${statusCount} 件${firstStatus.label}` : `${items.length} 件`;
}

Page({
  data: {
    initialLoading: false,
    refreshing: false,
    items: [] as MiniWishlistItem[],
    filteredItems: [] as MiniWishlistItem[],
    activeStatus: "all",
    activeEvaluation: "all",
    evaluationFilters: [{ value: "all", label: "全部评估" }, { value: "buy", label: "值得买" }, { value: "consider", label: "再看看" }, { value: "avoid", label: "不建议" }, { value: "unrated", label: "未评估" }],
    statusChips: buildStatusChips([]),
    summaryText: "0 件",
    error: "",
    emptyTitle: "",
    emptyAction: "",
    createSheetOpen: false,
    titleTopRpx: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "种草" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    selectCustomTab(this, 2);
  },

  onShow() {
    selectCustomTab(this, 2);
    void this.loadWishlist();
  },

  onReady() {
    selectCustomTab(this, 2);
  },

  async loadWishlist(this: any, options: { force?: boolean } = {}) {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        initialLoading: false,
        refreshing: false,
        items: [],
        filteredItems: [],
        statusChips: buildStatusChips([]),
        summaryText: "0 件",
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步种草" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    const hasData = this.data.items.length > 0;
    try {
      const result = await runRuntimeDomainRefresh(
        "wishlist",
        async () => {
          this.setData({ initialLoading: !hasData, refreshing: hasData, error: "" });
          return fetchWishlist();
        },
        { force: Boolean(options.force), hasData },
      );
      if (result.status !== "fulfilled" || !result.accepted) {
        this.setData({ initialLoading: false, refreshing: false });
        return;
      }
      const items = result.value;
      if (sameList(items, this.data.items)) {
        this.setData({ initialLoading: false, refreshing: false, error: "", emptyTitle: "", emptyAction: "" });
        return;
      }
      this.setData({
        items,
        filteredItems: filterItems(items, this.data.activeStatus, this.data.activeEvaluation),
        statusChips: buildStatusChips(items),
        summaryText: buildSummaryText(items),
        initialLoading: false,
        refreshing: false,
        error: "",
        emptyTitle: "",
        emptyAction: "",
      });
    } catch (error) {
      this.setData({
        initialLoading: false,
        refreshing: false,
        error: error instanceof Error ? error.message : "读取种草失败",
      });
    }
  },

  setStatusFilter(event: any) {
    const status = event.currentTarget.dataset.status;
    if (typeof status !== "string") return;
    this.setData({
      activeStatus: status,
      filteredItems: filterItems(this.data.items, status, this.data.activeEvaluation),
    });
  },

  setEvaluationFilter(event: any) {
    const evaluation = String(event.currentTarget.dataset.evaluation || "all");
    this.setData({ activeEvaluation: evaluation, filteredItems: filterItems(this.data.items, this.data.activeStatus, evaluation) });
  },

  handleEmptyAction() {
    const state = getWorkspaceReadState();
    if (state === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    if (state === "api_not_configured") {
      wx.switchTab({ url: "/pages/settings/index/index" });
      return;
    }
    wx.navigateTo({ url: "/pages/intake/camera/index?kind=wishlist" });
  },

  openEdit() {
    wx.navigateTo({ url: "/pages/intake/camera/index?kind=wishlist" });
  },

  openCreateSheet() {
    this.setData({ createSheetOpen: true });
  },

  closeCreateSheet() {
    this.setData({ createSheetOpen: false });
  },

  openDetail(event: { detail?: { id?: string }; currentTarget?: { dataset?: { id?: string } } }) {
    const id = event.detail?.id ?? event.currentTarget?.dataset?.id;
    if (id) wx.navigateTo({ url: `/pages/wishlist/detail/index?id=${encodeURIComponent(id)}` });
  },
});

function getTitleTopRpx() {
  return getCapsuleGeometry().topRpx;
}

function sameList<T>(left: T[], right: T[]): boolean {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}
