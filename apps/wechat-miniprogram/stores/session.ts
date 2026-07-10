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
}

let currentSession: SessionState | null = null;

// ponytail: runtime-only store until the auth contract decides whether session persistence is allowed.
export function hydrateSession(snapshot?: SessionState | null): SessionState | null {
  currentSession = snapshot ?? null;
  return currentSession;
}

export function setSession(next: SessionState): SessionState {
  currentSession = next;
  return currentSession;
}

export function getSession(): SessionState | null {
  return currentSession;
}

export function getAccessToken(): string | null {
  return currentSession?.token ?? null;
}

export function isLoggedIn(): boolean {
  if (!currentSession?.token) return false;
  if (!currentSession.expiresAt) return true;
  return currentSession.expiresAt > Date.now();
}

export function clearSession(): void {
  currentSession = null;
}
