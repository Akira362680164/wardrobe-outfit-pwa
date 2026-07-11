import { fetchWishlist, getWorkspaceReadState, type MiniWishlistItem } from "../../../services/workspace";
import { getCapsuleGeometry } from "../../../utils/capsule-layout";

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

function filterItems(items: MiniWishlistItem[], status: string): MiniWishlistItem[] {
  return status === "all" ? items : items.filter((item) => item.statusText === status);
}

function buildSummaryText(items: MiniWishlistItem[]): string {
  const firstStatus = FILTERS.slice(1).find((filter) => items.some((item) => item.statusText === filter.key));
  const statusCount = firstStatus ? items.filter((item) => item.statusText === firstStatus.key).length : 0;
  return firstStatus ? `${items.length} 件 · ${statusCount} 件${firstStatus.label}` : `${items.length} 件`;
}

Page({
  data: {
    loading: false,
    items: [] as MiniWishlistItem[],
    filteredItems: [] as MiniWishlistItem[],
    activeStatus: "all",
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
    setCustomTabBarSelected(this, 2);
    void this.loadWishlist();
  },

  onShow() {
    setCustomTabBarSelected(this, 2);
    void this.loadWishlist();
  },

  onReady() {
    setCustomTabBarSelected(this, 2);
  },

  async loadWishlist() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
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

    this.setData({ loading: true, error: "" });
    try {
      const items = await fetchWishlist();
      this.setData({
        items,
        filteredItems: filterItems(items, this.data.activeStatus),
        statusChips: buildStatusChips(items),
        summaryText: buildSummaryText(items),
        loading: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        items: [],
        filteredItems: [],
        statusChips: buildStatusChips([]),
        summaryText: "0 件",
        error: error instanceof Error ? error.message : "读取种草失败",
      });
    }
  },

  setStatusFilter(event: any) {
    const status = event.currentTarget.dataset.status;
    if (typeof status !== "string") return;
    this.setData({
      activeStatus: status,
      filteredItems: filterItems(this.data.items, status),
    });
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

function setCustomTabBarSelected(page: unknown, selected: number) {
  const pageWithTabBar = page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) };
  const tabBar = pageWithTabBar.getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ selected });
}

function getTitleTopRpx() {
  return getCapsuleGeometry().topRpx;
}
