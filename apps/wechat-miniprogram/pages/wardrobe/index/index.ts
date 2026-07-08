import { fetchGarments, getWorkspaceReadState, type MiniGarment } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    garments: [] as MiniGarment[],
    error: "",
    emptyTitle: "",
    emptyAction: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "衣橱" });
    void this.loadGarments();
  },

  onShow() {
    void this.loadGarments();
  },

  async loadGarments() {
    const state = getWorkspaceReadState();
    if (state !== "ready") {
      this.setData({
        loading: false,
        garments: [],
        error: "",
        emptyTitle: state === "logged_out" ? "登录后查看衣橱" : "请先配置后端 API 域名",
        emptyAction: state === "logged_out" ? "去登录" : "去设置",
      });
      return;
    }

    this.setData({ loading: true, error: "" });
    try {
      this.setData({ garments: await fetchGarments(), loading: false });
    } catch (error) {
      this.setData({ loading: false, garments: [], error: error instanceof Error ? error.message : "读取衣橱失败" });
    }
  },

  handlePrimaryAction() {
    if (getWorkspaceReadState() === "logged_out") {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    wx.switchTab({ url: "/pages/settings/index/index" });
  },

  handleEmptyAction() {
    if (this.data.emptyAction) {
      this.handlePrimaryAction();
      return;
    }
    this.openIntake();
  },

  openIntake() {
    wx.switchTab({ url: "/pages/intake/camera/index" });
  },
});
