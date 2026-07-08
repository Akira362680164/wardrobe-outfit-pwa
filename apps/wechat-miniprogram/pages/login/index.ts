import { HttpError } from "../../services/http";
import { loginWithPassword, loginWithWechatPhone } from "../../services/auth";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  account_binding_conflict: "账号需要安全验证，请联系客服或稍后重试。",
  invalid_credentials: "手机号或密码不正确。",
  invalid_phone: "手机号格式不正确。",
  missing_api_base_url: "请先配置后端 API 域名。",
  network: "网络连接异常，请稍后重试。",
  rate_limited: "登录尝试过多，请稍后再试。",
  session_unavailable: "服务正在维护，请稍后再试。",
  wechat_code_invalid: "授权已过期，请重新点击登录。",
  wechat_phone_unavailable: "授权已过期，请重新点击登录。",
  wechat_service_unavailable: "服务正在维护，请稍后再试。",
};

Page({
  data: {
    submitting: false,
    errorMessage: "",
    phone: "",
    password: "",
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "智能衣橱" });
  },

  async onGetPhoneNumber(this: any, event: WechatMiniprogram.GetPhoneNumberEvent) {
    if (this.data.submitting) return;

    const phoneCode = event.detail.code;
    if (!phoneCode) {
      this.setData({ errorMessage: phoneAuthErrorMessage(event.detail.errMsg) });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      await loginWithWechatPhone(phoneCode);
      wx.switchTab({ url: "/pages/home/index" });
    } catch (error) {
      this.setData({ errorMessage: loginErrorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
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
      wx.switchTab({ url: "/pages/home/index" });
    } catch (error) {
      this.setData({ errorMessage: loginErrorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
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

function phoneAuthErrorMessage(errMsg?: string): string {
  if (!errMsg || /deny|cancel/i.test(errMsg)) return "微信未返回认证手机号，请改用手机号密码登录。";
  return `微信手机号授权失败：${errMsg}`;
}
