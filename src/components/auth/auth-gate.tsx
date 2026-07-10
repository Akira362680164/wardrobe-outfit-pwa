"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { KeyRound, Loader2, Lock, Mail, Shield, User } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { LegalDocumentView, type LegalSection } from "@/components/auth/legal-document-view";
import * as authApi from "@/lib/cloud-auth-api";
import {
  isLoginFormValid,
  isRegisterFormValid,
  isValidAuthEmail,
  isValidAuthPhone,
  validatePassword,
  type LoginFormState,
  type RegisterFormState,
} from "@/lib/auth-form-validation";

type AuthView = "login" | "register" | "forgot_password" | "terms" | "privacy";

const TERMS_LAST_UPDATED = "2026-07-09";
const PRIVACY_LAST_UPDATED = "2026-07-09";

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. 服务说明",
    children: (
      <p>
        衣橱穿搭助手是一款手机优先的衣橱识别、穿搭推荐与买前评估应用。用户使用邮箱作为主认证身份，
        可选手机号仅作为手机号加密码登录名，注册后可使用云端工作区同步结构化衣橱数据。
      </p>
    ),
  },
  {
    title: "2. 账号注册与使用",
    children: (
      <>
        <p>用户使用邮箱验证码、邮箱和密码注册账号。手机号为选填登录名，不代表平台已经核验手机号归属。密码以 Argon2id 安全哈希形式保存，服务器不保存明文密码。</p>
        <p>一个账号可以在多个设备上登录。用户可修改密码、找回密码、退出当前设备或退出全部设备。</p>
      </>
    ),
  },
  {
    title: "3. 云端数据与本机数据",
    children: (
      <>
        <p>账号登录后直接从云端工作区读写衣物、套装、心愿单、穿着记录、行程和穿搭计划；用户提交时会通过自有 API 上传原图及缩略图至服务器持久化存储。</p>
        <p>本机不持久化保存正式衣橱业务数据或图片缓存，仅在当前页面会话内保留未提交草稿。退出账号不会自动删除云端账号数据。</p>
      </>
    ),
  },
  {
    title: "4. 用户责任",
    children: (
      <p>
        用户不得滥用、攻击、批量注册或绕过安全限制。不得注册或使用不属于自己的邮箱或手机号。
        MiniMax Key 属于本机设置；仅在用户主动发起 AI 功能时临时用于服务器代调 MiniMax，不在服务器保存。
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
        <p><strong>账号数据：</strong>邮箱登录标识、邮箱验证状态、选填手机号登录名、密码 Argon2id 哈希、设备会话信息。选填手机号当前不经过短信归属核验。</p>
        <p><strong>云端工作区数据：</strong>衣物、套装、心愿单、穿着记录、行程计划和相关同步数据。</p>
        <p><strong>图片数据：</strong>用户主动提交时会上传原图、缩略图和必要的图片元数据。</p>
        <p><strong>AI Key：</strong>MiniMax Key 保存在本机 localStorage；仅在用户主动发起 AI 功能时，经 HTTPS 临时发送给 wardrobe API 代为调用 MiniMax，服务器不保存、不写日志。</p>
        <p><strong>安全事件：</strong>只保存脱敏或哈希后的必要信息，不保存明文密码、验证码或 Token。</p>
      </>
    ),
  },
  {
    title: "2. 数据用途",
    children: (
      <p>
        账号数据用于身份认证、验证码校验与多设备会话管理。衣橱结构化数据用于跨设备同步与穿搭推荐。
        图片数据用于在设备间同步衣物视觉信息。安全事件用于限流、防滥用和安全审计。
      </p>
    ),
  },
  {
    title: "3. 本机数据与云端数据",
    children: (
      <>
        <p>正式衣橱数据和图片仅以服务器返回为准；本机仅在当前页面会话内保留选图、缩略图和未提交草稿，不写入 IndexedDB、文件系统或持久图片缓存。</p>
        <p>认证凭据在 Android 使用 Keystore 支持的安全存储，浏览器开发环境使用 sessionStorage。</p>
        <p>MiniMax AI Key 仅保存在本机 localStorage。</p>
      </>
    ),
  },
  {
    title: "4. 数据安全",
    children: (
      <>
        <p>密码使用 Argon2id 哈希后写入数据库，不可逆。邮箱验证码只保存哈希、状态和有效期。Token 使用短期 Access + 可撤销 Refresh 机制。</p>
        <p>图片通过需要账号和设备认证的 wardrobe API 上传和下载；本机安全存储保存认证凭据。</p>
      </>
    ),
  },
  {
    title: "5. 数据保留",
    children: (
      <>
        <p>账号与结构化数据保留至用户请求删除。退出账号会清除本机认证凭据并吊销 Token，但不会自动清除云端数据。</p>
        <p>未提交的页面内存草稿在 App 关闭后会丢失。MiniMax AI Key 仍保存在本机，可由用户在设置中清理。</p>
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

export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [view, setView] = useState<AuthView>("login");
  const [loginForm, setLoginForm] = useState<LoginFormState>({ account: "", password: "" });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    email: "",
    emailCode: "",
    password: "",
    confirmPassword: "",
    phone: "",
    accepted: false,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const removedRef = useRef(false);
  const backListenerHandle = useRef<{ remove: () => void } | null>(null);
  const previousAuthViewRef = useRef<AuthView>("login");

  const clearLocalError = useCallback(() => {
    setLocalError(null);
    auth.clearError();
  }, [auth]);

  const updateAuthView = useCallback((next: AuthView, push = true) => {
    if (next === "terms" || next === "privacy") {
      previousAuthViewRef.current = view;
    }
    setView(next);
    if (push) {
      window.history.pushState({ [HISTORY_KEY]: next }, "");
    }
    clearLocalError();
  }, [clearLocalError, view]);

  const handlePopState = useCallback((event: PopStateEvent) => {
    const state = event.state;
    if (state && typeof state === "object" && HISTORY_KEY in state) {
      setView(state[HISTORY_KEY] as AuthView);
      clearLocalError();
    }
  }, [clearLocalError]);

  useEffect(() => {
    window.history.replaceState({ [HISTORY_KEY]: "login" }, "");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [handlePopState]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const register = async () => {
      try {
        const handle = await App.addListener("backButton", () => {
          if (showExitDialog) {
            setShowExitDialog(false);
            return;
          }
          const active = document.activeElement;
          if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
            (active as HTMLElement).blur();
            return;
          }
          if (view === "terms" || view === "privacy") {
            updateAuthView(previousAuthViewRef.current, false);
          } else if (view === "register" || view === "forgot_password") {
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
  }, [view, showExitDialog, updateAuthView]);

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
            await auth.login(loginForm.account.trim(), loginForm.password);
          }}
          onGoRegister={() => updateAuthView("register")}
          onForgotPassword={() => updateAuthView("forgot_password")}
        />
      )}
      {view === "register" && (
        <RegisterForm
          form={registerForm}
          onChange={setRegisterForm}
          error={localError ?? auth.error}
          isBusy={auth.isBusy}
          onSendEmailCode={(email) => authApi.sendEmailCode({ email, purpose: "register" })}
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
            await auth.register({
              email: registerForm.email.trim(),
              emailCode: registerForm.emailCode.trim(),
              password: registerForm.password,
              phone: registerForm.phone.trim() || undefined,
            });
          }}
          onGoLogin={() => updateAuthView("login")}
          onOpenTerms={() => updateAuthView("terms")}
          onOpenPrivacy={() => updateAuthView("privacy")}
        />
      )}
      {view === "forgot_password" && (
        <ForgotPasswordForm
          onGoLogin={() => updateAuthView("login")}
        />
      )}
      {view === "terms" && (
        <LegalDocumentView
          title="用户协议"
          lastUpdated={TERMS_LAST_UPDATED}
          sections={TERMS_SECTIONS}
          onBack={() => updateAuthView(previousAuthViewRef.current, false)}
        />
      )}
      {view === "privacy" && (
        <LegalDocumentView
          title="隐私政策"
          lastUpdated={PRIVACY_LAST_UPDATED}
          sections={PRIVACY_SECTIONS}
          onBack={() => updateAuthView(previousAuthViewRef.current, false)}
        />
      )}
      {showExitDialog && <ExitDialog onClose={() => setShowExitDialog(false)} />}
    </AuthShell>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-ambient-bg min-h-dvh px-4 py-5 text-ink">
      <div className="mx-auto grid min-h-[calc(100dvh-40px)] w-full max-w-md content-center">
        <section className="surface px-4 py-5 shadow-soft">
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
  onForgotPassword,
}: {
  form: LoginFormState;
  onChange: (form: LoginFormState) => void;
  error: string | null;
  isBusy: boolean;
  onLogin: () => Promise<void>;
  onGoRegister: () => void;
  onForgotPassword: () => void;
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
      <TextField label="邮箱或手机号" value={form.account} onChange={(account) => onChange({ ...form, account })} autoComplete="username" inputMode="email" />
      <TextField label="密码" value={form.password} onChange={(password) => onChange({ ...form, password })} type="password" autoComplete="current-password" />
      <button
        type="submit"
        disabled={!valid || isBusy}
        className="inline-flex h-11 items-center justify-center gap-2 ui-control-radius text-sm font-semibold text-white disabled:cursor-not-allowed"
        style={{ backgroundColor: valid && !isBusy ? "var(--color-denim, #156596)" : "rgba(21,101,150,0.4)" }}
      >
        {isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        登录
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onGoRegister} className="h-10 text-sm font-semibold text-denim">
          通过邮箱注册
        </button>
        <button type="button" onClick={onForgotPassword} className="h-10 text-sm font-semibold text-ink/60">
          忘记密码
        </button>
      </div>
    </form>
  );
}

function RegisterForm({
  form,
  onChange,
  error,
  isBusy,
  onSendEmailCode,
  onRegister,
  onGoLogin,
  onOpenTerms,
  onOpenPrivacy,
}: {
  form: RegisterFormState;
  onChange: (form: RegisterFormState) => void;
  error: string | null;
  isBusy: boolean;
  onSendEmailCode: (email: string) => Promise<authApi.SendEmailCodeResponse>;
  onRegister: () => Promise<void>;
  onGoLogin: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}) {
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const valid = isRegisterFormValid(form);
  const pwError = form.password ? validatePassword(form.password) : null;
  const emailError = form.email && !isValidAuthEmail(form.email) ? "邮箱格式不正确" : null;
  const phoneError = form.phone.trim() && !isValidAuthPhone(form.phone) ? "手机号格式不正确" : null;
  const confirmError = form.confirmPassword && form.password !== form.confirmPassword ? "两次输入的密码不一致" : null;

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = window.setTimeout(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const askSendCode = () => {
    const email = form.email.trim();
    setCodeError(null);
    if (!isValidAuthEmail(email)) {
      setCodeError("邮箱格式不正确");
      return;
    }
    setPendingEmail(email);
  };

  const confirmSendCode = async () => {
    if (!pendingEmail) return;
    setSending(true);
    setCodeError(null);
    try {
      const response = await onSendEmailCode(pendingEmail);
      setCodeSent(true);
      setCountdown(response.cooldownSeconds);
      setPendingEmail(null);
    } catch (err) {
      setCodeError(toEmailCodeMessage(err));
    } finally {
      setSending(false);
    }
  };

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
      {codeError && <AuthErrorMessage text={codeError} />}
      <TextField
        label="邮箱"
        value={form.email}
        onChange={(email) => onChange({ ...form, email })}
        autoComplete="email"
        inputMode="email"
        trailing={(
          <button
            type="button"
            onClick={askSendCode}
            disabled={sending || countdown > 0}
            className="absolute right-1 top-1 inline-flex h-9 items-center justify-center rounded-[12px] bg-denim px-3 text-xs font-semibold text-white disabled:bg-denim/35"
          >
            {sending ? "发送中" : countdown > 0 ? `${countdown}s` : codeSent ? "再次发送" : "发送验证码"}
          </button>
        )}
      />
      {emailError && <p className="text-xs text-clay">{emailError}</p>}
      {codeSent ? (
        <TextField label="邮箱验证码" value={form.emailCode} onChange={(emailCode) => onChange({ ...form, emailCode })} autoComplete="one-time-code" inputMode="numeric" />
      ) : null}
      <div>
        <TextField label="密码" value={form.password} onChange={(password) => onChange({ ...form, password })} type="password" autoComplete="new-password" />
        {pwError && <p className="mt-1 text-xs text-clay">{pwError}</p>}
      </div>
      <div>
        <TextField label="确认密码" value={form.confirmPassword} onChange={(confirmPassword) => onChange({ ...form, confirmPassword })} type="password" autoComplete="new-password" />
        {confirmError && <p className="mt-1 text-xs text-clay">{confirmError}</p>}
      </div>
      <div>
        <TextField label="手机号（选填）" value={form.phone} onChange={(phone) => onChange({ ...form, phone })} autoComplete="tel" inputMode="tel" />
        <p className="mt-1 text-xs leading-relaxed text-ink/45">手机号暂不验证，仅作为手机号加密码登录名使用。</p>
        {phoneError && <p className="mt-1 text-xs text-clay">{phoneError}</p>}
      </div>
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
        className="inline-flex h-11 items-center justify-center gap-2 ui-control-radius text-sm font-semibold text-white disabled:cursor-not-allowed"
        style={{ backgroundColor: valid && !isBusy ? "var(--color-denim, #156596)" : "rgba(21,101,150,0.4)" }}
      >
        {isBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <User size={16} aria-hidden="true" />}
        注册
      </button>
      <button type="button" onClick={onGoLogin} className="h-10 text-sm font-semibold text-denim">
        已有账号，去登录
      </button>
      {pendingEmail ? (
        <ConfirmEmailDialog
          email={maskEmail(pendingEmail)}
          busy={sending}
          onCancel={() => setPendingEmail(null)}
          onConfirm={confirmSendCode}
        />
      ) : null}
    </form>
  );
}

function ForgotPasswordForm({ onGoLogin }: { onGoLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pwError = newPassword ? validatePassword(newPassword) : null;
  const valid = isValidAuthEmail(email) && /^\d{6}$/.test(emailCode.trim()) && !pwError && newPassword === confirmPassword;

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = window.setTimeout(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const askSendCode = () => {
    setMessage(null);
    const target = email.trim();
    if (!isValidAuthEmail(target)) {
      setMessage("邮箱格式不正确");
      return;
    }
    setPendingEmail(target);
  };

  const confirmSendCode = async () => {
    if (!pendingEmail) return;
    setSending(true);
    setMessage(null);
    try {
      const response = await authApi.requestPasswordReset(pendingEmail);
      setCodeSent(true);
      setCountdown(response.cooldownSeconds);
      setPendingEmail(null);
    } catch (err) {
      setMessage(toEmailCodeMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="grid gap-4">
        <AuthHeader title="密码已重置" />
        <p className="ui-control-radius bg-denim/10 px-3 py-3 text-sm leading-relaxed text-ink/70">请使用新密码重新登录。</p>
        <button type="button" onClick={onGoLogin} className="h-11 ui-control-radius bg-denim text-sm font-semibold text-white">
          返回登录
        </button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage(null);
        if (newPassword !== confirmPassword) {
          setMessage("两次输入的新密码不一致");
          return;
        }
        if (!valid || submitting) return;
        setSubmitting(true);
        try {
          await authApi.confirmPasswordReset({
            email: email.trim(),
            emailCode: emailCode.trim(),
            newPassword,
          });
          setDone(true);
        } catch (err) {
          setMessage(toEmailCodeMessage(err));
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <AuthHeader title="找回密码" />
      {message && <AuthErrorMessage text={message} />}
      <TextField
        label="邮箱"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        inputMode="email"
        trailing={(
          <button
            type="button"
            onClick={askSendCode}
            disabled={sending || countdown > 0}
            className="absolute right-1 top-1 inline-flex h-9 items-center justify-center rounded-[12px] bg-denim px-3 text-xs font-semibold text-white disabled:bg-denim/35"
          >
            {sending ? "发送中" : countdown > 0 ? `${countdown}s` : codeSent ? "再次发送" : "发送验证码"}
          </button>
        )}
      />
      {codeSent ? (
        <TextField label="邮箱验证码" value={emailCode} onChange={setEmailCode} autoComplete="one-time-code" inputMode="numeric" />
      ) : null}
      <div>
        <TextField label="新密码" value={newPassword} onChange={setNewPassword} type="password" autoComplete="new-password" />
        {pwError && <p className="mt-1 text-xs text-clay">{pwError}</p>}
      </div>
      <div>
        <TextField label="确认新密码" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" />
        {confirmPassword && newPassword !== confirmPassword ? <p className="mt-1 text-xs text-clay">两次输入的新密码不一致</p> : null}
      </div>
      <button
        type="submit"
        disabled={!valid || submitting}
        className="inline-flex h-11 items-center justify-center gap-2 ui-control-radius text-sm font-semibold text-white disabled:cursor-not-allowed"
        style={{ backgroundColor: valid && !submitting ? "var(--color-denim, #156596)" : "rgba(21,101,150,0.4)" }}
      >
        {submitting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
        重置密码
      </button>
      <button type="button" onClick={onGoLogin} className="h-10 text-sm font-semibold text-denim">
        返回登录
      </button>
      {pendingEmail ? (
        <ConfirmEmailDialog
          email={maskEmail(pendingEmail)}
          busy={sending}
          onCancel={() => setPendingEmail(null)}
          onConfirm={confirmSendCode}
        />
      ) : null}
    </form>
  );
}

function BlockedLocalOwner() {
  const auth = useAuth();
  return (
    <div className="grid gap-4">
      <AuthHeader title="本机已有其他账号数据" />
      <div className="ui-control-radius border border-clay/20 bg-clay/8 px-3 py-3 text-sm">
        <p className="text-ink/70">当前本机衣橱属于</p>
        <p className="mt-1 font-semibold">{auth.blocked?.owner.maskedIdentity ?? auth.blocked?.owner.maskedPhone ?? "旧账号"}</p>
        <p className="mt-2 text-xs text-ink/55">请使用该账号登录。</p>
      </div>
      <button type="button" onClick={auth.returnToLoginFromBlocked} className="h-11 ui-control-radius bg-denim text-sm font-semibold text-white">
        返回登录
      </button>
    </div>
  );
}

function ConfirmEmailDialog({
  email,
  busy,
  onCancel,
  onConfirm,
}: {
  email: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/24 px-4" onClick={busy ? undefined : onCancel}>
      <div className="surface w-full max-w-xs px-5 py-5 shadow-strong" onClick={(event) => event.stopPropagation()}>
        <div className="grid h-10 w-10 place-items-center ui-control-radius bg-denim/10 text-denim">
          <Mail size={20} aria-hidden="true" />
        </div>
        <h2 className="mt-3 text-base font-bold text-ink">发送邮箱验证码</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">验证码将发送至 {email}，10 分钟内有效。确认发送？</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="h-10 ui-control-radius border border-ink/10 text-sm font-semibold text-ink/60 disabled:opacity-60">
            取消
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 ui-control-radius bg-denim text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
            确认发送
          </button>
        </div>
      </div>
    </div>
  );
}

function ExitDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/20 px-4" onClick={onClose}>
      <div className="surface w-full max-w-xs px-5 py-5 shadow-strong" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-base font-bold text-ink">退出应用</h2>
        <p className="mt-2 text-sm text-ink/65">确定要退出衣橱穿搭助手吗？</p>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="h-9 ui-control-radius px-4 text-sm font-semibold text-ink/60">
            取消
          </button>
          <button
            type="button"
            onClick={() => App.exitApp()}
            className="h-9 ui-control-radius bg-denim px-4 text-sm font-semibold text-white"
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
      <div className="grid h-11 w-11 place-items-center ui-control-radius bg-denim/10 text-denim">
        <Shield size={22} aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
    </header>
  );
}

function AuthErrorMessage({ text }: { text: string }) {
  return <p className="ui-control-radius bg-clay/10 px-3 py-2 text-sm text-clay">{text}</p>;
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  inputMode,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  trailing?: ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <span className="relative block">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className={`h-11 w-full ui-control-radius border border-ink/10 bg-white/76 px-3 text-base outline-none focus:border-denim ${trailing ? "pr-28" : ""}`}
        />
        {trailing}
      </span>
    </label>
  );
}

function toEmailCodeMessage(error: unknown): string {
  if (error instanceof authApi.CloudAuthApiError) {
    if (error.code === "email_rate_limited") return "验证码发送过于频繁，请稍后再试";
    if (error.code === "email_code_rate_limited") return "验证码请求过多，请稍后再试";
    if (error.code === "email_provider_not_configured") return "邮件服务尚未配置，请稍后再试";
    if (error.code === "email_provider_error") return "邮件发送失败，请稍后再试";
    if (error.code === "email_code_invalid") return "验证码不正确";
    if (error.code === "email_code_expired") return "验证码已过期，请重新获取";
    if (error.code === "email_code_attempts_exceeded") return "验证码错误次数过多，请重新获取";
    if (error.code === "email_already_registered") return "该邮箱已注册，请改用登录或找回密码";
    if (error.code === "invalid_email") return "邮箱格式不正确";
    if (error.code === "network_unavailable") return "网络连接失败，请检查网络后重试";
    if (error.code === "service_unavailable") return "账号服务暂时不可用，请稍后重试";
  }
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  return `${(local || "*").slice(0, 1)}***@${domain || ""}`;
}
