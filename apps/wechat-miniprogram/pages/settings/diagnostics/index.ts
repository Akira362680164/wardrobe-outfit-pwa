Page({
  data: {
    rows: [
      "诊断上传必须由用户主动点击并确认。",
      "诊断内容不会包含衣物原图、AI Key、密码或备份文件。",
      "小程序诊断后端尚未接入，当前不会上传任何数据。",
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "诊断" });
  },

  showUnavailable() {
    wx.showToast({ title: "诊断上传暂未开放", icon: "none" });
  },
});
