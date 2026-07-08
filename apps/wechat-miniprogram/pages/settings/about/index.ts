Page({
  data: {
    title: "关于",
    description: "应用版本、服务说明和支持信息。",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "关于" });
  },
});
