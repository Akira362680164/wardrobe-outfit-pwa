import { HttpError } from "../../../services/http";
import { loginWithPassword } from "../../../services/auth";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "手机号或密码不正确。",
  invalid_phone: "手机号格式不正确。",
  missing_api_base_url: "请先配置后端 API 域名。",
  network: "网络连接异常，请稍后重试。",
  rate_limited: "登录尝试过多，请稍后再试。",
  session_unavailable: "服务正在维护，请稍后再试。",
};

Page({
  data: {
    submitting: false,
    errorMessage: "",
    phone: "",
    password: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "账号密码登录" });
  },

  handlePhoneInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ phone: event.detail.value });
  },

  handlePasswordInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ password: event.detail.value });
  },

  async loginByPassword(this: any) {
    if (this.data.submitting) return;
    const phone = this.data.phone.trim();
    const password = this.data.password;
    if (!phone || !password) {
      this.setData({ errorMessage: "请填写手机号和密码。" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      await loginWithPassword(phone, password);
      wx.switchTab({ url: "/pages/wardrobe/index/index" });
    } catch (error) {
      this.setData({ errorMessage: loginErrorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  openAgreement() {
    wx.navigateTo({ url: "/pages/webview/agreement/index" });
  },

  openPrivacy() {
    wx.navigateTo({ url: "/pages/webview/privacy/index" });
  },
});

function loginErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return LOGIN_ERROR_MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : "登录失败，请稍后重试。";
}
