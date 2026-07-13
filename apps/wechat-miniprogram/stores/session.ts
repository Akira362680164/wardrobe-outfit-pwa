export interface SessionUser {
  id: string;
  emailMasked?: string;
  emailVerified?: boolean;
  phoneMasked?: string;
  phoneVerified?: boolean;
  displayName?: string;
  avatarUrl?: string;
}

export interface SessionState {
  token: string;
  refreshToken?: string;
  deviceId?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  user?: SessionUser;
  pendingRefresh?: {
    requestId: string;
    refreshTokenPrefix: string;
    startedAt: number;
  };
}

let currentSession: SessionState | null = null;
const SESSION_STORAGE_KEY = "wardrobe-device-session-v1";

// ponytail: runtime-only store until the auth contract decides whether session persistence is allowed.
export function hydrateSession(snapshot?: SessionState | null): SessionState | null {
  currentSession = snapshot === undefined ? readStoredSession() : snapshot;
  return currentSession;
}

export function setSession(next: SessionState): SessionState {
  currentSession = next;
  wx.setStorageSync(SESSION_STORAGE_KEY, next);
  return currentSession;
}

export function getSession(): SessionState | null {
  return currentSession;
}

export function getAccessToken(): string | null {
  return currentSession?.token ?? null;
}

export function isLoggedIn(): boolean {
  if (!currentSession) return false;
  if (currentSession.refreshToken && (!currentSession.refreshTokenExpiresAt || currentSession.refreshTokenExpiresAt > Date.now())) return true;
  if (!currentSession.token) return false;
  return !currentSession.expiresAt || currentSession.expiresAt > Date.now();
}

export function clearSession(): void {
  currentSession = null;
  wx.removeStorageSync(SESSION_STORAGE_KEY);
}

function readStoredSession(): SessionState | null {
  const stored = wx.getStorageSync(SESSION_STORAGE_KEY) as SessionState | "";
  if (!stored || typeof stored !== "object" || !stored.deviceId || !stored.refreshToken) return null;
  return stored;
}
