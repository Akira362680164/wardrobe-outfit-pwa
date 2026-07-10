"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2, Lock, LogOut, Mail, MessageCircle, Phone, Smartphone, User } from "lucide-react";
import { getAuthUserDisplayName, type AuthUserSnapshot } from "@/lib/auth-session-store";
import * as authApi from "@/lib/cloud-auth-api";

export interface WardrobeCloudAuth {
  user: AuthUserSnapshot;
  deviceId: string;
  deviceLabel: string;
  accessToken?: string;
  isBusy: boolean;
  onLogout: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export function AccountManagementView({
  auth,
  onBack,
  onChangePassword,
}: {
  auth: WardrobeCloudAuth;
  onBack: () => void;
  onChangePassword: () => void;
}) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [security, setSecurity] = useState<authApi.AccountSecurityResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const emailMasked = security?.email.masked ?? auth.user.emailMasked;
  const phoneMasked = security?.phone.masked ?? auth.user.phoneMasked ?? auth.user.maskedPhone;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5">
      <SubPageHeader title="账号安全" onBack={onBack} />
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
        />
        <SecurityRow
          icon={<Phone size={16} aria-hidden="true" />}
          title="手机号"
          value={phoneMasked || "未设置"}
          note={security?.phone.bound || auth.user.phoneMasked ? "可作为手机号加密码登录名，未标记为已验证" : "可在后续版本绑定为登录名"}
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

      <div className="grid gap-2">
        <button
          type="button"
          onClick={onChangePassword}
          className="flex h-12 items-center justify-between rounded-lg border border-ink/10 bg-white px-4 text-sm font-semibold"
        >
          <span className="inline-flex items-center gap-2"><Lock size={16} aria-hidden="true" /> 修改密码</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        {confirmingLogout ? (
          <div className="grid gap-2 rounded-lg border border-clay/30 bg-clay/5 p-3">
            <p className="text-sm font-semibold text-clay">退出登录？</p>
            <p className="text-xs text-ink/60">退出后将清空当前登录会话；重新登录后会从服务器读取衣橱数据。</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmingLogout(false)} disabled={auth.isBusy} className="h-10 rounded-lg border border-ink/10 text-sm disabled:opacity-60">取消</button>
              <button
                type="button"
                onClick={async () => { setConfirmingLogout(false); await auth.onLogout(); }}
                disabled={auth.isBusy}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-clay text-sm font-semibold text-white disabled:opacity-60"
              >
                {auth.isBusy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingLogout(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-ink/10 bg-white text-sm font-semibold">
            <LogOut size={16} aria-hidden="true" />退出登录
          </button>
        )}
      </div>
    </div>
  );
}

function SecurityRow({
  icon,
  title,
  value,
  note,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  note: string;
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
            <p className="min-w-0 truncate text-right text-sm font-semibold text-ink/75">{value}</p>
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
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const emailMasked = auth.user.emailMasked;

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
      await authApi.requestPasswordChangeCode(auth.accessToken);
      setCodeSent(true);
      setCountdown(30);
    } catch (error) {
      setMessage(toAccountAuthMessage(error, "验证码发送失败，请稍后再试"));
    } finally {
      setSendingCode(false);
    }
  };

  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5"
      onSubmit={async (event) => {
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
        try {
          if (mode === "current") {
            await auth.onChangePassword(currentPassword, newPassword);
          } else {
            if (!auth.accessToken) {
              setMessage("请重新登录后再修改密码");
              return;
            }
            if (!/^\d{6}$/.test(emailCode.trim())) {
              setMessage("请输入 6 位邮箱验证码");
              return;
            }
            await authApi.changePasswordWithEmailCode({
              accessToken: auth.accessToken,
              emailCode: emailCode.trim(),
              newPassword,
            });
          }
          onDone();
        } catch (error) {
          const msg = toAccountAuthMessage(error, "修改失败，请稍后再试");
          setMessage(msg === "Invalid phone or password" ? "当前密码不正确，请重试" : msg);
        }
      }}
    >
      <SubPageHeader title="修改密码" onBack={onBack} />
      {message ? <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{message}</p> : null}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1">
        <button
          type="button"
          onClick={() => { setMode("current"); setMessage(null); }}
          className={`h-10 rounded-lg text-sm font-semibold ${mode === "current" ? "bg-[#2F6B4F] text-white" : "border border-ink/10 bg-white text-ink/55"}`}
        >
          当前密码
        </button>
        <button
          type="button"
          onClick={() => { setMode("email"); setMessage(null); }}
          className={`h-10 rounded-lg text-sm font-semibold ${mode === "email" ? "bg-[#2F6B4F] text-white" : "border border-ink/10 bg-white text-ink/55"}`}
        >
          邮箱验证码
        </button>
      </div>
      {mode === "current" ? (
        <PasswordField label="当前密码" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
      ) : (
        <section className="grid gap-2 rounded-lg border border-ink/10 bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">邮箱</p>
              <p className="mt-1 truncate text-xs text-ink/55">{emailMasked ?? "未绑定邮箱"}</p>
            </div>
            <button
              type="button"
              onClick={sendChangeCode}
              disabled={!emailMasked || !auth.accessToken || sendingCode || countdown > 0}
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
                onChange={(event) => setEmailCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
              />
            </label>
          ) : null}
        </section>
      )}
      <PasswordField label="新密码" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
      <PasswordField label="确认新密码" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
      <button
        type="submit"
        disabled={auth.isBusy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-60"
      >
        {auth.isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        保存新密码
      </button>
    </form>
  );
}

function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-14 items-center gap-2 px-1 pt-2">
      <button type="button" onClick={onBack} className="grid h-10 w-10 place-items-center ui-control-radius bg-transparent text-ink/65 active:scale-95" aria-label="返回">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        autoComplete={autoComplete}
        className="h-11 w-full rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
      />
    </label>
  );
}
