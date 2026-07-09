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

export function ChangePasswordView({
  auth,
  onBack,
  onDone,
}: {
  auth: WardrobeCloudAuth;
  onBack: () => void;
  onDone: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

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
          await auth.onChangePassword(currentPassword, newPassword);
          onDone();
        } catch (error) {
          const msg = error instanceof Error ? error.message : "修改失败，请稍后再试";
          setMessage(msg === "Invalid phone or password" ? "当前密码不正确，请重试" : msg);
        }
      }}
    >
      <SubPageHeader title="修改密码" onBack={onBack} />
      {message ? <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{message}</p> : null}
      <PasswordField label="当前密码" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
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
