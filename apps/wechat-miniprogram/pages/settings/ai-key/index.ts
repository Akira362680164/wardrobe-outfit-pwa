Page({
  data: {
    rows: [
      { label: "当前状态", value: "后端 AI 代理待接入" },
      { label: "本机保存", value: "小程序端暂不保存 AI Key" },
      { label: "业务数据", value: "衣橱数据仍只以服务器为准" },
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "AI Key" });
  },
});
