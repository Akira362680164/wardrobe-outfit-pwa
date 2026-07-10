"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Mail, ShieldAlert } from "lucide-react";

import { AppSubPageTopBar } from "@/components/app-sub-page-top-bar";
import { MotionSheet } from "@/components/motion-common";
import type { WardrobeCloudAuth } from "@/components/auth/account-views";
import * as authApi from "@/lib/cloud-auth-api";
import { clearMiniMaxSettings } from "@/lib/device-minimax";

type DeletionStage = "notice" | "verify-choice" | "verify-email" | "verify-password" | "final" | "processing" | "completed" | "failed";

export function AccountDeletionView({ auth, onBack }: { auth: WardrobeCloudAuth; onBack: () => void }) {
  const [stage, setStage] = useState<DeletionStage>("notice");
  const [security, setSecurity] = useState<authApi.AccountSecurityResponse | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [authorizationToken, setAuthorizationToken] = useState("");
  const [receiptToken, setReceiptToken] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.accessToken) return;
    authApi.getAccountSecurity(auth.accessToken)
      .then(setSecurity)
      .catch((error) => setMessage(toDeletionMessage(error)));
  }, [auth.accessToken]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (stage !== "processing" || !receiptToken) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await authApi.getAccountDeletionStatus(receiptToken);
        if (cancelled) return;
        setReferenceCode(result.referenceCode ?? null);
        if (result.status === "completed") {
          setStage("completed");
          return;
        }
        if (result.status === "failed") {
          setStage("failed");
          return;
        }
      } catch {
        // The account is already disabled; polling remains safe and retryable.
      }
      if (!cancelled) window.setTimeout(poll, 2000);
    };
    void poll();
    return () => { cancelled = true; };
  }, [receiptToken, stage]);

  const sendEmailCode = async () => {
    if (!auth.accessToken || sendingCode || countdown > 0) return;
    setSendingCode(true);
    setMessage(null);
    try {
      const result = await authApi.requestAccountDeletionEmailCode(auth.accessToken);
      setCountdown(result.cooldownSeconds);
    } catch (error) {
      setMessage(toDeletionMessage(error));
    } finally {
      setSendingCode(false);
    }
  };

  const verify = async (verification: authApi.AccountDeletionVerifyInput) => {
    if (!auth.accessToken) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await authApi.verifyAccountDeletion({ accessToken: auth.accessToken, verification });
      setAuthorizationToken(result.authorizationToken);
      setConfirmed(false);
      setStage("final");
    } catch (error) {
      setMessage(toDeletionMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeletion = async () => {
    if (!auth.accessToken || !authorizationToken || !confirmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await authApi.confirmAccountDeletion({ accessToken: auth.accessToken, authorizationToken });
      clearMiniMaxSettings();
      setReceiptToken(result.receiptToken);
      setStage(result.status === "completed" ? "completed" : "processing");
    } catch (error) {
      setMessage(toDeletionMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (stage === "processing") {
    return (
      <StatusPanel icon={<Loader2 className="animate-spin text-red-600" size={32} aria-hidden="true" />} title="正在注销账号">
        <p>账号已停止使用，正在删除账号数据和图片。请稍候。</p>
        {referenceCode ? <p className="text-xs text-ink/45">处理编号：{referenceCode}</p> : null}
      </StatusPanel>
    );
  }

  if (stage === "completed") {
    return (
      <StatusPanel icon={<CheckCircle2 className="text-moss" size={34} aria-hidden="true" />} title="账号已注销">
        <p>你的账号、衣橱数据和图片已删除，所有设备均已退出登录。</p>
        <button type="button" onClick={() => void auth.onAccountDeleted()} className="mt-3 h-12 w-full rounded-lg bg-denim text-sm font-semibold text-white">
          返回登录页
        </button>
      </StatusPanel>
    );
  }

  if (stage === "failed") {
    return (
      <StatusPanel icon={<ShieldAlert className="text-red-600" size={34} aria-hidden="true" />} title="账号已停用">
        <p>你的账号已无法登录，关联数据正在继续删除。删除完成前不会再用于任何业务功能。</p>
        {referenceCode ? <p className="text-xs text-ink/45">处理编号：{referenceCode}</p> : null}
      </StatusPanel>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 pb-[calc(112px+env(safe-area-inset-bottom))]">
      <AppSubPageTopBar title="注销账号" onBack={stage === "notice" ? onBack : () => setStage(previousStage(stage))} />
      {message ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-700">{message}</p> : null}

      {stage === "notice" ? (
        <section className="grid gap-4">
          <div className="surface rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600"><AlertTriangle size={20} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-ink">注销后无法恢复</h1>
                <p className="mt-1 text-sm leading-relaxed text-ink/60">注销后，你将无法再登录或找回这个账号。</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white/85 p-4">
            <p className="text-sm font-semibold">以下内容将被永久删除：</p>
            <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-relaxed text-ink/65">
              <li>衣物资料、衣物照片和衣橱位置</li>
              <li>收藏套装、穿搭计划和穿着记录</li>
              <li>种草清单、旅行计划和试穿资料</li>
              <li>邮箱、手机号和微信登录关系</li>
              <li>已上传的诊断数据及其他账号关联信息</li>
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-red-700">所有 App 和小程序登录会话将同时失效。删除完成后无法恢复。</p>
          </div>
          <button type="button" onClick={() => setStage("verify-choice")} className="h-12 rounded-lg bg-red-600 text-sm font-semibold text-white active:bg-red-700">
            我已了解，继续注销
          </button>
          <button type="button" onClick={onBack} className="h-11 text-sm font-medium text-ink/55">暂不注销</button>
        </section>
      ) : null}

      {stage === "verify-choice" ? (
        <section className="grid gap-3">
          <div className="rounded-2xl border border-ink/10 bg-white/85 p-4">
            <h1 className="text-base font-bold">验证账号身份</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">为防止他人误操作，请选择一种已经绑定的方式验证身份。验证信息仅用于本次注销。</p>
          </div>
          {security?.email.bound && security.email.verified ? (
            <MethodButton icon={<Mail size={18} aria-hidden="true" />} title="使用邮箱验证码验证" note={security.email.masked ?? "已验证邮箱"} onClick={() => setStage("verify-email")} />
          ) : null}
          {security?.password.set ? (
            <MethodButton icon={<KeyRound size={18} aria-hidden="true" />} title="使用当前密码验证" note="输入当前账号密码" onClick={() => setStage("verify-password")} />
          ) : null}
          {security && !(security.email.bound && security.email.verified) && !security.password.set ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm leading-relaxed text-red-700">当前账号没有可用于 App 验证的身份方式，请通过公开联系渠道处理，并提供页面错误信息。</p>
          ) : null}
        </section>
      ) : null}

      {stage === "verify-email" ? (
        <section className="grid gap-3">
          <div className="rounded-2xl border border-ink/10 bg-white/85 p-4">
            <h1 className="text-base font-bold">邮箱验证码</h1>
            <p className="mt-1 text-sm text-ink/55">验证码将发送至 {security?.email.masked ?? "已绑定邮箱"}</p>
            <button type="button" onClick={() => void sendEmailCode()} disabled={sendingCode || countdown > 0} className="mt-4 h-10 rounded-lg bg-denim px-4 text-sm font-semibold text-white disabled:opacity-45">
              {sendingCode ? "发送中" : countdown > 0 ? `${countdown}s 后可重发` : "发送验证码"}
            </button>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">邮箱验证码
            <input value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="h-12 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim" />
          </label>
          <button type="button" onClick={() => void verify({ method: "email", emailCode })} disabled={busy || !/^\d{6}$/.test(emailCode)} className="h-12 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "验证中" : "验证并继续"}
          </button>
        </section>
      ) : null}

      {stage === "verify-password" ? (
        <section className="grid gap-3">
          <div className="rounded-2xl border border-ink/10 bg-white/85 p-4">
            <h1 className="text-base font-bold">当前密码</h1>
            <p className="mt-1 text-sm text-ink/55">请输入当前账号密码验证身份。</p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">当前密码
            <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" className="h-12 rounded-lg border border-ink/10 bg-white px-3 text-base outline-none focus:border-denim" />
          </label>
          <button type="button" onClick={() => void verify({ method: "password", currentPassword })} disabled={busy || currentPassword.length < 8} className="h-12 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "验证中" : "验证并继续"}
          </button>
        </section>
      ) : null}

      <MotionSheet open={stage === "final"} onClose={() => { if (!busy) setStage("verify-choice"); }} closeOnBackdrop={!busy} closeOnEscape={!busy} role="alertdialog" ariaLabel="最后确认永久注销" panelClassName="pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="grid gap-4">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600"><ShieldAlert size={24} aria-hidden="true" /></div>
          <div className="text-center">
            <h2 className="text-lg font-bold">最后确认永久注销</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">确认后，账号将立即停用，所有设备退出登录，账号数据和图片将被永久删除。该操作无法撤销。</p>
          </div>
          {message ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
          <label className="flex min-h-12 items-center gap-3 rounded-lg border border-red-200 bg-red-50/60 px-3 text-sm leading-relaxed">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="h-5 w-5 accent-red-600" />
            我确认不再需要此账号及其中的数据
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setStage("verify-choice")} disabled={busy} className="h-11 rounded-lg border border-ink/10 text-sm font-semibold">取消</button>
            <button type="button" onClick={() => void confirmDeletion()} disabled={!confirmed || busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}永久注销账号
            </button>
          </div>
        </div>
      </MotionSheet>
    </div>
  );
}

function MethodButton({ icon, title, note, onClick }: { icon: React.ReactNode; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 items-center gap-3 rounded-2xl border border-ink/10 bg-white/85 px-4 text-left active:bg-mist">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-denim/10 text-denim">{icon}</span>
      <span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block truncate text-xs text-ink/50">{note}</span></span>
    </button>
  );
}

function StatusPanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-h-[60dvh] place-items-center px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="surface grid w-full max-w-sm gap-4 rounded-2xl p-6 text-center">
        <div className="mx-auto">{icon}</div>
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="grid gap-2 text-sm leading-relaxed text-ink/60">{children}</div>
      </div>
    </section>
  );
}

function previousStage(stage: DeletionStage): DeletionStage {
  if (stage === "verify-email" || stage === "verify-password" || stage === "final") return "verify-choice";
  return "notice";
}

function toDeletionMessage(error: unknown): string {
  if (error instanceof authApi.CloudAuthApiError) {
    if (error.code === "invalid_credentials") return "身份验证失败，请检查后重试";
    if (error.code === "email_code_invalid") return "邮箱验证码不正确";
    if (error.code === "email_code_expired") return "邮箱验证码已过期，请重新获取";
    if (error.code === "email_code_attempts_exceeded") return "验证码错误次数过多，请重新获取";
    if (error.code === "email_rate_limited" || error.code === "email_code_rate_limited") return "验证码请求过于频繁，请稍后重试";
    if (error.code === "account_deletion_authorization_invalid") return "身份验证已过期，请重新验证";
    if (error.code === "network_unavailable") return "网络连接中断。本次操作未确认完成前，请不要重复注册账号；恢复网络后可重新提交确认。";
  }
  return error instanceof Error ? error.message : "暂时无法注销，请稍后重试";
}
