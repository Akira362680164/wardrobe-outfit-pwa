import { fetchWorkspaceSummary, getWorkspaceReadState, type WorkspaceSummary } from "../../services/workspace";

Page({
  data: {
    loading: false,
    summary: null as WorkspaceSummary | null,
    error: "",
    emptyTitle: "",
    emptyAction: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "衣橱" });
    this.openWardrobe();
  },

  onShow() {
    this.openWardrobe();
  },

  async loadSummary() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        summary: null,
        error: "",
        emptyTitle: state === "logged_out" ? "登录后同步你的衣橱" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      this.setData({ summary: await fetchWorkspaceSummary(), loading: false });
    } catch (error) {
      this.setData({ loading: false, summary: null, error: error instanceof Error ? error.message : "读取首页数据失败" });
    }
  },

  handlePrimaryAction() {
    if (getWorkspaceReadState() === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    wx.switchTab({ url: "/pages/settings/index/index" });
  },

  openWardrobe() {
    wx.switchTab({ url: "/pages/wardrobe/index/index" });
  },

  openIntake() {
    wx.navigateTo({ url: "/pages/intake/camera/index" });
  },
});
