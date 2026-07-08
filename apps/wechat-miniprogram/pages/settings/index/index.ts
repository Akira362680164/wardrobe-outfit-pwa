Page({
  data: {
    sections: [
      { title: "账号", copy: "登录状态、手机号和退出登录", url: "/pages/settings/account/index" },
      { title: "AI Key", copy: "后端 AI 接入前的使用边界", url: "/pages/settings/ai-key/index" },
      { title: "隐私", copy: "数据保存、图片和协议入口", url: "/pages/settings/privacy/index" },
      { title: "诊断", copy: "仅用户主动触发，当前暂不可用", url: "/pages/settings/diagnostics/index" },
      { title: "关于", copy: "版本、AppID 和服务说明", url: "/pages/settings/about/index" },
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "设置" });
  },

  openSection(event: { currentTarget: { dataset: { url?: string } } }) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },
});
