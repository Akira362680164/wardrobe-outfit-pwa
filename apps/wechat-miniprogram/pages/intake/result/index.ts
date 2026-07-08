import { getLastCreatedGarmentId } from "../../../stores/intake";

Page({
  data: {
    garmentId: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "导入结果" });
    this.setData({ garmentId: getLastCreatedGarmentId() });
  },

  addMore() {
    wx.redirectTo({ url: "/pages/intake/camera/index" });
  },

  openWardrobe() {
    wx.switchTab({ url: "/pages/wardrobe/index/index" });
  },
});
