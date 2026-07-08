import { fetchOutfits, getWorkspaceReadState, type MiniOutfit } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    outfits: [] as MiniOutfit[],
    error: "",
    emptyTitle: "",
    emptyAction: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "穿搭" });
    void this.loadOutfits();
  },

  onShow() {
    void this.loadOutfits();
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
      this.setData({ outfits: await fetchOutfits(), loading: false });
    } catch (error) {
      this.setData({ loading: false, outfits: [], error: error instanceof Error ? error.message : "读取套装失败" });
    }
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

  openDetail(event: any) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/outfits/detail/index?id=${encodeURIComponent(id)}` });
  },
});
