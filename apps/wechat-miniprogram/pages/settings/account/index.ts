import { clearSession, getSession, isLoggedIn } from "../../../stores/session";

Page({
  data: {
    loggedIn: false,
    phoneMasked: "未登录",
    displayName: "",
    deviceId: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "账号" });
    this.refreshAccount();
  },

  onShow() {
    this.refreshAccount();
  },

  refreshAccount() {
    const session = getSession();
    this.setData({
      loggedIn: isLoggedIn(),
      phoneMasked: session?.user?.phoneMasked ?? "未登录",
      displayName: session?.user?.displayName ?? "",
      deviceId: session?.deviceId ? maskDeviceId(session.deviceId) : "未生成",
    });
  },

  login() {
    wx.redirectTo({ url: "/pages/login/index" });
  },

  logout() {
    clearSession();
    wx.showToast({ title: "已退出登录", icon: "none" });
    this.refreshAccount();
  },
});

function maskDeviceId(deviceId: string): string {
  if (deviceId.length <= 14) return deviceId;
  return `${deviceId.slice(0, 10)}...${deviceId.slice(-4)}`;
}
