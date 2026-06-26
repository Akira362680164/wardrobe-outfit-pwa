"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, Lock, Shield, User } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");

  if (auth.phase === "authenticated") return <>{children}</>;
  if (auth.phase === "initializing") return <AuthShell><LoadingState /></AuthShell>;
  if (auth.phase === "pending_verification") return <AuthShell><PendingVerificationForm /></AuthShell>;
  if (auth.phase === "blocked") return <AuthShell><BlockedLocalOwner /></AuthShell>;

  return (
    <AuthShell>
      {mode === "login" ? (
        <LoginForm onSwitch={() => setMode("register")} />
      ) : (
        <RegisterForm onSwitch={() => setMode("login")} />
      )}
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-linen px-4 py-5 text-ink">
      <div className="mx-auto grid min-h-[calc(100dvh-40px)] w-full max-w-md content-center">
        <section className="surface rounded-lg px-4 py-5 shadow-soft">
          {children}
        </section>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <div className="grid place-items-center gap-3 py-10 text-center">
      <Loader2 className="animate-spin text-denim" size={26} aria-hidden="true" />
      <p className="text-sm text-ink/60">正在恢复账号状态</p>
    </div>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const auth = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await auth.login(phone, password).catch(() => undefined);
      }}
    >
      <AuthHeader title="登录衣橱账号" subtitle="登录后打开本机账号工作区" />
      <AuthError />
      <TextField label="手机号" value={phone} onChange={setPhone} autoComplete="tel" inputMode="tel" />
      <TextField label="密码" value={password} onChange={setPassword} type="password" autoComplete="current-password" />
      <button type="submit" disabled={auth.isBusy} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-60">
        {auth.isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        登录
      </button>
      <button type="button" onClick={onSwitch} className="h-10 text-sm font-semibold text-denim">
        还没有账号，去注册
      </button>
    </form>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const auth = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setLocalError(null);
        if (password !== confirm) {
          setLocalError("两次输入的密码不一致");
          return;
        }
        if (!accepted) {
          setLocalError("请先同意用户协议和隐私政策");
          return;
        }
        await auth.register(phone, password).catch(() => undefined);
      }}
    >
      <AuthHeader title="注册衣橱账号" subtitle="阶段 1A 使用开发验证，暂不接入短信或微信验证" />
      <AuthError override={localError} />
      <TextField label="手机号" value={phone} onChange={setPhone} autoComplete="tel" inputMode="tel" />
      <TextField label="密码" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
      <TextField label="确认密码" value={confirm} onChange={setConfirm} type="password" autoComplete="new-password" />
      <div className="flex items-start gap-2 text-xs leading-relaxed text-ink/60">
        <input
          id="auth-terms-accepted"
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-denim"
        />
        <span>
          <label htmlFor="auth-terms-accepted">我已阅读并同意</label>
          <Link href="/legal/terms" className="font-semibold text-denim underline-offset-2 hover:underline">
            用户协议
          </Link>
          <span>和</span>
          <Link href="/legal/privacy" className="font-semibold text-denim underline-offset-2 hover:underline">
            隐私政策
          </Link>
        </span>
      </div>
      <button type="submit" disabled={auth.isBusy} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-60">
        {auth.isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <User size={16} aria-hidden="true" />}
        注册
      </button>
      <button type="button" onClick={onSwitch} className="h-10 text-sm font-semibold text-denim">
        已有账号，去登录
      </button>
    </form>
  );
}

function PendingVerificationForm() {
  const auth = useAuth();
  const pending = auth.pendingRegistration;

  return (
    <div className="grid gap-4">
      <AuthHeader title="等待账号验证" subtitle="开发阶段由服务器 CLI 完成验证" />
      <AuthError />
      <div className="rounded-lg border border-denim/12 bg-denim/6 px-3 py-3 text-sm">
        <p className="font-semibold text-ink">{pending?.maskedPhone ?? "待验证账号"}</p>
        <p className="mt-1 text-xs text-ink/55">验证通过后点击下方按钮进入衣橱。</p>
      </div>
      <button
        type="button"
        onClick={() => auth.checkRegistration().catch(() => undefined)}
        disabled={auth.isBusy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-denim text-sm font-semibold text-white disabled:opacity-60"
      >
        {auth.isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        检查验证状态
      </button>
      <button type="button" onClick={auth.returnToLoginFromBlocked} className="h-10 text-sm font-semibold text-ink/55">
        返回登录
      </button>
    </div>
  );
}

function BlockedLocalOwner() {
  const auth = useAuth();
  return (
    <div className="grid gap-4">
      <AuthHeader title="本机已有衣橱账号" subtitle="阶段 1A 暂不在同一设备切换本地衣橱" />
      <div className="rounded-lg border border-clay/20 bg-clay/8 px-3 py-3 text-sm">
        <p className="text-ink/70">当前本地衣橱属于</p>
        <p className="mt-1 font-semibold">{auth.blocked?.owner.maskedPhone ?? "旧账号"}</p>
      </div>
      <button type="button" onClick={auth.returnToLoginFromBlocked} className="h-11 rounded-lg bg-denim text-sm font-semibold text-white">
        返回登录
      </button>
    </div>
  );
}

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="grid gap-2">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-denim/10 text-denim">
        <Shield size={22} aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-ink/55">{subtitle}</p>
      </div>
    </header>
  );
}

function AuthError({ override }: { override?: string | null }) {
  const auth = useAuth();
  const text = override ?? auth.error;
  if (!text) return null;
  return <p className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">{text}</p>;
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className="h-11 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim"
      />
    </label>
  );
}
