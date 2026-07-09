import { clearSavedIntakeQueueItems, getIntakeKind, getIntakeQueue, getLastIntakeSaveResult } from "../../../stores/intake";

Page({
  data: {
    successCount: 0,
    failedCount: 0,
    savedIds: [] as string[],
    failedItems: [] as Array<{ clientItemId: string; name: string; error: string; imagePath: string }>,
    kindLabel: "单品",
    targetLabel: "衣橱",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "导入结果" });
    const result = getLastIntakeSaveResult();
    const failedItems = getIntakeQueue()
      .filter((item) => item.status === "failed")
      .map((item) => ({
        clientItemId: item.clientItemId,
        name: item.draft.name || "未命名单品",
        error: item.error || "未保存",
        imagePath: item.stablePath || item.imagePath,
      }));
    this.setData({
      successCount: result.succeeded,
      failedCount: Math.max(result.failed, failedItems.length),
      savedIds: result.savedIds,
      failedItems,
      kindLabel: getIntakeKind() === "wishlist" ? "种草" : "单品",
      targetLabel: getIntakeKind() === "wishlist" ? "种草" : "衣橱",
    });
  },

  addMore() {
    clearSavedIntakeQueueItems();
    wx.redirectTo({ url: `/pages/intake/camera/index?kind=${getIntakeKind()}` });
  },

  openWardrobe() {
    clearSavedIntakeQueueItems();
    wx.switchTab({ url: getIntakeKind() === "wishlist" ? "/pages/wishlist/index/index" : "/pages/wardrobe/index/index" });
  },
});
