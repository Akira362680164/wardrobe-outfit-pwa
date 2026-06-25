"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface AuthUserSnapshot {
  id: string;
  maskedPhone: string;
}

export interface PendingRegistrationSnapshot {
  registrationId: string;
  clientSecret: string;
  maskedPhone: string;
  expiresAt: string;
}

export interface LocalOwnerSnapshot {
  userId: string;
  maskedPhone: string;
  boundAt: string;
}

export interface AuthSessionSnapshot {
  deviceId: string;
  deviceLabel: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  user?: AuthUserSnapshot;
  pendingRegistration?: PendingRegistrationSnapshot;
  offlineAccessUntil?: string;
  localOwner?: LocalOwnerSnapshot;
}

export interface AuthTokenPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthUserSnapshot;
}

interface WardrobeSecureStoragePlugin {
  get(options: { key: string }): Promise<{ value?: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const secureStorage = registerPlugin<WardrobeSecureStoragePlugin>("WardrobeSecureStorage");

const AUTH_SESSION_KEY = "wardrobe-cloud-auth-session-v1";

export async function loadAuthSessionSnapshot(): Promise<AuthSessionSnapshot> {
  const parsed = parseSessionSnapshot(await readSecureValue(AUTH_SESSION_KEY));
  if (parsed) return parsed;

  const fresh: AuthSessionSnapshot = {
    deviceId: createDeviceId(),
    deviceLabel: createDeviceLabel(),
  };
  await saveAuthSessionSnapshot(fresh);
  return fresh;
}

export async function saveAuthSessionSnapshot(snapshot: AuthSessionSnapshot): Promise<void> {
  await writeSecureValue(AUTH_SESSION_KEY, JSON.stringify(snapshot));
}

export async function saveAuthTokens(snapshot: AuthSessionSnapshot, tokens: AuthTokenPayload): Promise<AuthSessionSnapshot> {
  const next: AuthSessionSnapshot = {
    ...snapshot,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    user: tokens.user,
    pendingRegistration: undefined,
  };
  await saveAuthSessionSnapshot(next);
  return next;
}

export async function savePendingRegistration(
  snapshot: AuthSessionSnapshot,
  pendingRegistration: PendingRegistrationSnapshot,
): Promise<AuthSessionSnapshot> {
  const next = {
    ...snapshot,
    pendingRegistration,
  };
  await saveAuthSessionSnapshot(next);
  return next;
}

export async function clearAuthTokens(snapshot: AuthSessionSnapshot): Promise<AuthSessionSnapshot> {
  const next: AuthSessionSnapshot = {
    deviceId: snapshot.deviceId,
    deviceLabel: snapshot.deviceLabel,
    localOwner: snapshot.localOwner,
  };
  await saveAuthSessionSnapshot(next);
  return next;
}

export async function bindLocalOwnerIfNeeded(
  snapshot: AuthSessionSnapshot,
  user: AuthUserSnapshot,
): Promise<{ snapshot: AuthSessionSnapshot; blocked: false } | { snapshot: AuthSessionSnapshot; blocked: true; owner: LocalOwnerSnapshot }> {
  if (snapshot.localOwner && snapshot.localOwner.userId !== user.id) {
    return { snapshot, blocked: true, owner: snapshot.localOwner };
  }

  const next: AuthSessionSnapshot = snapshot.localOwner
    ? snapshot
    : {
        ...snapshot,
        localOwner: {
          userId: user.id,
          maskedPhone: user.maskedPhone,
          boundAt: new Date().toISOString(),
        },
      };
  if (next !== snapshot) await saveAuthSessionSnapshot(next);
  return { snapshot: next, blocked: false };
}

export function isAccessTokenFresh(snapshot: AuthSessionSnapshot, skewMs = 60_000): boolean {
  if (!snapshot.accessToken || !snapshot.accessTokenExpiresAt) return false;
  return Date.parse(snapshot.accessTokenExpiresAt) - skewMs > Date.now();
}

export function createRefreshRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `refresh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseSessionSnapshot(raw: string | null): AuthSessionSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSessionSnapshot>;
    if (!parsed.deviceId || !parsed.deviceLabel) return null;
    return parsed as AuthSessionSnapshot;
  } catch {
    return null;
  }
}

async function readSecureValue(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await secureStorage.get({ key });
      return result.value ?? null;
    } catch {
      // Native plugin is registered by the Android shell. Browser dev and older builds fall through.
    }
  }
  return getSessionStorage()?.getItem(key) ?? null;
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await secureStorage.set({ key, value });
      return;
    } catch {
      // Native plugin unavailable in web dev or pre-A5 APKs.
    }
  }
  getSessionStorage()?.setItem(key, value);
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function createDeviceId(): string {
  return `device-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function createDeviceLabel(): string {
  if (Capacitor.getPlatform() === "android") return "Android 手机";
  return "浏览器开发环境";
}
