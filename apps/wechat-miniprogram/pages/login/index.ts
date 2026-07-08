import { HttpError } from "../../services/http";
import { loginWithWechatPhone } from "../../services/auth";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  account_binding_conflict: "账号需要安全验证，请联系客服或稍后重试。",
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
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "智能衣橱" });
  },

  async onGetPhoneNumber(this: any, event: WechatMiniprogram.GetPhoneNumberEvent) {
    if (this.data.submitting) return;

    const phoneCode = event.detail.code;
    if (!phoneCode) {
      this.setData({ errorMessage: "需要微信认证手机号才能继续使用智能衣橱。" });
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
