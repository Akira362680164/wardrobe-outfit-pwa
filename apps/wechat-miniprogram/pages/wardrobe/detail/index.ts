import { deleteWorkspaceEntity, fetchGarmentDetail, type MiniGarmentDetail } from "../../../services/workspace";

Page({
  data: {
    title: "单品详情",
    loading: false,
    deleting: false,
    deleteSheetOpen: false,
    item: null as MiniGarmentDetail | null,
    error: "",
  },

  onLoad(query?: { id?: string }) {
    wx.setNavigationBarTitle({ title: "单品详情" });
    if (query?.id) void this.loadDetail(query.id);
    else this.setData({ error: "缺少单品 ID" });
  },

  async loadDetail(this: any, id: string) {
    this.setData({ loading: true, error: "" });
    try {
      this.setData({ item: await fetchGarmentDetail(id), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error instanceof Error ? error.message : "读取单品失败" });
    }
  },

  openDeleteSheet() {
    this.setData({ deleteSheetOpen: true });
  },

  closeDeleteSheet() {
    if (!this.data.deleting) this.setData({ deleteSheetOpen: false });
  },

  async confirmDelete(this: any) {
    const item = this.data.item as MiniGarmentDetail | null;
    if (!item || this.data.deleting) return;
    this.setData({ deleting: true });
    try {
      await deleteWorkspaceEntity("garments", item.id, item.revision);
      wx.showToast({ title: "已删除", icon: "success" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" });
      this.setData({ deleting: false });
    }
  },
});
