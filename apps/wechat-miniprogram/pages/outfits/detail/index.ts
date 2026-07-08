import { fetchOutfitDetail, type MiniOutfitDetail } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    outfit: null as MiniOutfitDetail | null,
    error: "",
  },

  onLoad(query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: "套装详情" });
    if (query?.id) void this.loadDetail(query.id);
    else this.setData({ error: "缺少套装 ID" });
  },

  async loadDetail(this: any, id: string) {
    this.setData({ loading: true, error: "" });
    try {
      this.setData({ outfit: await fetchOutfitDetail(id), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取套装失败" });
    }
  },
});
