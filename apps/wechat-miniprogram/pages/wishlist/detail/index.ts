import {
  convertWishlistToWardrobe,
  deleteWorkspaceEntity,
  fetchWishlistDetail,
  type MiniWishlistDetail,
  undoWishlistPurchase,
  updateWishlistStatus,
} from "../../../services/workspace";

Page({
  data: {
    loading: false,
    deleting: false,
    actioning: "",
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

  async togglePurchase(this: any) {
    const item = this.data.item as MiniWishlistDetail | null;
    if (!item || this.data.actioning) return;
    this.setData({ actioning: "purchase" });
    try {
      const next = item.status === "purchased"
        ? await undoWishlistPurchase(item.id, item.revision)
        : await convertWishlistToWardrobe(item.id, item.revision, "home");
      this.setData({ item: next });
      wx.showToast({ title: next.status === "purchased" ? "已转入衣橱" : "已撤销购买", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新购买状态失败", icon: "none" });
    } finally {
      this.setData({ actioning: "" });
    }
  },

  async toggleRejected(this: any) {
    const item = this.data.item as MiniWishlistDetail | null;
    if (!item || this.data.actioning || item.status === "purchased") return;
    this.setData({ actioning: "reject" });
    try {
      const next = await updateWishlistStatus({
        id: item.id,
        expectedRevision: item.revision,
        currentPayload: item.rawPayload,
        status: item.status === "rejected" ? "interested" : "rejected",
      });
      this.setData({ item: next });
      wx.showToast({ title: next.status === "rejected" ? "已标记不想买" : "已恢复想买", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "更新种草状态失败", icon: "none" });
    } finally {
      this.setData({ actioning: "" });
    }
  },

  openDeleteSheet() {
    if (this.data.actioning) return;
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
