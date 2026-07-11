import { clearMiniMaxSettings } from "../../../services/ai";
import {
  confirmAccountDeletion,
  getAccountDeletionStatus,
  getAccountSecurity,
  requestAccountDeletionEmailCode,
  verifyAccountDeletion,
  verifyAccountDeletionWithWechat,
  type AccountSecurityResponse,
} from "../../../services/auth";
import { HttpError } from "../../../services/http";
import { clearSession, isLoggedIn } from "../../../stores/session";

type Stage = "notice" | "choice" | "email" | "password" | "final" | "processing" | "completed" | "failed";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "身份验证失败，请检查后重试。",
  email_code_invalid: "邮箱验证码不正确。",
  email_code_expired: "邮箱验证码已过期，请重新获取。",
  email_code_attempts_exceeded: "验证码错误次数过多，请重新获取。",
  email_rate_limited: "验证码请求过于频繁，请稍后再试。",
  email_code_rate_limited: "验证码请求过多，请稍后再试。",
  wechat_code_invalid: "微信身份验证已过期，请重新验证。",
  wechat_service_unavailable: "微信身份验证暂时不可用，请选择其他方式。",
  account_deletion_method_unavailable: "当前验证方式未绑定，请选择其他方式。",
  account_deletion_authorization_invalid: "身份验证已过期，请重新验证。",
};

Page({
  data: {
    stage: "notice" as Stage,
    loading: false,
    security: null as AccountSecurityResponse | null,
    emailMasked: "已绑定邮箱",
    emailCode: "",
    currentPassword: "",
    authorizationToken: "",
    receiptToken: "",
    referenceCode: "",
    finalConfirmed: false,
    codeSent: false,
    sendingCode: false,
    countdown: 0,
    errorMessage: "",
  },

  countdownTimer: 0 as number,
  pollTimer: 0 as number,

  onLoad() {
    wx.setNavigationBarTitle({ title: "注销账号" });
    if (!isLoggedIn()) {
      wx.redirectTo({ url: "/pages/login/index" });
      return;
    }
    this.loadSecurity();
  },

  onUnload() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
  },

  async loadSecurity(this: any) {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const security = await getAccountSecurity();
      this.setData({ security, emailMasked: security.email.masked ?? "已绑定邮箱" });
    } catch (error) {
      this.setData({ errorMessage: messageFor(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  continueFromNotice() { this.setData({ stage: "choice", errorMessage: "" }); },
  cancelDeletion() { wx.navigateBack({ delta: 1 }); },
  chooseEmail() { this.setData({ stage: "email", errorMessage: "" }); },
  choosePassword() { this.setData({ stage: "password", errorMessage: "" }); },
  backToChoice() { this.setData({ stage: "choice", errorMessage: "", finalConfirmed: false }); },
  handleEmailCode(event: WechatMiniprogram.InputEvent) { this.setData({ emailCode: event.detail.value.replace(/\D/g, "").slice(0, 6) }); },
  handlePassword(event: WechatMiniprogram.InputEvent) { this.setData({ currentPassword: event.detail.value }); },
  handleFinalConfirm(event: { detail: { value: string[] } }) { this.setData({ finalConfirmed: event.detail.value.includes("confirmed") }); },

  async sendEmailCode(this: any) {
    if (this.data.sendingCode || this.data.countdown > 0) return;
    this.setData({ sendingCode: true, errorMessage: "" });
    try {
      const result = await requestAccountDeletionEmailCode();
      this.setData({ codeSent: true, countdown: result.cooldownSeconds });
      this.startCountdown();
    } catch (error) {
      this.setData({ errorMessage: messageFor(error) });
    } finally {
      this.setData({ sendingCode: false });
    }
  },

  startCountdown(this: any) {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      const countdown = Math.max(0, this.data.countdown - 1);
      this.setData({ countdown });
      if (countdown === 0 && this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = 0;
      }
    }, 1000) as unknown as number;
  },

  verifyEmail(this: any) {
    if (!/^\d{6}$/.test(this.data.emailCode)) return this.setData({ errorMessage: "请输入 6 位邮箱验证码。" });
    return this.verify(() => verifyAccountDeletion({ method: "email", emailCode: this.data.emailCode }));
  },

  verifyPassword(this: any) {
    if (this.data.currentPassword.length < 8) return this.setData({ errorMessage: "请输入当前密码。" });
    return this.verify(() => verifyAccountDeletion({ method: "password", currentPassword: this.data.currentPassword }));
  },

  verifyWechat(this: any) {
    return this.verify(() => verifyAccountDeletionWithWechat());
  },

  async verify(this: any, action: () => Promise<{ authorizationToken: string }>) {
    if (this.data.loading) return;
    this.setData({ loading: true, errorMessage: "" });
    try {
      const result = await action();
      this.setData({ authorizationToken: result.authorizationToken, stage: "final", finalConfirmed: false });
    } catch (error) {
      this.setData({ errorMessage: messageFor(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  async confirmDeletion(this: any) {
    if (!this.data.finalConfirmed || !this.data.authorizationToken || this.data.loading) return;
    this.setData({ loading: true, errorMessage: "" });
    try {
      const result = await confirmAccountDeletion(this.data.authorizationToken);
      clearMiniMaxSettings();
      clearSession();
      this.setData({
        receiptToken: result.receiptToken,
        stage: result.status === "completed" ? "completed" : "processing",
      });
      if (result.status === "processing") this.pollStatus();
    } catch (error) {
      this.setData({ errorMessage: messageFor(error) });
    } finally {
      this.setData({ loading: false });
    }
  },

  async pollStatus(this: any) {
    if (!this.data.receiptToken || this.data.stage !== "processing") return;
    try {
      const result = await getAccountDeletionStatus(this.data.receiptToken);
      this.setData({ referenceCode: result.referenceCode ?? "" });
      if (result.status === "completed" || result.status === "failed") {
        this.setData({ stage: result.status });
        return;
      }
    } catch {
      // 账号已停用；匿名回执可以继续安全轮询。
    }
    this.pollTimer = setTimeout(() => this.pollStatus(), 2000) as unknown as number;
  },

  returnToLogin() {
    clearSession();
    wx.redirectTo({ url: "/pages/login/index" });
  },
});

function messageFor(error: unknown): string {
  if (error instanceof HttpError) return ERROR_MESSAGES[error.code] ?? error.message;
  return error instanceof Error ? error.message : "暂时无法注销，请稍后重试。";
}
