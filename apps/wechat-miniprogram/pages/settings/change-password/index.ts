import { HttpError } from "../../../services/http";
import { getSession } from "../../../stores/session";
import {
  changePasswordWithCurrentPassword,
  changePasswordWithEmailCode,
  requestPasswordChangeCode,
} from "../../../services/auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "当前密码不正确，请重试。",
  email_unverified: "邮箱尚未验证，暂不能使用邮箱验证码修改密码。",
  email_code_invalid: "邮箱验证码不正确。",
  email_code_expired: "邮箱验证码已过期，请重新获取。",
  email_code_attempts_exceeded: "验证码错误次数过多，请重新获取。",
  email_rate_limited: "验证码发送过于频繁，请稍后再试。",
  email_code_rate_limited: "验证码请求过多，请稍后再试。",
  email_provider_not_configured: "邮件服务尚未配置，请稍后再试。",
  email_provider_error: "邮件发送失败，请稍后再试。",
};

Page({
  data: {
    mode: "current" as "current" | "email",
    emailMasked: "未绑定邮箱",
    currentPassword: "",
    emailCode: "",
    newPassword: "",
    confirmPassword: "",
    codeSent: false,
    sending: false,
    submitting: false,
    countdown: 0,
    errorMessage: "",
    sendConfirmOpen: false,
  },

  countdownTimer: 0 as number,

  onLoad() {
    wx.setNavigationBarTitle({ title: "修改密码" });
    this.setData({ emailMasked: getSession()?.user?.emailMasked ?? "未绑定邮箱" });
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  },

  switchCurrent() { this.setData({ mode: "current", errorMessage: "" }); },
  switchEmail() { this.setData({ mode: "email", errorMessage: "" }); },
  handleCurrentInput(event: WechatMiniprogram.InputEvent) { this.setData({ currentPassword: event.detail.value }); },
  handleCodeInput(event: WechatMiniprogram.InputEvent) { this.setData({ emailCode: event.detail.value }); },
  handleNewPasswordInput(event: WechatMiniprogram.InputEvent) { this.setData({ newPassword: event.detail.value }); },
  handleConfirmInput(event: WechatMiniprogram.InputEvent) { this.setData({ confirmPassword: event.detail.value }); },

  async sendCode(this: any) {
    if (this.data.sending || this.data.countdown > 0 || this.data.emailMasked === "未绑定邮箱") return;
    this.setData({ sendConfirmOpen: true });
  },

  closeSendConfirm(this: any) { this.setData({ sendConfirmOpen: false }); },

  async confirmSendCode(this: any) {
    if (this.data.sending) return;
    this.setData({ sendConfirmOpen: false, sending: true, errorMessage: "" });
    try {
      const response = await requestPasswordChangeCode();
      this.setData({ codeSent: true });
      this.startCountdown(response.cooldownSeconds);
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ sending: false });
    }
  },

  startCountdown(seconds: number) {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.setData({ countdown: seconds });
    this.countdownTimer = setInterval(() => {
      const next = Math.max(0, this.data.countdown - 1);
      this.setData({ countdown: next });
      if (next === 0 && this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = 0;
      }
    }, 1000) as unknown as number;
  },

  async submit(this: any) {
    if (this.data.submitting) return;
    if (this.data.newPassword.length < 8) return this.setData({ errorMessage: "新密码至少需要 8 位。" });
    if (this.data.newPassword !== this.data.confirmPassword) return this.setData({ errorMessage: "两次输入的新密码不一致。" });
    if (this.data.mode === "current" && this.data.currentPassword.length < 8) return this.setData({ errorMessage: "请输入当前密码。" });
    if (this.data.mode === "email" && !/^\d{6}$/.test(this.data.emailCode.trim())) return this.setData({ errorMessage: "请输入 6 位邮箱验证码。" });
    this.setData({ submitting: true, errorMessage: "" });
    try {
      if (this.data.mode === "current") {
        await changePasswordWithCurrentPassword({
          currentPassword: this.data.currentPassword,
          newPassword: this.data.newPassword,
        });
      } else {
        await changePasswordWithEmailCode({
          emailCode: this.data.emailCode.trim(),
          newPassword: this.data.newPassword,
        });
      }
      wx.showToast({ title: "密码已更新", icon: "none" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return ERROR_MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}
