import { fetchWishlist, getWorkspaceReadState, type MiniWishlistItem } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    items: [] as MiniWishlistItem[],
    error: "",
    emptyTitle: "",
    emptyAction: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "种草" });
    void this.loadWishlist();
  },

  onShow() {
    void this.loadWishlist();
  },

  async loadWishlist() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        items: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步种草" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      this.setData({ items: await fetchWishlist(), loading: false });
    } catch (error) {
      this.setData({ loading: false, items: [], error: error instanceof Error ? error.message : "读取种草失败" });
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
    wx.navigateTo({ url: "/pages/wishlist/edit/index" });
  },

  openEdit() {
    wx.navigateTo({ url: "/pages/wishlist/edit/index" });
  },

  openDetail(event: any) {
    const id = event.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: `/pages/wishlist/detail/index?id=${encodeURIComponent(id)}` });
  },
});
