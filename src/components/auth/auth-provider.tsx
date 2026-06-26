"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  bindLocalOwnerIfNeeded,
  clearAuthTokens,
  createRefreshRequestId,
  isAccessTokenFresh,
  loadAuthSessionSnapshot,
  saveAuthSessionSnapshot,
  saveAuthTokens,
  savePendingRegistration,
  type AuthSessionSnapshot,
  type AuthTokenPayload,
  type AuthUserSnapshot,
  type LocalOwnerSnapshot,
  type PendingRegistrationSnapshot,
} from "@/lib/auth-session-store";
import * as authApi from "@/lib/cloud-auth-api";
import { isAccountWorkspaceEnabled, markWorkspaceLoggedOut } from "@/lib/workspace-registry";

export type AuthPhase = "initializing" | "anonymous" | "pending_verification" | "authenticated" | "blocked";

export interface AuthBlockedState {
  owner: LocalOwnerSnapshot;
  attemptedUser: AuthUserSnapshot;
}

interface AuthContextValue {
  phase: AuthPhase;
  session: AuthSessionSnapshot | null;
  user: AuthUserSnapshot | null;
  deviceId: string;
  deviceLabel: string;
  pendingRegistration: PendingRegistrationSnapshot | null;
  blocked: AuthBlockedState | null;
  isBusy: boolean;
  error: string | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, password: string) => Promise<void>;
  checkRegistration: () => Promise<authApi.RegistrationStatusResponse | null>;
  completePendingRegistration: () => Promise<void>;
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

  const setTokenSession = useCallback(async (current: AuthSessionSnapshot, tokens: AuthTokenPayload) => {
    if (!isAccountWorkspaceEnabled()) {
      const ownerResult = await bindLocalOwnerIfNeeded(current, tokens.user);
      if (ownerResult.blocked) {
        const cleared = await clearAuthTokens(ownerResult.snapshot);
        setSession(cleared);
        setBlocked({ owner: ownerResult.owner, attemptedUser: tokens.user });
        setPhase("blocked");
        return null;
      }
      current = ownerResult.snapshot;
    }

    const saved = await saveAuthTokens(current, tokens);
    setSession(saved);
    setBlocked(null);
    setPhase("authenticated");
    return saved;
  }, []);

  const refreshSession = useCallback(async () => {
    const current = session ?? await loadAuthSessionSnapshot();
    if (!current.refreshToken) return null;
    const tokens = await authApi.refreshWithMutex({
      refreshToken: current.refreshToken,
      refreshRequestId: createRefreshRequestId(),
      deviceId: current.deviceId,
    });
    return setTokenSession(current, tokens);
  }, [session, setTokenSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadAuthSessionSnapshot();
        if (cancelled) return;
        setSession(loaded);
        if (loaded.user && isAccessTokenFresh(loaded)) {
          setPhase("authenticated");
          return;
        }
        if (loaded.refreshToken) {
          try {
            const tokens = await authApi.refreshWithMutex({
              refreshToken: loaded.refreshToken,
              refreshRequestId: createRefreshRequestId(),
              deviceId: loaded.deviceId,
            });
            if (!cancelled) await setTokenSession(loaded, tokens);
            return;
          } catch {
            const cleared = await clearAuthTokens(loaded);
            if (!cancelled) setSession(cleared);
          }
        }
        if (loaded.pendingRegistration) {
          setPhase("pending_verification");
          return;
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
  }, [setTokenSession]);

  const login = useCallback(async (phone: string, password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      const tokens = await authApi.login({
        phone,
        password,
        deviceId: current.deviceId,
        deviceLabel: current.deviceLabel,
      });
      await setTokenSession(current, tokens);
    } catch (err) {
      setError(toUserMessage(err));
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [session, setTokenSession]);

  const register = useCallback(async (phone: string, password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      const registration = await authApi.requestRegistration({ phone, password });
      const saved = await savePendingRegistration(current, {
        registrationId: registration.registrationId,
        clientSecret: registration.clientSecret,
        maskedPhone: registration.maskedPhone,
        expiresAt: registration.expiresAt,
      });
      setSession(saved);
      setPhase("pending_verification");
    } catch (err) {
      setError(toUserMessage(err));
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [session]);

  const completePendingRegistration = useCallback(async () => {
    const current = session ?? await loadAuthSessionSnapshot();
    const pending = current.pendingRegistration;
    if (!pending) return;
    const tokens = await authApi.completeRegistration({
      registrationId: pending.registrationId,
      clientSecret: pending.clientSecret,
      deviceId: current.deviceId,
    });
    await setTokenSession(current, tokens);
  }, [session, setTokenSession]);

  const checkRegistration = useCallback(async () => {
    const pending = session?.pendingRegistration;
    if (!session || !pending) return null;
    setIsBusy(true);
    setError(null);
    try {
      const status = await authApi.requestRegistrationStatus({
        registrationId: pending.registrationId,
        clientSecret: pending.clientSecret,
        deviceId: session.deviceId,
      });
      if (status.status === "verified") await completePendingRegistration();
      return status;
    } catch (err) {
      setError(toUserMessage(err));
      throw err;
    } finally {
      setIsBusy(false);
    }
  }, [completePendingRegistration, session]);

  const logout = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      if (isAccountWorkspaceEnabled() && current.user) markWorkspaceLoggedOut(current.user.id);
      if (current.accessToken) {
        await authApi.logout(current.accessToken).catch(() => undefined);
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
      if (isAccountWorkspaceEnabled() && current.user) markWorkspaceLoggedOut(current.user.id);
      if (current.accessToken) await authApi.logoutAll(current.accessToken);
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
    pendingRegistration: session?.pendingRegistration ?? null,
    blocked,
    isBusy,
    error,
    login,
    register,
    checkRegistration,
    completePendingRegistration,
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
    login,
    register,
    checkRegistration,
    completePendingRegistration,
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
    if (error.code === "invalid_credentials") return "手机号或密码不正确";
    if (error.code === "rate_limited") return "尝试次数过多，请稍后再试";
    if (error.code === "phone_already_registered") return "该手机号已注册，请直接登录";
    if (error.code === "registration_not_verified") return "账号还没有完成验证";
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "账号服务暂时不可用";
}
