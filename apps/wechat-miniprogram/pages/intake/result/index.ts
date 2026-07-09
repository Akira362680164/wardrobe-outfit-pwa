import { clearSavedIntakeQueueItems, getIntakeQueue, getLastIntakeSaveResult } from "../../../stores/intake";

Page({
  data: {
    successCount: 0,
    failedCount: 0,
    savedIds: [] as string[],
    failedItems: [] as Array<{ clientItemId: string; name: string; error: string; imagePath: string }>,
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
    });
  },

  addMore() {
    clearSavedIntakeQueueItems();
    wx.redirectTo({ url: "/pages/intake/camera/index" });
  },

  openWardrobe() {
    clearSavedIntakeQueueItems();
    wx.switchTab({ url: "/pages/wardrobe/index/index" });
  },
});
