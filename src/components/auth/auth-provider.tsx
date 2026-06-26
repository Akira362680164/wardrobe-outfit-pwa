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
import { closeAccountWorkspaceDb } from "@/lib/account-workspace-db";
import * as authApi from "@/lib/cloud-auth-api";
import { probeCloudConnectivity, subscribeNetworkChanges, type ConnectivityState } from "@/lib/cloud-sync/connectivity";
import { isAccountWorkspaceEnabled, isWorkspaceOfflineAuthorized, loadWorkspaceRegistry, markWorkspaceLoggedOut, WORKSPACE_SCHEMA_VERSION } from "@/lib/workspace-registry";

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
  connectivity: ConnectivityState;
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
  const [connectivity, setConnectivity] = useState<ConnectivityState>("unknown");

  const updateConnectivity = useCallback(async () => {
    setConnectivity("probing");
    const next = await probeCloudConnectivity();
    setConnectivity(next);
    return next;
  }, []);

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
    const cloud = await updateConnectivity();
    if (cloud !== "cloud_ready") return canUseCachedSession(current) ? current : null;
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
      return canUseCachedSession(current) ? current : null;
    }
  }, [session, setTokenSession, updateConnectivity]);

  useEffect(() => {
    void updateConnectivity();
    const listener = subscribeNetworkChanges(() => void updateConnectivity());
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void updateConnectivity();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      listener.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [updateConnectivity]);

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
              } else if (canUseCachedSession(loaded)) {
                if (!cancelled) setPhase("authenticated");
                return;
              }
            }
          } else if (canUseCachedSession(loaded)) {
            setPhase("authenticated");
            return;
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
  }, [setTokenSession, updateConnectivity]);

  const login = useCallback(async (phone: string, password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      await ensureCloudReady(updateConnectivity, "登录");
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
  }, [session, setTokenSession, updateConnectivity]);

  const register = useCallback(async (phone: string, password: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      await ensureCloudReady(updateConnectivity, "注册");
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
  }, [session, updateConnectivity]);

  const completePendingRegistration = useCallback(async () => {
    const current = session ?? await loadAuthSessionSnapshot();
    const pending = current.pendingRegistration;
    if (!pending) return;
    await ensureCloudReady(updateConnectivity, "完成注册");
    const tokens = await authApi.completeRegistration({
      registrationId: pending.registrationId,
      clientSecret: pending.clientSecret,
      deviceId: current.deviceId,
    });
    await setTokenSession(current, tokens);
  }, [session, setTokenSession, updateConnectivity]);

  const checkRegistration = useCallback(async () => {
    const pending = session?.pendingRegistration;
    if (!session || !pending) return null;
    setIsBusy(true);
    setError(null);
    try {
      await ensureCloudReady(updateConnectivity, "检查验证状态");
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
  }, [completePendingRegistration, session, updateConnectivity]);

  const logout = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session ?? await loadAuthSessionSnapshot();
      markCurrentWorkspaceLoggedOut(current);
      // P1-N07: Token 过期时先受控 Refresh 再 logout，确保服务端会话被吊销
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
            // Refresh 失败时仍尝试用旧 token 注销（best-effort）
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
      await ensureCloudReady(updateConnectivity, "退出所有设备");
      markCurrentWorkspaceLoggedOut(current);
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
  }, [session, updateConnectivity]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const current = session && isAccessTokenFresh(session) ? session : await refreshSession();
      await ensureCloudReady(updateConnectivity, "修改密码");
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
  }, [refreshSession, session, updateConnectivity]);

  const returnToLoginFromBlocked = useCallback(async () => {
    const current = session ?? await loadAuthSessionSnapshot();
    // 6.3: 离开等待验证页时通知服务端取消注册
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
    pendingRegistration: session?.pendingRegistration ?? null,
    blocked,
    isBusy,
    error,
    connectivity,
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
    connectivity,
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

function canUseCachedSession(snapshot: AuthSessionSnapshot): boolean {
  if (!snapshot.user || !snapshot.refreshToken || !isAccountWorkspaceEnabled()) return false;
  const workspace = loadWorkspaceRegistry().workspaces[snapshot.user.id];
  return Boolean(
    workspace
    && workspace.schemaVersion === WORKSPACE_SCHEMA_VERSION
    && isWorkspaceOfflineAuthorized(workspace),
  );
}

function isAuthInvalidError(error: unknown): boolean {
  return error instanceof authApi.CloudAuthApiError && (error.status === 401 || error.status === 403);
}

async function ensureCloudReady(
  updateConnectivity: () => Promise<ConnectivityState>,
  action: string,
): Promise<void> {
  const cloud = await updateConnectivity();
  if (cloud !== "cloud_ready") throw new Error(`${action}需要连接云端`);
}

function markCurrentWorkspaceLoggedOut(snapshot: AuthSessionSnapshot): void {
  if (!isAccountWorkspaceEnabled() || !snapshot.user) return;
  const registry = markWorkspaceLoggedOut(snapshot.user.id);
  const workspace = registry.workspaces[snapshot.user.id];
  if (workspace) closeAccountWorkspaceDb(workspace.dbName);
}
