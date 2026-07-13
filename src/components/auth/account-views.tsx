"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2, Lock, LogOut, Mail, MessageCircle, Phone, Smartphone, User } from "lucide-react";
import { getAuthUserDisplayName, type AuthUserSnapshot } from "@/lib/auth-session-store";
import * as authApi from "@/lib/cloud-auth-api";
import { useStableBackHandler } from "@/lib/use-stable-back-handler";

export interface WardrobeCloudAuth {
  user: AuthUserSnapshot;
  deviceId: string;
  deviceLabel: string;
  accessToken?: string;
  isBusy: boolean;
  onLogout: () => Promise<void>;
  onAccountDeleted: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<string>;
}

export function AccountManagementView({
  auth,
  onBack,
  onChangePassword,
  onDeleteAccount,
}: {
  auth: WardrobeCloudAuth;
  onBack: () => void;
  onChangePassword: () => void;
  onDeleteAccount: () => void;
}) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [security, setSecurity] = useState<authApi.AccountSecurityResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"email" | "phone" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editVerifyMode, setEditVerifyMode] = useState<"password" | "email">("password");
  const [editSending, setEditSending] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editCodeSent, setEditCodeSent] = useState(false);
  const [editCountdown, setEditCountdown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!auth.accessToken) return undefined;
    authApi.getAccountSecurity(auth.accessToken)
      .then((result) => {
        if (!cancelled) {
          setSecurity(result);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("账号安全信息暂时无法刷新");
      });
    return () => {
      cancelled = true;
    };
  }, [auth.accessToken]);

  useEffect(() => {
    if (editCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => setEditCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [editCountdown]);

  const emailMasked = security?.email.masked ?? auth.user.emailMasked;
  const phoneMasked = security?.phone.masked ?? auth.user.phoneMasked ?? auth.user.maskedPhone;
  const accountMutationBusy = auth.isBusy || editSaving || editSending;

  const handleBack = () => {
    if (accountMutationBusy) return;
    if (editMode) {
      setEditMode(null);
      return;
    }
    if (confirmingLogout) {
      setConfirmingLogout(false);
      return;
    }
    onBack();
  };

  useStableBackHandler(() => {
    handleBack();
    return true;
  }, true, 100);

  const openBindingEditor = (mode: "email" | "phone") => {
    setEditMode(mode);
    setEditValue("");
    setEditCode("");
    setEditPassword("");
    setEditVerifyMode("password");
    setEditCodeSent(false);
    setEditCountdown(0);
    setLoadError(null);
  };

  const sendBindingCode = async () => {
    if (!auth.accessToken || editSending || editCountdown > 0) return;
    if (editMode === "email" && !editValue.trim()) {
      setLoadError("请先输入新邮箱");
      return;
    }
    setEditSending(true);
    setLoadError(null);
    try {
      const response = editMode === "email"
        ? await authApi.requestEmailChangeCode(auth.accessToken, editValue.trim())
        : await authApi.requestAccountVerificationCode(auth.accessToken);
      setEditCodeSent(true);
      setEditCountdown(response.cooldownSeconds);
    } catch (error) {
      setLoadError(toAccountAuthMessage(error, "验证码发送失败，请稍后再试"));
    } finally {
      setEditSending(false);
    }
  };

  const saveBinding = async () => {
    if (!auth.accessToken || !editMode || editSaving) return;
    if (!editValue.trim()) {
      setLoadError(editMode === "email" ? "请输入新邮箱" : "请输入新手机号");
      return;
    }
    if (editMode === "email" && !/^\d{6}$/.test(editCode.trim())) {
      setLoadError("请输入新邮箱收到的 6 位验证码");
      return;
    }
    if (editMode === "phone" && editVerifyMode === "password" && editPassword.length < 8) {
      setLoadError("请输入当前账户密码");
      return;
    }
    if (editMode === "phone" && editVerifyMode === "email" && !/^\d{6}$/.test(editCode.trim())) {
      setLoadError("请输入 6 位邮箱验证码");
      return;
    }
    setEditSaving(true);
    setLoadError(null);
    let writeCompleted = false;
    try {
      if (editMode === "email") {
        await authApi.changeEmail({ accessToken: auth.accessToken, email: editValue.trim(), emailCode: editCode.trim() });
      } else {
        await authApi.changePhone({
          accessToken: auth.accessToken,
          phone: editValue.trim(),
          ...(editVerifyMode === "password" ? { currentPassword: editPassword } : { emailCode: editCode.trim() }),
        });
      }
      writeCompleted = true;
      const refreshed = await authApi.getAccountSecurity(auth.accessToken);
      setSecurity(refreshed);
      setEditMode(null);
    } catch (error) {
      setLoadError(writeCompleted
        ? "修改已提交，但服务器状态暂未读回；当前输入已保留，请检查网络后刷新账号安全信息"
        : toAccountAuthMessage(error, "保存失败，请稍后再试"));
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5 pb-[calc(112px+env(safe-area-inset-bottom))]">
      <SubPageHeader title="账号安全" onBack={handleBack} disabled={accountMutationBusy} />
      <article className="surface rounded-lg px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-denim/10 text-denim">
            <User size={20} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{getAuthUserDisplayName(auth.user)}</h2>
            <p className="mt-1 text-xs text-ink/55">状态：已登录</p>
            <p className="mt-1 truncate text-[11px] text-ink/45">设备：{auth.deviceLabel}</p>
          </div>
        </div>
      </article>

      {loadError ? <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{loadError}</p> : null}

      <section className="grid gap-2">
        <SecurityRow
          icon={<Mail size={16} aria-hidden="true" />}
          title="邮箱"
          value={emailMasked ?? "未绑定"}
          note={security?.email.verified ?? auth.user.emailVerified ? "已验证，主认证身份" : "未验证"}
          action={<button type="button" onClick={() => openBindingEditor("email")} disabled={accountMutationBusy} className="shrink-0 text-xs font-semibold text-denim disabled:opacity-45">修改</button>}
        />
        <SecurityRow
          icon={<Phone size={16} aria-hidden="true" />}
          title="手机号"
          value={phoneMasked || "未设置"}
          note={security?.phone.bound || auth.user.phoneMasked ? "可作为手机号加密码登录名，未标记为已验证" : "可在后续版本绑定为登录名"}
          action={<button type="button" onClick={() => openBindingEditor("phone")} disabled={accountMutationBusy} className="shrink-0 text-xs font-semibold text-denim disabled:opacity-45">{phoneMasked ? "修改" : "绑定"}</button>}
        />
        <SecurityRow
          icon={<MessageCircle size={16} aria-hidden="true" />}
          title="微信"
          value={security?.wechat.bound ? "已绑定" : "未绑定"}
          note={security?.wechat.bound ? "小程序可用微信快捷登录" : "首次小程序微信登录时可绑定此账号"}
        />
        <SecurityRow
          icon={<Lock size={16} aria-hidden="true" />}
          title="密码"
          value={security?.password.set === false ? "未设置" : "已设置"}
          note={security?.password.changedAt ? `最近更新 ${formatDate(security.password.changedAt)}` : "用于邮箱/手机号密码登录"}
        />
        <SecurityRow
          icon={<Smartphone size={16} aria-hidden="true" />}
          title="当前设备"
          value={auth.deviceLabel}
          note="本设备使用独立 token，会话可单独退出"
        />
      </section>

      {editMode ? (
        <section className="grid gap-2 rounded-lg border border-ink/10 bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{editMode === "email" ? "修改邮箱" : "绑定 / 修改手机号"}</p>
              <p className="mt-1 text-xs text-ink/55">{editMode === "email" ? "验证码发送到新邮箱后才能保存" : "操作需通过当前密码或邮箱验证码验证"}</p>
            </div>
            <button type="button" onClick={() => { if (!accountMutationBusy) setEditMode(null); }} disabled={accountMutationBusy} className="text-xs text-ink/55 disabled:opacity-45">取消</button>
          </div>
          <input
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            type={editMode === "email" ? "email" : "tel"}
            placeholder={editMode === "email" ? "新邮箱" : "新手机号"}
            disabled={accountMutationBusy}
            className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
          />
          {editMode === "phone" ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-mist p-1">
              <button type="button" onClick={() => setEditVerifyMode("password")} disabled={accountMutationBusy} className={`h-9 rounded-lg text-xs font-semibold disabled:opacity-45 ${editVerifyMode === "password" ? "bg-denim text-white" : "text-ink/55"}`}>账户密码</button>
              <button type="button" onClick={() => setEditVerifyMode("email")} disabled={accountMutationBusy} className={`h-9 rounded-lg text-xs font-semibold disabled:opacity-45 ${editVerifyMode === "email" ? "bg-denim text-white" : "text-ink/55"}`}>邮箱验证码</button>
            </div>
          ) : null}
          {editMode === "email" || editVerifyMode === "email" ? (
            <div className="flex gap-2">
              <input value={editCode} onChange={(event) => setEditCode(event.target.value)} disabled={accountMutationBusy} inputMode="numeric" placeholder="6 位验证码" className="h-11 min-w-0 flex-1 rounded-lg border border-ink/10 px-3 text-base outline-none focus:border-denim disabled:opacity-55" />
              <button type="button" onClick={sendBindingCode} disabled={accountMutationBusy || editCountdown > 0 || (editMode === "email" && !editValue)} className="h-11 shrink-0 rounded-lg bg-denim px-3 text-xs font-semibold text-white disabled:opacity-35">{editSending ? "发送中" : editCountdown > 0 ? `${editCountdown}s` : editCodeSent ? "再次发送" : "发送验证码"}</button>
            </div>
          ) : (
            <input value={editPassword} onChange={(event) => setEditPassword(event.target.value)} disabled={accountMutationBusy} type="password" placeholder="当前账户密码" className="h-11 w-full rounded-lg border border-ink/10 px-3 text-base outline-none focus:border-denim disabled:opacity-55" />
          )}
          {loadError ? <p className="text-xs text-clay">{loadError}</p> : null}
          <button type="button" onClick={saveBinding} disabled={accountMutationBusy} className="h-11 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-35">{editSaving ? "保存中…" : "保存修改"}</button>
        </section>
      ) : null}

      <div className="grid gap-2">
        <button
          type="button"
          data-parity-id="parity.app.app.src.components.auth.account.views.403282308f" onClick={onChangePassword}
          disabled={accountMutationBusy || editMode !== null}
          className="flex h-12 items-center justify-between rounded-lg border border-ink/10 bg-white px-4 text-sm font-semibold disabled:opacity-45"
        >
          <span className="inline-flex items-center gap-2"><Lock size={16} aria-hidden="true" /> 修改密码</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        {confirmingLogout ? (
          <div className="grid gap-2 rounded-lg border border-clay/30 bg-clay/5 p-3">
            <p className="text-sm font-semibold text-clay">退出登录？</p>
            <p className="text-xs text-ink/60">退出后将清空当前登录会话；重新登录后会从服务器读取衣橱数据。</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-parity-id="parity.app.app.src.components.auth.account.views.6d20ff8799" onClick={() => setConfirmingLogout(false)} disabled={auth.isBusy} className="h-10 rounded-lg border border-ink/10 text-sm disabled:opacity-60">取消</button>
              <button
                type="button"
                data-parity-id="parity.app.app.src.components.auth.account.views.fe4acff3e3" onClick={async () => { await auth.onLogout(); setConfirmingLogout(false); }}
                disabled={auth.isBusy}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-clay text-sm font-semibold text-white disabled:opacity-60"
              >
                {auth.isBusy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <button type="button" data-parity-id="parity.app.app.src.components.auth.account.views.a6b890e10f" onClick={() => setConfirmingLogout(true)} disabled={accountMutationBusy || editMode !== null} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white text-sm font-semibold disabled:opacity-45">
            <LogOut size={16} aria-hidden="true" />退出登录
          </button>
        )}
      </div>
      <button
        type="button"
        data-parity-id="parity.app.app.src.components.auth.account.views.42eb4fb5ac" onClick={onDeleteAccount}
        disabled={accountMutationBusy || editMode !== null}
        className="mx-auto mt-6 flex min-h-11 items-center bg-transparent px-4 text-sm font-medium text-red-600 underline decoration-red-600/70 underline-offset-4 active:text-red-700 disabled:opacity-45"
      >
        注销账号
      </button>
    </div>
  );
}

function SecurityRow({
  icon,
  title,
  value,
  note,
  action,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  note: string;
  action?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-ink/10 bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mist text-denim">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <div className="flex min-w-0 items-center gap-2"><p className="min-w-0 truncate text-right text-sm font-semibold text-ink/75">{value}</p>{action}</div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink/50">{note}</p>
        </div>
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function toAccountAuthMessage(error: unknown, fallback: string): string {
  if (error instanceof authApi.CloudAuthApiError) {
    if (error.code === "invalid_credentials") return "当前密码不正确，请重试";
    if (error.code === "email_unverified") return "邮箱尚未验证，暂不能使用邮箱验证码修改密码";
    if (error.code === "email_code_invalid") return "邮箱验证码不正确";
    if (error.code === "email_code_expired") return "邮箱验证码已过期，请重新获取";
    if (error.code === "email_code_attempts_exceeded") return "验证码错误次数过多，请重新获取";
    if (error.code === "email_rate_limited") return "验证码发送过于频繁，请稍后再试";
    if (error.code === "email_code_rate_limited") return "验证码请求过多，请稍后再试";
    if (error.code === "email_provider_not_configured") return "邮件服务尚未配置，请稍后再试";
    if (error.code === "email_provider_error") return "邮件发送失败，请稍后再试";
    if (error.code === "network_unavailable") return "网络连接失败，请检查网络后重试";
    if (error.code === "service_unavailable") return "账号服务暂时不可用，请稍后重试";
  }
  return error instanceof Error ? error.message : fallback;
}

export function ChangePasswordView({
  auth,
  onBack,
  onDone,
}: {
  auth: WardrobeCloudAuth;
  onBack: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"current" | "email">("current");
  const [currentPassword, setCurrentPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const emailMasked = auth.user.emailMasked;
  const passwordMutationBusy = auth.isBusy || sendingCode || submitting;

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = window.setTimeout(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const sendChangeCode = async () => {
    if (!auth.accessToken || sendingCode || countdown > 0) return;
    setSendingCode(true);
    setMessage(null);
    try {
      const response = await authApi.requestPasswordChangeCode(auth.accessToken);
      setCodeSent(true);
      setCountdown(response.cooldownSeconds);
    } catch (error) {
      setMessage(toAccountAuthMessage(error, "验证码发送失败，请稍后再试"));
    } finally {
      setSendingCode(false);
    }
  };

  const handleBack = () => {
    if (passwordMutationBusy) return;
    onBack();
  };

  useStableBackHandler(() => {
    handleBack();
    return true;
  }, true, 100);

  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5"
      data-parity-id="parity.app.app.src.components.auth.account.views.d784e7bb96" onSubmit={async (event) => {
        event.preventDefault();
        setMessage(null);
        if (newPassword.length < 8) {
          setMessage("新密码至少 8 位");
          return;
        }
        if (newPassword !== confirmPassword) {
          setMessage("两次输入的新密码不一致");
          return;
        }
        if (mode === "email" && !auth.accessToken) {
          setMessage("请重新登录后再修改密码");
          return;
        }
        setSubmitting(true);
        let writeCompleted = false;
        try {
          let readbackAccessToken: string;
          if (mode === "current") {
            readbackAccessToken = await auth.onChangePassword(currentPassword, newPassword);
          } else {
            if (!/^\d{6}$/.test(emailCode.trim())) {
              setMessage("请输入 6 位邮箱验证码");
              return;
            }
            const accessToken = auth.accessToken;
            if (!accessToken) {
              setMessage("请重新登录后再修改密码");
              return;
            }
            await authApi.changePasswordWithEmailCode({
              accessToken,
              emailCode: emailCode.trim(),
              newPassword,
            });
            readbackAccessToken = accessToken;
          }
          writeCompleted = true;
          await authApi.getAccountSecurity(readbackAccessToken);
          onDone();
        } catch (error) {
          const msg = writeCompleted
            ? "新密码已提交，但服务器状态暂未读回；当前页已保留，请检查网络后重新登录验证"
            : toAccountAuthMessage(error, "修改失败，请稍后再试");
          setMessage(msg === "Invalid phone or password" ? "当前密码不正确，请重试" : msg);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <SubPageHeader title="修改密码" onBack={handleBack} disabled={passwordMutationBusy} />
      {message ? <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{message}</p> : null}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1">
        <button
          type="button"
          data-parity-id="parity.app.app.src.components.auth.account.views.26c700e3e0" onClick={() => { setMode("current"); setMessage(null); }}
          disabled={passwordMutationBusy}
          className={`h-10 rounded-lg text-sm font-semibold disabled:opacity-45 ${mode === "current" ? "bg-denim text-white" : "border border-ink/10 bg-white text-ink/55"}`}
        >
          当前密码
        </button>
        <button
          type="button"
          data-parity-id="parity.app.app.src.components.auth.account.views.8fde9a8cfa" onClick={() => { setMode("email"); setMessage(null); }}
          disabled={passwordMutationBusy}
          className={`h-10 rounded-lg text-sm font-semibold disabled:opacity-45 ${mode === "email" ? "bg-denim text-white" : "border border-ink/10 bg-white text-ink/55"}`}
        >
          邮箱验证码
        </button>
      </div>
      {mode === "current" ? (
        <PasswordField label="当前密码" value={currentPassword} data-parity-id="parity.app.app.src.components.auth.account.views.4d316b2d8d" onChange={setCurrentPassword} autoComplete="current-password" disabled={passwordMutationBusy} />
      ) : (
        <section className="grid gap-2 rounded-lg border border-ink/10 bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">邮箱</p>
              <p className="mt-1 truncate text-xs text-ink/55">{emailMasked ?? "未绑定邮箱"}</p>
            </div>
            <button
              type="button"
              data-parity-id="parity.app.app.src.components.auth.account.views.62684c1a0d" onClick={sendChangeCode}
              disabled={!emailMasked || !auth.accessToken || passwordMutationBusy || countdown > 0}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-denim px-3 text-xs font-semibold text-white disabled:bg-denim/35"
            >
              {sendingCode ? "发送中" : countdown > 0 ? `${countdown}s` : codeSent ? "再次发送" : "发送验证码"}
            </button>
          </div>
          {codeSent ? (
            <label className="grid gap-1.5 text-sm font-medium">
              邮箱验证码
              <input
                value={emailCode}
                data-parity-id="parity.app.app.src.components.auth.account.views.801a5126de" onChange={(event) => setEmailCode(event.target.value)}
                disabled={passwordMutationBusy}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              />
            </label>
          ) : null}
        </section>
      )}
      <PasswordField label="新密码" value={newPassword} data-parity-id="parity.app.app.src.components.auth.account.views.3800000c38" onChange={setNewPassword} autoComplete="new-password" disabled={passwordMutationBusy} />
      <PasswordField label="确认新密码" value={confirmPassword} data-parity-id="parity.app.app.src.components.auth.account.views.a097e02bc6" onChange={setConfirmPassword} autoComplete="new-password" disabled={passwordMutationBusy} />
      <button
        type="submit"
        disabled={passwordMutationBusy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-60"
      >
        {auth.isBusy || submitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        保存新密码
      </button>
    </form>
  );
}

function SubPageHeader({ title, onBack, disabled = false }: { title: string; onBack: () => void; disabled?: boolean }) {
  return (
    <header className="flex h-14 items-center gap-2 px-1 pt-2">
      <button type="button" data-parity-id="parity.app.app.src.components.auth.account.views.c6bfc649ca" onClick={onBack} disabled={disabled} className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink/65 app-press-feedback disabled:opacity-45" aria-label="返回">
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{title}</h1>
    </header>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input
        value={value}
        data-parity-id="parity.app.app.src.components.auth.account.views.f612c52b87" onChange={(event) => onChange(event.target.value)}
        type="password"
        autoComplete={autoComplete}
        disabled={disabled}
        className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim disabled:opacity-55"
      />
    </label>
  );
}
