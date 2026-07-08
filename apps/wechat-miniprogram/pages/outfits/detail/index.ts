import { deleteWorkspaceEntity, fetchOutfitDetail, type MiniOutfitDetail } from "../../../services/workspace";

Page({
  data: {
    loading: false,
    deleting: false,
    deleteSheetOpen: false,
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

  openDeleteSheet() {
    this.setData({ deleteSheetOpen: true });
  },

  closeDeleteSheet() {
    if (!this.data.deleting) this.setData({ deleteSheetOpen: false });
  },

  async confirmDelete(this: any) {
    const outfit = this.data.outfit as MiniOutfitDetail | null;
    if (!outfit || this.data.deleting) return;
    this.setData({ deleting: true });
    try {
      await deleteWorkspaceEntity("outfits", outfit.id, outfit.revision);
      wx.showToast({ title: "已删除", icon: "success" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" });
      this.setData({ deleting: false });
    }
  },
});
