import { HttpError } from "../../../services/http";
import { bindExistingWechatAccount } from "../../../services/auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "账号或密码不正确。",
  invalid_account_format: "请输入正确的邮箱或手机号。",
  wechat_already_bound: "当前微信已绑定其他账号。",
  account_already_bound_wechat: "该账号已绑定其他微信，请先用原微信登录后在设置中更换绑定。",
  binding_ticket_expired: "微信登录状态已过期，请重新点击微信登录。",
};

Page({
  data: {
    ticket: "",
    account: "",
    password: "",
    submitting: false,
    errorMessage: "",
  },

  onLoad(query: Record<string, string | undefined>) {
    wx.setNavigationBarTitle({ title: "绑定已有账号" });
    this.setData({ ticket: query.ticket ?? "" });
  },

  handleAccountInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ account: event.detail.value });
  },

  handlePasswordInput(event: WechatMiniprogram.InputEvent) {
    this.setData({ password: event.detail.value });
  },

  async submit(this: any) {
    if (this.data.submitting) return;
    const account = this.data.account.trim();
    const password = this.data.password;
    if (!account || password.length < 8) {
      this.setData({ errorMessage: "请填写邮箱/手机号和至少 8 位密码。" });
      return;
    }
    this.setData({ submitting: true, errorMessage: "" });
    try {
      await bindExistingWechatAccount({ bindingTicket: this.data.ticket, account, password });
      wx.switchTab({ url: "/pages/home/index" });
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },

  openForgotPassword() {
    wx.navigateTo({ url: "/pages/login/forgot-password/index" });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return ERROR_MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : "绑定失败，请稍后重试。";
}
