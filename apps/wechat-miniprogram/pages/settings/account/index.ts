import { clearSession, getSession, isLoggedIn } from "../../../stores/session";
import { getAccountSecurity, type AccountSecurityResponse } from "../../../services/auth";

Page({
  data: {
    loggedIn: false,
    loading: false,
    emailLine: "未绑定",
    emailStatus: "待验证",
    phoneLine: "未绑定",
    phoneStatus: "登录名",
    wechatLine: "未绑定",
    passwordLine: "未设置",
    deviceId: "",
    errorMessage: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "账号安全" });
    this.refreshAccount();
  },

  onShow() {
    this.refreshAccount();
  },

  async refreshAccount(this: any) {
    const session = getSession();
    const loggedIn = isLoggedIn();
    this.setData({
      loggedIn,
      deviceId: session?.deviceId ? maskDeviceId(session.deviceId) : "未生成",
      emailLine: session?.user?.emailMasked ?? "未绑定",
      emailStatus: session?.user?.emailVerified ? "已验证" : "待验证",
      phoneLine: session?.user?.phoneMasked ?? "未绑定",
    });
    if (!loggedIn) return;
    this.setData({ loading: true, errorMessage: "" });
    try {
      const security = await getAccountSecurity();
      this.applySecurity(security);
    } catch {
      this.setData({ errorMessage: "账号安全信息暂时无法更新。" });
    } finally {
      this.setData({ loading: false });
    }
  },

  applySecurity(security: AccountSecurityResponse) {
    this.setData({
      emailLine: security.email.masked ?? "未绑定",
      emailStatus: security.email.verified ? "已验证" : "待验证",
      phoneLine: security.phone.masked ?? "未绑定",
      phoneStatus: "登录名",
      wechatLine: security.wechat.bound ? "已绑定当前小程序" : "未绑定",
      passwordLine: security.password.set ? "已设置" : "未设置",
    });
  },

  login() {
    wx.redirectTo({ url: "/pages/login/index" });
  },

  changePassword() {
    wx.navigateTo({ url: "/pages/settings/change-password/index" });
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
