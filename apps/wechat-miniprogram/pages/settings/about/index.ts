import { APP_BUILD_VERSION, MINIPROGRAM_PACKAGE_VERSION } from "../../../generated/build-info";

Page({
  data: {
    rows: [
      { label: "小程序版本", value: MINIPROGRAM_PACKAGE_VERSION },
      { label: "AppID", value: "wx14a1a85b7b3844d0" },
      { label: "应用版本", value: APP_BUILD_VERSION },
      { label: "数据源", value: "服务器为唯一权威数据源" },
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "关于" });
  },
});
