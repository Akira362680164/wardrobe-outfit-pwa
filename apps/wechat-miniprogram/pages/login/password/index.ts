import { HttpError } from "../../../services/http";
import { loginWithPassword } from "../../../services/auth";

const AUTH_CONSENT_ERROR = "请先阅读并同意《用户服务协议》和《隐私政策》";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "账号或密码不正确。",
  invalid_account_format: "请输入正确的邮箱或手机号。",
  invalid_phone: "手机号格式不正确。",
  email_unverified: "请先验证邮箱后继续使用。",
  missing_api_base_url: "请先配置后端 API 域名。",
  network: "网络连接异常，请稍后重试。",
  rate_limited: "登录尝试过多，请稍后再试。",
  session_unavailable: "服务正在维护，请稍后再试。",
};

Page({
  data: {
    submitting: false,
    errorMessage: "",
    account: "",
    password: "",
    accepted: false,
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "邮箱/手机号登录" });
  },

  handleAccountInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ account: event.detail.value });
  },

  handlePasswordInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ password: event.detail.value });
  },

  handleAgreementChange(event: any) {
    const accepted = event.detail.value.includes("accepted");
    this.setData({
      accepted,
      errorMessage: accepted && this.data.errorMessage === AUTH_CONSENT_ERROR ? "" : this.data.errorMessage,
    });
  },

  async loginByPassword(this: any) {
    if (this.data.submitting) return;
    const account = this.data.account.trim();
    const password = this.data.password;
    if (!this.data.accepted) {
      this.setData({ errorMessage: AUTH_CONSENT_ERROR });
      return;
    }
    if (!account || !password) {
      this.setData({ errorMessage: "请填写邮箱/手机号和密码。" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    try {
      await loginWithPassword(account, password);
      wx.switchTab({ url: "/pages/wardrobe/index/index" });
    } catch (error) {
      this.setData({ errorMessage: loginErrorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openForgotPassword() {
    wx.navigateTo({ url: "/pages/login/forgot-password/index" });
  },

  openEmailRegister() {
    wx.navigateTo({ url: "/pages/login/register-email/index" });
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
