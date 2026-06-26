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
    offlineAccessUntil: computeOfflineAccessUntil(tokens.refreshTokenExpiresAt),
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

export function computeOfflineAccessUntil(refreshTokenExpiresAt: string, now = new Date()): string {
  const refreshExpiry = Date.parse(refreshTokenExpiresAt);
  const maxOffline = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  return new Date(Math.min(refreshExpiry, maxOffline)).toISOString();
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
      // P1-N06: 原生平台安全存储失败时抛错，要求重新登录，禁止降级到 sessionStorage
      throw new Error("本机安全存储不可用，请重新登录");
    }
  }
  // 仅浏览器开发环境使用 sessionStorage
  return getSessionStorage()?.getItem(key) ?? null;
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await secureStorage.set({ key, value });
      return;
    } catch {
      throw new Error("本机安全存储不可用，请重新登录");
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
