import { HttpError } from "../../../../services/http";
import {
  changeEmail,
  changePhone,
  getAccountSecurity,
  rebindWechat,
  requestAccountVerificationCode,
  requestEmailChangeCode,
  unbindWechat,
  type AccountSecurityResponse,
} from "../../../../services/auth";
import { getSession } from "../../../../stores/session";

type AccountEditKind = "email" | "phone" | "wechat";
type VerifyMode = "password" | "email";

const APP_ID = "wx14a1a85b7b3844d0";

Page({
  data: {
    kind: "email" as AccountEditKind,
    title: "修改邮箱",
    description: "输入新邮箱并完成邮箱验证码验证。",
    currentValue: "",
    targetValue: "",
    emailCode: "",
    currentPassword: "",
    verifyMode: "password" as VerifyMode,
    emailMasked: "未绑定邮箱",
    codeSent: false,
    countdown: 0,
    sending: false,
    saving: false,
    errorMessage: "",
    confirmOpen: false,
    security: null as AccountSecurityResponse | null,
  },

  countdownTimer: 0 as number,

  onLoad(this: any, query?: { kind?: AccountEditKind }) {
    const kind = query?.kind === "phone" || query?.kind === "wechat" ? query.kind : "email";
    const titles: Record<AccountEditKind, { title: string; description: string }> = {
      email: { title: "修改邮箱", description: "输入新邮箱并完成邮箱验证码验证。" },
      phone: { title: "绑定 / 修改手机号", description: "手机号作为登录名，操作需通过密码或邮箱验证码验证。" },
      wechat: { title: "微信账号管理", description: "可解绑当前微信，或用新的微信登录身份换绑。" },
    };
    this.setData({ kind, ...titles[kind], emailMasked: getSession()?.user?.emailMasked ?? "未绑定邮箱" });
    this.refreshSecurity();
  },

  onUnload(this: any) {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  },

  async refreshSecurity(this: any) {
    try {
      const security = await getAccountSecurity();
      this.setData({
        security,
        currentValue: this.data.kind === "phone" ? (security.phone.masked ?? "未绑定") : (security.email.masked ?? "未绑定"),
      });
    } catch {
      // The form remains usable; the server is the source of truth on submit.
    }
  },

  handleTargetInput(this: any, event: WechatMiniprogram.InputEvent) { this.setData({ targetValue: event.detail.value }); },
  handleCodeInput(this: any, event: WechatMiniprogram.InputEvent) { this.setData({ emailCode: event.detail.value }); },
  handlePasswordInput(this: any, event: WechatMiniprogram.InputEvent) { this.setData({ currentPassword: event.detail.value }); },
  switchVerifyMode(this: any, event: any) { this.setData({ verifyMode: event.currentTarget.dataset.mode, errorMessage: "" }); },

  async sendCode(this: any) {
    if (this.data.sending || this.data.countdown > 0) return;
    this.setData({ sending: true, errorMessage: "" });
    try {
      const response = this.data.kind === "email"
        ? await requestEmailChangeCode(this.data.targetValue.trim())
        : await requestAccountVerificationCode();
      this.setData({ codeSent: true });
      this.startCountdown(response.cooldownSeconds);
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ sending: false });
    }
  },

  startCountdown(this: any, seconds: number) {
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

  submit(this: any) {
    if (this.data.kind === "wechat") return this.setData({ confirmOpen: true });
    void this.saveBinding();
  },

  closeConfirm(this: any) { if (!this.data.saving) this.setData({ confirmOpen: false }); },

  async confirmWechat(this: any) {
    this.setData({ confirmOpen: false, saving: true, errorMessage: "" });
    try {
      if (this.data.security?.wechat.bound) {
        await unbindWechat({ appId: APP_ID, ...await this.reauthPayload() });
        wx.showToast({ title: "微信已解绑", icon: "none" });
      } else {
        const loginCode = await getLoginCode();
        await rebindWechat({ ...await this.reauthPayload(), appId: APP_ID, loginCode });
        wx.showToast({ title: "微信已换绑", icon: "none" });
      }
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ saving: false });
    }
  },

  async saveBinding(this: any) {
    if (this.data.saving) return;
    const target = this.data.targetValue.trim();
    if (!target) return this.setData({ errorMessage: this.data.kind === "email" ? "请输入新邮箱。" : "请输入手机号。" });
    if (this.data.kind === "email" && !/^\S+@\S+\.\S+$/.test(target)) return this.setData({ errorMessage: "请输入有效邮箱。" });
    if (this.data.kind === "phone" && this.data.verifyMode === "password" && this.data.currentPassword.length < 8) return this.setData({ errorMessage: "请输入当前密码。" });
    if (this.data.kind === "phone" && this.data.verifyMode === "email" && !/^\d{6}$/.test(this.data.emailCode.trim())) return this.setData({ errorMessage: "请输入 6 位邮箱验证码。" });
    if (this.data.kind === "email" && !/^\d{6}$/.test(this.data.emailCode.trim())) return this.setData({ errorMessage: "请输入新邮箱收到的 6 位验证码。" });
    this.setData({ saving: true, errorMessage: "" });
    try {
      if (this.data.kind === "email") {
        await changeEmail({ email: target, emailCode: this.data.emailCode.trim() });
      } else {
        await changePhone({ phone: target, ...await this.reauthPayload() });
      }
      wx.showToast({ title: this.data.kind === "email" ? "邮箱已更新" : "手机号已更新", icon: "none" });
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      this.setData({ errorMessage: errorMessage(error) });
    } finally {
      this.setData({ saving: false });
    }
  },

  reauthPayload(this: any): Promise<{ currentPassword?: string; emailCode?: string }> {
    return Promise.resolve(this.data.verifyMode === "password"
      ? { currentPassword: this.data.currentPassword }
      : { emailCode: this.data.emailCode.trim() });
  },
});

function getLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => wx.login({ success: (result) => result.code ? resolve(result.code) : reject(new Error("微信登录授权失败")), fail: reject }));
}

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.code === "email_already_registered") return "该邮箱已绑定其他账号。";
    if (error.code === "phone_already_registered") return "该手机号已绑定其他账号。";
    if (error.code === "invalid_credentials") return "密码不正确。";
    if (error.code === "email_code_invalid") return "邮箱验证码不正确。";
    if (error.code === "email_code_expired") return "邮箱验证码已过期，请重新获取。";
    if (error.code === "wechat_already_bound") return "该微信已绑定其他账号。";
    return error.message;
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}
