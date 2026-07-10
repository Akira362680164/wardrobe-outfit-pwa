import { HttpError } from "../../services/http";
import { loginWithWechatOpenId } from "../../services/auth";

const AUTH_CONSENT_ERROR = "请先阅读并同意《用户服务协议》和《隐私政策》";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "账号或密码不正确。",
  missing_api_base_url: "请先配置后端 API 域名。",
  network: "网络连接异常，请稍后重试。",
  rate_limited: "登录尝试过多，请稍后再试。",
  session_unavailable: "服务正在维护，请稍后再试。",
  wechat_code_invalid: "微信登录授权已过期，请重新点击登录。",
  wechat_service_unavailable: "服务正在维护，请稍后再试。",
};

Page({
  data: {
    submitting: false,
    errorMessage: "",
    accepted: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "Wardora" });
  },

  async onWechatLogin(this: any) {
    if (this.data.submitting) return;
    if (!this.data.accepted) {
      this.setData({ errorMessage: AUTH_CONSENT_ERROR });
      return;
    }
    this.setData({ submitting: true, errorMessage: "" });
    try {
      const result = await loginWithWechatOpenId();
      if (result.status === "logged_in") {
        wx.switchTab({ url: "/pages/wardrobe/index/index" });
        return;
      }
      wx.navigateTo({ url: `/pages/login/connect-account/index?ticket=${encodeURIComponent(result.bindingTicket)}` });
    } catch (error) {
      this.setData({ errorMessage: loginErrorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openPasswordLogin() {
    wx.navigateTo({ url: "/pages/login/password/index" });
  },

  openEmailRegister() {
    wx.navigateTo({ url: "/pages/login/register-email/index" });
  },

  handleAgreementChange(event: any) {
    const accepted = event.detail.value.includes("accepted");
    this.setData({
      accepted,
      errorMessage: accepted && this.data.errorMessage === AUTH_CONSENT_ERROR ? "" : this.data.errorMessage,
    });
  },

  openAgreement() {
    wx.navigateTo({ url: "/pages/webview/agreement/index" });
  },

  openPrivacy() {
    wx.navigateTo({ url: "/pages/webview/privacy/index" });
  },
});

function loginErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return LOGIN_ERROR_MESSAGES[error.code] ?? "登录失败，请稍后重试。";
  return error instanceof Error ? sanitizeWechatError(error.message) : "登录失败，请稍后重试。";
}

function sanitizeWechatError(message: string): string {
  if (/operateWXData|openid|unionid|session_key|jsapi/i.test(message)) {
    return "微信登录未完成，请重新点击微信登录。";
  }
  return message;
}
