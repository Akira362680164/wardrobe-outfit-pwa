"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearAuthTokens,
  createRefreshRequestId,
  isAccessTokenFresh,
  loadAuthSessionSnapshot,
  saveAuthSessionSnapshot,
  saveAuthTokens,
  type AuthSessionSnapshot,
  type AuthTokenPayload,
  type AuthUserSnapshot,
} from "@/lib/auth-session-store";
import * as authApi from "@/lib/cloud-auth-api";
import { probeCloudConnectivity, subscribeNetworkChanges, type ConnectivityState } from "@/lib/online/online-connectivity";

export type AuthPhase = "initializing" | "anonymous" | "authenticated" | "blocked";

export interface AuthBlockedState {
  owner: { maskedPhone: string; maskedIdentity?: string };
  attemptedUser: AuthUserSnapshot;
}

interface AuthContextValue {
  phase: AuthPhase;
  session: AuthSessionSnapshot | null;
  user: AuthUserSnapshot | null;
  deviceId: string;
  deviceLabel: string;
  blocked: AuthBlockedState | null;
  isBusy: boolean;
  error: string | null;
  connectivity: ConnectivityState;
  login: (account: string, password: string) => Promise<void>;
  register: (input: { email: string; emailCode: string; password: string; phone?: string }) => Promise<void>;
  refreshSession: () => Promise<AuthSessionSnapshot | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
  returnToLoginFromBlocked: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>("initializing");
  const [session, setSession] = useState<AuthSessionSnapshot | null>(null);
  const [blocked, setBlocked] = useState<AuthBlockedState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityState>("unknown");

  const updateConnectivity = useCallback(async () => {
    setConnectivity("probing");
    const next = await probeCloudConnectivity();
    setConnectivity(next);
    return next;
  }, []);

  const setTokenSession = useCallback(async (current: AuthSessionSnapshot, tokens: AuthTokenPayload) => {
    const saved = await saveAuthTokens(current, tokens);
    setSession(saved);
    setBlocked(null);
    setPhase("authenticated");
    return saved;
  }, []);

  const refreshSession = useCallback(async () => {
    const current = session ?? await loadAuthSessionSnapshot();
    if (isAccessTokenFresh(current)) return current;
    if (!current.refreshToken) return null;
    const cloud = await updateConnectivity();
    if (cloud !== "cloud_ready") return current.user ? current : null;
    try {
      const tokens = await authApi.refreshWithMutex({
        refreshToken: current.refreshToken,
        refreshRequestId: createRefreshRequestId(),
        deviceId: current.deviceId,
      });
      return setTokenSession(current, tokens);
    } catch (err) {
      if (isAuthInvalidError(err)) {
        const cleared = await clearAuthTokens(current);
        setSession(cleared);
        setBlocked(null);
        setPhase("anonymous");
        return null;
      }
      return current.user ? current : null;
    }
  }, [session, setTokenSession, updateConnectivity]);

  useEffect(() => {
    void updateConnectivity();
    const listener = subscribeNetworkChanges(() => void updateConnectivity());
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void updateConnectivity();
      if (session?.refreshToken && !isAccessTokenFresh(session)) void refreshSession();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      listener.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshSession, session, updateConnectivity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let loaded = await loadAuthSessionSnapshot();
        if (cancelled) return;

        // Clean up legacy pendingRegistration from old v2.0.0-test data
        if (loaded.pendingRegistration) {
          const { pendingRegistration: _removed, ...cleaned } = loaded;
          loaded = cleaned as AuthSessionSnapshot;
          await saveAuthSessionSnapshot(loaded);
        }

        setSession(loaded);
        if (loaded.user && isAccessTokenFresh(loaded)) {
          setPhase("authenticated");
          return;
        }
        if (loaded.refreshToken) {
          const cloud = await updateConnectivity();
          if (cancelled) return;
          if (cloud === "cloud_ready") {
            try {
              const tokens = await authApi.refreshWithMutex({
                refreshToken: loaded.refreshToken,
                refreshRequestId: createRefreshRequestId(),
                deviceId: loaded.deviceId,
              });
              if (!cancelled) await setTokenSession(loaded, tokens);
              return;
            } catch (err) {
              if (isAuthInvalidError(err)) {
                const cleared = await clearAuthTokens(loaded);
                if (!cancelled) setSession(cleared);
              } else if (loaded.user) {
                if (!cancelled) setPhase("authenticated");
                return;
              }
            }
          } else if (loaded.user) {
            setPhase("authenticated");
            return;
          }
        }
        setPhase("anonymous");
      } catch (err) {
        if (!cancelled) {
          setError(toUserMessage(err));
          setPhase("anonymous");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setTokenSession, updateConnectivity]);

  const login = useCallback(async (account: string, password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      const tokens = await authApi.login({
        account,
        password,
        deviceId: current.deviceId,
        deviceLabel: current.deviceLabel,
      });
      await setTokenSession(current, tokens);
      setConnectivity("cloud_ready");
    } catch (err) {
      setError(toUserMessage(err));
      updateConnectivity().catch(() => undefined);
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [session, setTokenSession, updateConnectivity]);

  const register = useCallback(async (input: { email: string; emailCode: string; password: string; phone?: string }) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      const tokens = await authApi.register({
        email: input.email,
        emailCode: input.emailCode,
        password: input.password,
        phone: input.phone,
        deviceId: current.deviceId,
        deviceLabel: current.deviceLabel,
      });
      await setTokenSession(current, tokens);
    } catch (err) {
      setError(toUserMessage(err));
      updateConnectivity().catch(() => undefined);
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [session, setTokenSession, updateConnectivity]);

  const logout = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      if (current.accessToken) {
        if (!isAccessTokenFresh(current)) {
          try {
            if (current.refreshToken) {
              const tokens = await authApi.refreshWithMutex({
                refreshToken: current.refreshToken,
                refreshRequestId: createRefreshRequestId(),
                deviceId: current.deviceId,
              });
              await authApi.logout(tokens.accessToken);
            }
          } catch {
            await authApi.logout(current.accessToken).catch(() => undefined);
          }
        } else {
          await authApi.logout(current.accessToken).catch(() => undefined);
        }
      }
      const cleared = await clearAuthTokens(current);
      setSession(cleared);
      setBlocked(null);
      setPhase("anonymous");
    } finally {
      setIsBusy(false);
    }
  }, [session]);

  const logoutAll = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      if (current.accessToken) await authApi.logoutAll(current.accessToken).catch(() => undefined);
      const cleared = await clearAuthTokens(current);
      setSession(cleared);
      setBlocked(null);
      setPhase("anonymous");
    } catch (err) {
      setError(toUserMessage(err));
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [session]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session && isAccessTokenFresh(session) ? session : await refreshSession();
      if (!current?.accessToken) throw new Error("请重新登录后再修改密码");
      await authApi.changePassword({
        accessToken: current.accessToken,
        currentPassword,
        newPassword,
      });
    } catch (err) {
      setError(toUserMessage(err));
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [refreshSession, session]);

  const returnToLoginFromBlocked = useCallback(async () => {
    const current = session ?? await loadAuthSessionSnapshot();
    if (current.pendingRegistration) {
      authApi.cancelRegistration({
        registrationId: current.pendingRegistration.registrationId,
        clientSecret: current.pendingRegistration.clientSecret,
      }).catch(() => undefined);
    }
    const next = await clearAuthTokens(current);
    await saveAuthSessionSnapshot(next);
    setSession(next);
    setBlocked(null);
    setPhase("anonymous");
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    phase,
    session,
    user: session?.user ?? null,
    deviceId: session?.deviceId ?? "",
    deviceLabel: session?.deviceLabel ?? "",
    blocked,
    isBusy,
    error,
    connectivity,
    login,
    register,
    refreshSession,
    logout,
    logoutAll,
    changePassword,
    clearError: () => setError(null),
    returnToLoginFromBlocked,
  }), [
    phase,
    session,
    blocked,
    isBusy,
    error,
    connectivity,
    login,
    register,
    refreshSession,
    logout,
    logoutAll,
    changePassword,
    returnToLoginFromBlocked,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

function toUserMessage(error: unknown): string {
  if (error instanceof authApi.CloudAuthApiError) {
    if (error.code === "invalid_credentials") return "邮箱/手机号或密码不正确";
    if (error.code === "invalid_account_format") return "请输入正确的邮箱或手机号";
    if (error.code === "rate_limited") return "操作过于频繁，请稍后再试";
    if (error.code === "email_already_registered") return "该邮箱已注册，请直接登录";
    if (error.code === "phone_already_registered") return "该手机号已被其他账号作为登录名使用";
    if (error.code === "email_code_invalid") return "邮箱验证码不正确";
    if (error.code === "email_code_expired") return "邮箱验证码已过期，请重新获取";
    if (error.code === "email_code_attempts_exceeded") return "验证码错误次数过多，请重新获取";
    if (error.code === "email_rate_limited") return "验证码发送过于频繁，请稍后再试";
    if (error.code === "email_code_rate_limited") return "验证码请求过多，请稍后再试";
    if (error.code === "email_provider_not_configured") return "邮件服务尚未配置，请稍后再试";
    if (error.code === "email_provider_error") return "邮件发送失败，请稍后再试";
    if (error.code === "network_unavailable") return "网络连接失败，请检查网络后重试";
    if (error.code === "service_unavailable") return "账号服务暂时不可用，请稍后重试";
    return "操作失败，请稍后重试";
  }
  if (error instanceof Error) return error.message;
  return "账号服务暂时不可用";
}

function isAuthInvalidError(error: unknown): boolean {
  return error instanceof authApi.CloudAuthApiError && (error.status === 401 || error.status === 403);
}
