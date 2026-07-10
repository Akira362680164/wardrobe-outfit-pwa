import { HttpError } from "../../../services/http";
import { confirmPasswordReset, requestPasswordReset } from "../../../services/auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "邮箱格式不正确。",
  email_code_invalid: "验证码不正确。",
  email_code_expired: "验证码已过期，请重新获取。",
  email_code_attempts_exceeded: "验证码错误次数过多，请重新获取。",
  email_rate_limited: "验证码发送过于频繁，请稍后再试。",
};

Page({
  data: {
    email: "",
    emailCode: "",
    newPassword: "",
    confirmPassword: "",
    codeSent: false,
    sending: false,
    submitting: false,
    countdown: 0,
    errorMessage: "",
    successMessage: "",
  },

  countdownTimer: 0 as number,

  onLoad() {
    wx.setNavigationBarTitle({ title: "找回密码" });
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  },

  handleEmailInput(event: WechatMiniprogram.InputEvent) { this.setData({ email: event.detail.value }); },
  handleCodeInput(event: WechatMiniprogram.InputEvent) { this.setData({ emailCode: event.detail.value }); },
  handlePasswordInput(event: WechatMiniprogram.InputEvent) { this.setData({ newPassword: event.detail.value }); },
  handleConfirmInput(event: WechatMiniprogram.InputEvent) { this.setData({ confirmPassword: event.detail.value }); },

  async sendCode(this: any) {
    if (this.data.sending || this.data.countdown > 0) return;
    const email = this.data.email.trim();
    if (!isEmail(email)) return this.setData({ errorMessage: "邮箱格式不正确。" });
    const confirmed = await confirmSend(maskEmail(email));
    if (!confirmed) return;
    this.setData({ sending: true, errorMessage: "", successMessage: "" });
    try {
      await requestPasswordReset(email);
      this.setData({ codeSent: true });
      this.startCountdown(30);
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
    const email = this.data.email.trim();
    if (!isEmail(email)) return this.setData({ errorMessage: "邮箱格式不正确。" });
    if (!this.data.emailCode) return this.setData({ errorMessage: "请输入邮箱验证码。" });
    if (this.data.newPassword.length < 8) return this.setData({ errorMessage: "密码至少需要 8 位。" });
    if (this.data.newPassword !== this.data.confirmPassword) return this.setData({ errorMessage: "两次输入的密码不一致。" });
    this.setData({ submitting: true, errorMessage: "", successMessage: "" });
    try {
      await confirmPasswordReset({
        email,
        emailCode: this.data.emailCode.trim(),
        newPassword: this.data.newPassword,
      });
      this.setData({ successMessage: "密码已重置，请重新登录。" });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 700);
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },
});

function confirmSend(emailMasked: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: "发送邮箱验证码",
      content: `验证码将发送至 ${emailMasked}，10 分钟内有效。确认发送？`,
      cancelText: "取消",
      confirmText: "确认发送",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    });
  });
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return `${(local || "*").slice(0, 1)}***@${domain || ""}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return ERROR_MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}
