import { fetchWishlistDetail, type MiniWishlistDetail } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    item: null as MiniWishlistDetail | null,
    error: "",
  },

  onLoad(query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: "种草详情" });
    if (query?.id) void this.loadDetail(query.id);
    else this.setData({ error: "缺少种草 ID" });
  },

  async loadDetail(this: any, id: string) {
    this.setData({ loading: true, error: "" });
    try {
      this.setData({ item: await fetchWishlistDetail(id), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取种草失败" });
    }
  },
});
