import { deleteWorkspaceEntity, fetchWishlistDetail, type MiniWishlistDetail } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    deleting: false,
    deleteSheetOpen: false,
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

  openDeleteSheet() {
    this.setData({ deleteSheetOpen: true });
  },

  closeDeleteSheet() {
    if (!this.data.deleting) this.setData({ deleteSheetOpen: false });
  },

  async confirmDelete(this: any) {
    const item = this.data.item as MiniWishlistDetail | null;
    if (!item || this.data.deleting) return;
    this.setData({ deleting: true });
    try {
      await deleteWorkspaceEntity("wishlist", item.id, item.revision);
      wx.showToast({ title: "已删除", icon: "success" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" });
      this.setData({ deleting: false });
    }
  },
});
