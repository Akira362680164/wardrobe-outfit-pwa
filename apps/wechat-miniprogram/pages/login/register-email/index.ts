import { HttpError } from "../../../services/http";
import { registerWithEmail, sendEmailCode } from "../../../services/auth";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "邮箱格式不正确。",
  email_already_registered: "该邮箱已注册，请改用邮箱/手机号登录或绑定已有账号。",
  phone_already_registered: "该手机号已被使用，请删除手机号后继续注册或绑定已有账号。",
  email_code_invalid: "验证码不正确。",
  email_code_expired: "验证码已过期，请重新获取。",
  email_code_attempts_exceeded: "验证码错误次数过多，请重新获取。",
  email_rate_limited: "验证码发送过于频繁，请稍后再试。",
};

Page({
  data: {
    ticket: "",
    email: "",
    emailCode: "",
    password: "",
    confirmPassword: "",
    phone: "",
    codeSent: false,
    sending: false,
    submitting: false,
    countdown: 0,
    errorMessage: "",
  },

  countdownTimer: 0 as number,

  onLoad(query: Record<string, string | undefined>) {
    wx.setNavigationBarTitle({ title: query.ticket ? "注册新账号" : "创建 Wardora 账号" });
    this.setData({ ticket: query.ticket ?? "" });
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  },

  handleEmailInput(event: WechatMiniprogram.InputEvent) { this.setData({ email: event.detail.value }); },
  handleCodeInput(event: WechatMiniprogram.InputEvent) { this.setData({ emailCode: event.detail.value }); },
  handlePasswordInput(event: WechatMiniprogram.InputEvent) { this.setData({ password: event.detail.value }); },
  handleConfirmInput(event: WechatMiniprogram.InputEvent) { this.setData({ confirmPassword: event.detail.value }); },
  handlePhoneInput(event: WechatMiniprogram.InputEvent) { this.setData({ phone: event.detail.value }); },

  async sendCode(this: any) {
    if (this.data.sending || this.data.countdown > 0) return;
    const email = this.data.email.trim();
    if (!isEmail(email)) {
      this.setData({ errorMessage: "邮箱格式不正确。" });
      return;
    }
    const emailMasked = maskEmail(email);
    const confirmed = await confirmSend(emailMasked);
    if (!confirmed) return;
    this.setData({ sending: true, errorMessage: "" });
    try {
      await sendEmailCode({
        email,
        purpose: this.data.ticket ? "wechat_register" : "register",
        bindingTicket: this.data.ticket || undefined,
      });
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
    if (this.data.submitting) return;
    const email = this.data.email.trim();
    const phone = this.data.phone.trim();
    if (!isEmail(email)) return this.setData({ errorMessage: "邮箱格式不正确。" });
    if (!this.data.emailCode) return this.setData({ errorMessage: "请输入邮箱验证码。" });
    if (this.data.password.length < 8) return this.setData({ errorMessage: "密码至少需要 8 位。" });
    if (this.data.password !== this.data.confirmPassword) return this.setData({ errorMessage: "两次输入的密码不一致。" });
    this.setData({ submitting: true, errorMessage: "" });
    try {
      await registerWithEmail({
        bindingTicket: this.data.ticket || undefined,
        email,
        emailCode: this.data.emailCode.trim(),
        password: this.data.password,
        phone: phone || undefined,
      });
      wx.switchTab({ url: "/pages/wardrobe/index/index" });
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
