"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Loader2, Lock, Shield, User } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { LegalDocumentView, type LegalSection } from "@/components/auth/legal-document-view";
import { isLoginFormValid, isRegisterFormValid, validatePassword, type LoginFormState, type RegisterFormState } from "@/lib/auth-form-validation";

type AuthView = "login" | "register" | "terms" | "privacy";

const TERMS_LAST_UPDATED = "2026-06-27";
const PRIVACY_LAST_UPDATED = "2026-06-27";

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. 服务说明",
    children: (
      <p>
        衣橱穿搭助手是一款手机优先的衣橱识别、穿搭推荐与买前评估应用。用户使用手机号作为登录标识，
        注册后可使用云端工作区同步结构化衣橱数据。
      </p>
    ),
  },
  {
    title: "2. 账号注册与使用",
    children: (
      <>
        <p>用户使用手机号和密码注册账号。当前注册使用手机号与密码，不代表平台已经核验手机号归属。密码以 Argon2id 安全哈希形式保存，服务器不保存明文密码。</p>
        <p>一个账号可以在多个设备上登录。用户可修改密码、退出当前设备或退出全部设备。</p>
      </>
    ),
  },
  {
    title: "3. 云端数据与本机数据",
    children: (
      <>
        <p>账号登录后会使用云端工作区同步结构化衣橱数据（衣物、套装、心愿单、穿着记录、行程、穿搭计划）。开启图片同步后会通过自有 API 上传衣物图片及缩略图至服务器持久化存储。</p>
        <p>本机仍会保存离线工作所需的数据库和图片缓存。退出账号不会自动删除云端账号数据。</p>
      </>
    ),
  },
  {
    title: "4. 用户责任",
    children: (
      <p>
        用户不得滥用、攻击、批量注册或绕过安全限制。不得注册或使用不属于自己的手机号。
        MiniMax Key 属于本机设置，不上传至 wardrobe API。
      </p>
    ),
  },
  {
    title: "5. 服务变更与终止",
    children: (
      <p>
        我们保留根据需要调整、暂停或终止服务的权利。服务变更时将在 App 内展示更新后的协议。
      </p>
    ),
  },
  {
    title: "6. 适用法律",
    children: (
      <p>
        本协议适用中华人民共和国法律。争议优先友好协商；协商不成的，提交服务器运营方所在地有管辖权的人民法院解决。
      </p>
    ),
  },
];

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. 我们处理的数据",
    children: (
      <>
        <p><strong>账号数据：</strong>手机号登录标识（规范化保存）、密码 Argon2id 哈希、设备会话信息。新注册手机号当前不经过短信归属核验。</p>
        <p><strong>云端工作区数据：</strong>衣物、套装、心愿单、穿着记录、行程计划和相关同步数据。</p>
        <p><strong>图片数据：</strong>开启图片同步时会上传原图、缩略图、图片元数据和对象存储地址。</p>
        <p><strong>AI Key：</strong>MiniMax Key 保存在本机 localStorage，不进入 wardrobe API。</p>
        <p><strong>安全事件：</strong>只保存脱敏或哈希后的必要信息，不保存明文密码或 Token。</p>
      </>
    ),
  },
  {
    title: "2. 数据用途",
    children: (
      <p>
        账号数据用于身份认证与多设备会话管理。衣橱结构化数据用于跨设备同步与穿搭推荐。
        图片数据用于在设备间同步衣物视觉信息。安全事件用于限流、防滥用和安全审计。
      </p>
    ),
  },
  {
    title: "3. 本机数据与云端数据",
    children: (
      <>
        <p>衣橱数据在本机 IndexedDB/Dexie 保留完整副本，图片缓存按账号分目录存储。</p>
        <p>Access Token 临时保存在内存或会话存储。Refresh Token 在 Android 使用 Keystore 安全存储，浏览器使用 sessionStorage。</p>
        <p>MiniMax AI Key 仅保存在本机 localStorage。</p>
      </>
    ),
  },
  {
    title: "4. 数据安全",
    children: (
      <>
        <p>密码使用 Argon2id 哈希后写入数据库，不可逆。Token 使用短期 Access + 可撤销 Refresh 机制。</p>
        <p>图片上传走 HTTPS，下载通过预签名 URL。本机安全存储保存认证凭证。</p>
      </>
    ),
  },
  {
    title: "5. 数据保留",
    children: (
      <>
        <p>账号与结构化数据保留至用户请求删除。退出账号会清除本机认证凭据并吊销 Token，但不会自动清除云端数据。</p>
        <p>本机衣橱数据、图片缓存、AI Key 在退出后保留，可由用户自行清理。</p>
      </>
    ),
  },
  {
    title: "6. 政策更新",
    children: (
      <p>
        本政策随版本升级而更新。重大变更会在 App 内重新展示。继续使用即视为同意更新后的政策。
      </p>
    ),
  },
];

const HISTORY_KEY = "authView";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [view, setView] = useState<AuthView>("login");
  const [loginForm, setLoginForm] = useState<LoginFormState>({ phone: "", password: "" });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    phone: "", password: "", confirmPassword: "", accepted: false,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const removedRef = useRef(false);
  const backListenerHandle = useRef<{ remove: () => void } | null>(null);

  const clearLocalError = useCallback(() => {
    setLocalError(null);
    auth.clearError();
  }, [auth]);

  const updateAuthView = useCallback((next: AuthView, push = true) => {
    setView(next);
    if (push) {
      window.history.pushState({ [HISTORY_KEY]: next }, "");
    }
    clearLocalError();
  }, [clearLocalError]);

  const handlePopState = useCallback((event: PopStateEvent) => {
    const state = event.state;
    if (state && typeof state === "object" && HISTORY_KEY in state) {
      setView(state[HISTORY_KEY] as AuthView);
      clearLocalError();
    }
  }, [clearLocalError]);

  // initialize history
  useEffect(() => {
    window.history.replaceState({ [HISTORY_KEY]: "login" }, "");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  // Android back button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const register = async () => {
      try {
        const handle = await App.addListener("backButton", () => {
          if (showExitDialog) {
            setShowExitDialog(false);
            return;
          }
          // blur focused input first
          const active = document.activeElement;
          if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
            (active as HTMLElement).blur();
            return;
          }
          if (view === "terms" || view === "privacy") {
            window.history.back();
          } else if (view === "register") {
            window.history.back();
          } else {
            setShowExitDialog(true);
          }
        });
        if (removedRef.current) {
          handle.remove();
        } else {
          backListenerHandle.current = handle;
        }
      } catch {
        // Capacitor not available
      }
    };
    register();
    return () => {
      removedRef.current = true;
      if (backListenerHandle.current) {
        backListenerHandle.current.remove();
        backListenerHandle.current = null;
      }
    };
  }, [view, showExitDialog]);

  if (auth.phase === "authenticated") return <>{children}</>;
  if (auth.phase === "initializing") return <AuthShell><LoadingState /></AuthShell>;
  if (auth.phase === "blocked") return <AuthShell><BlockedLocalOwner /></AuthShell>;

  return (
    <AuthShell>
      {view === "login" && (
        <LoginForm
          form={loginForm}
          onChange={setLoginForm}
          error={localError ?? auth.error}
          isBusy={auth.isBusy}
          onLogin={async () => {
            clearLocalError();
            await auth.login(loginForm.phone, loginForm.password);
          }}
          onGoRegister={() => updateAuthView("register")}
        />
      )}
      {view === "register" && (
        <RegisterForm
          form={registerForm}
          onChange={setRegisterForm}
          error={localError ?? auth.error}
          isBusy={auth.isBusy}
          onRegister={async () => {
            if (registerForm.password !== registerForm.confirmPassword) {
              setLocalError("两次输入的密码不一致");
              return;
            }
            if (!registerForm.accepted) {
              setLocalError("请先同意用户协议和隐私政策");
              return;
            }
            clearLocalError();
            await auth.register(registerForm.phone, registerForm.password);
          }}
          onGoLogin={() => window.history.back()}
          onOpenTerms={() => updateAuthView("terms")}
          onOpenPrivacy={() => updateAuthView("privacy")}
        />
      )}
      {view === "terms" && (
        <LegalDocumentView
          title="用户协议"
          lastUpdated={TERMS_LAST_UPDATED}
          sections={TERMS_SECTIONS}
          onBack={() => window.history.back()}
        />
      )}
      {view === "privacy" && (
        <LegalDocumentView
          title="隐私政策"
          lastUpdated={PRIVACY_LAST_UPDATED}
          sections={PRIVACY_SECTIONS}
          onBack={() => window.history.back()}
        />
      )}
      {showExitDialog && <ExitDialog onClose={() => setShowExitDialog(false)} />}
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

function LoginForm({
  form,
  onChange,
  error,
  isBusy,
  onLogin,
  onGoRegister,
}: {
  form: LoginFormState;
  onChange: (form: LoginFormState) => void;
  error: string | null;
  isBusy: boolean;
  onLogin: () => Promise<void>;
  onGoRegister: () => void;
}) {
  const valid = isLoginFormValid(form);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || isBusy) return;
        await onLogin();
      }}
    >
      <AuthHeader title="登录衣橱账号" />
      {error && <AuthErrorMessage text={error} />}
      <TextField label="手机号" value={form.phone} onChange={(phone) => onChange({ ...form, phone })} autoComplete="tel" inputMode="tel" />
      <TextField label="密码" value={form.password} onChange={(password) => onChange({ ...form, password })} type="password" autoComplete="current-password" />
      <button
        type="submit"
        disabled={!valid || isBusy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white disabled:cursor-not-allowed"
        style={{ backgroundColor: valid && !isBusy ? "var(--color-denim, #156596)" : "rgba(21,101,150,0.4)" }}
      >
        {isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        登录
      </button>
      <button type="button" onClick={onGoRegister} className="h-10 text-sm font-semibold text-denim">
        还没有账号，去注册
      </button>
    </form>
  );
}

function RegisterForm({
  form,
  onChange,
  error,
  isBusy,
  onRegister,
  onGoLogin,
  onOpenTerms,
  onOpenPrivacy,
}: {
  form: RegisterFormState;
  onChange: (form: RegisterFormState) => void;
  error: string | null;
  isBusy: boolean;
  onRegister: () => Promise<void>;
  onGoLogin: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}) {
  const valid = isRegisterFormValid(form);
  const pwError = form.password ? validatePassword(form.password) : null;

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || isBusy) return;
        await onRegister();
      }}
    >
      <AuthHeader title="注册衣橱账号" />
      {error && <AuthErrorMessage text={error} />}
      <TextField label="手机号" value={form.phone} onChange={(phone) => onChange({ ...form, phone })} autoComplete="tel" inputMode="tel" />
      <div>
        <TextField label="密码" value={form.password} onChange={(password) => onChange({ ...form, password })} type="password" autoComplete="new-password" />
        {pwError && <p className="mt-1 text-xs text-clay">{pwError}</p>}
      </div>
      <TextField label="确认密码" value={form.confirmPassword} onChange={(confirmPassword) => onChange({ ...form, confirmPassword })} type="password" autoComplete="new-password" />
      <div className="flex items-start gap-2 text-xs leading-relaxed text-ink/60">
        <input
          id="auth-terms-accepted"
          type="checkbox"
          checked={form.accepted}
          onChange={(event) => onChange({ ...form, accepted: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-denim"
        />
        <span>
          <label htmlFor="auth-terms-accepted">我已阅读并同意</label>
          <button type="button" onClick={onOpenTerms} className="font-semibold text-denim underline-offset-2 hover:underline">
            《用户协议》
          </button>
          <span>和</span>
          <button type="button" onClick={onOpenPrivacy} className="font-semibold text-denim underline-offset-2 hover:underline">
            《隐私政策》
          </button>
        </span>
      </div>
      <button
        type="submit"
        disabled={!valid || isBusy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white disabled:cursor-not-allowed"
        style={{ backgroundColor: valid && !isBusy ? "var(--color-denim, #156596)" : "rgba(21,101,150,0.4)" }}
      >
        {isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <User size={16} aria-hidden="true" />}
        注册
      </button>
      <button type="button" onClick={onGoLogin} className="h-10 text-sm font-semibold text-denim">
        已有账号，去登录
      </button>
    </form>
  );
}

function BlockedLocalOwner() {
  const auth = useAuth();
  return (
    <div className="grid gap-4">
      <AuthHeader title="本机已有其他账号数据" />
      <div className="rounded-lg border border-clay/20 bg-clay/8 px-3 py-3 text-sm">
        <p className="text-ink/70">当前本机衣橱属于</p>
        <p className="mt-1 font-semibold">{auth.blocked?.owner.maskedPhone ?? "旧账号"}</p>
        <p className="mt-2 text-xs text-ink/55">请使用该账号登录。</p>
      </div>
      <button type="button" onClick={auth.returnToLoginFromBlocked} className="h-11 rounded-lg bg-denim text-sm font-semibold text-white">
        返回登录
      </button>
    </div>
  );
}

function ExitDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/20 px-4" onClick={onClose}>
      <div className="surface w-full max-w-xs rounded-lg px-5 py-5 shadow-strong" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-base font-bold text-ink">退出应用</h2>
        <p className="mt-2 text-sm text-ink/65">确定要退出衣橱穿搭助手吗？</p>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-4 text-sm font-semibold text-ink/60">
            取消
          </button>
          <button
            type="button"
            onClick={() => App.exitApp()}
            className="h-9 rounded-lg bg-denim px-4 text-sm font-semibold text-white"
          >
            退出
          </button>
        </div>
      </div>
    </div>
  );
}

function AuthHeader({ title }: { title: string }) {
  return (
    <header className="grid gap-2">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-denim/10 text-denim">
        <Shield size={22} aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
    </header>
  );
}

function AuthErrorMessage({ text }: { text: string }) {
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
