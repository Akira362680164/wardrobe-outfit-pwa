Page({
  data: {
    rows: [
      { label: "小程序版本", value: "0.1.0" },
      { label: "AppID", value: "wx14a1a85b7b3844d0" },
      { label: "应用版本", value: "2.1.8-test" },
      { label: "数据源", value: "服务器为唯一权威数据源" },
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "关于" });
  },
});
