import { fetchOutfits, getWorkspaceReadState, type MiniOutfit } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    outfits: [] as MiniOutfit[],
    error: "",
    emptyTitle: "",
    emptyAction: "",
    filters: ["全部", "最近穿过", "未穿过", "通勤", "旅行", "春秋"],
    activeFilter: "全部",
    weekDays: [
      { week: "一", day: "6" },
      { week: "二", day: "7" },
      { week: "三", day: "8", active: true },
      { week: "四", day: "9" },
      { week: "五", day: "10" },
      { week: "六", day: "11" },
      { week: "日", day: "12" },
    ],
    outfitCountLabel: "0 套",
    createSheetOpen: false,
    titleTopRpx: 0,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "套装" });
    this.setData({ titleTopRpx: getTitleTopRpx() });
    setCustomTabBarSelected(this, 1);
    void this.loadOutfits();
  },

  onShow() {
    setCustomTabBarSelected(this, 1);
    void this.loadOutfits();
  },

  onReady() {
    setCustomTabBarSelected(this, 1);
  },

  async loadOutfits() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        outfits: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步套装" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      const outfits = await fetchOutfits();
      this.setData({ outfits, loading: false, outfitCountLabel: `${outfits.length} 套` });
    } catch (error) {
      this.setData({ loading: false, outfits: [], outfitCountLabel: "0 套", error: error instanceof Error ? error.message : "读取套装失败" });
    }
  },

  openCalendar() {
    wx.navigateTo({ url: "/pages/outfits/calendar/index" });
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
    wx.navigateTo({ url: "/pages/outfits/compose/index" });
  },

  openCompose() {
    wx.navigateTo({ url: "/pages/outfits/compose/index" });
  },

  openCreateSheet() {
    this.setData({ createSheetOpen: true });
  },

  closeCreateSheet() {
    this.setData({ createSheetOpen: false });
  },

  openDetail(event: any) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },
});

function setCustomTabBarSelected(page: unknown, selected: number) {
  const pageWithTabBar = page as { getTabBar?: () => ({ setData?: (data: { selected: number }) => void } | null) };
  const tabBar = pageWithTabBar.getTabBar?.();
  if (tabBar && typeof tabBar.setData === "function") tabBar.setData({ selected });
}

function getTitleTopRpx() {
  const systemInfo = wx.getSystemInfoSync();
  const menuRect = (wx as unknown as { getMenuButtonBoundingClientRect?: () => { top?: number } }).getMenuButtonBoundingClientRect?.();
  const windowWidth = (systemInfo as WechatMiniprogram.SystemInfo & { windowWidth?: number }).windowWidth || 375;
  const pixelRatio = 750 / windowWidth;
  return Math.round((menuRect?.top ?? (systemInfo.statusBarHeight ?? 0) + 8) * pixelRatio);
}
