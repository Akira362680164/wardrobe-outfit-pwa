Page({
  data: {
    items: [
      "衣物、套装、种草、图片和试穿档案以服务器返回为准。",
      "小程序端不新增本地业务缓存，也不保存 MiniMax Key。",
      "图片只会在你主动上传或发起 AI 能力时发送。",
      "诊断数据必须由你主动触发，且不包含原图和密钥。",
    ],
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "隐私" });
  },

  openAgreement() {
    wx.navigateTo({ url: "/pages/webview/agreement/index" });
  },

  openPrivacy() {
    wx.navigateTo({ url: "/pages/webview/privacy/index" });
  },
});
