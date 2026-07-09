Page({
  data: {
    ticket: "",
  },

  onLoad(query: Record<string, string | undefined>) {
    wx.setNavigationBarTitle({ title: "连接 Wardora 账号" });
    this.setData({ ticket: query.ticket ?? "" });
  },

  bindExisting() {
    wx.navigateTo({ url: `/pages/login/bind-existing/index?ticket=${encodeURIComponent(this.data.ticket)}` });
  },

  registerNew() {
    wx.navigateTo({ url: `/pages/login/register-email/index?ticket=${encodeURIComponent(this.data.ticket)}` });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.redirectTo({ url: "/pages/login/index" });
  },
});
