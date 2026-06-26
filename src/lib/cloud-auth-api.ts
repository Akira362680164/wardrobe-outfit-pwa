"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { AuthTokenPayload, AuthUserSnapshot } from "@/lib/auth-session-store";

export interface AuthApiErrorBody {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export class CloudAuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface RegistrationResponse {
  registrationId: string;
  clientSecret: string;
  maskedPhone: string;
  expiresAt: string;
}

export interface RegistrationStatusResponse {
  status: "pending" | "verified" | "expired" | "cancelled" | "completed";
  expiresAt: string;
  serverTime: string;
}

export interface AccountMeResponse {
  user: AuthUserSnapshot;
  deviceId: string;
}

// P1-N05: 按 refreshToken 指纹 + deviceId 隔离，防止不同账号复用同一 Promise
const refreshPromiseMap = new Map<string, Promise<AuthTokenPayload>>();

export async function requestRegistration(input: { phone: string; password: string }): Promise<RegistrationResponse> {
  return requestJson("/api/auth/registrations", {
    method: "POST",
    body: input,
  });
}

export async function requestRegistrationStatus(input: {
  registrationId: string;
  clientSecret: string;
  deviceId: string;
}): Promise<RegistrationStatusResponse> {
  return requestJson(`/api/auth/registrations/${encodeURIComponent(input.registrationId)}/status`, {
    method: "POST",
    body: {
      clientSecret: input.clientSecret,
      deviceId: input.deviceId,
    },
  });
}

export async function cancelRegistration(input: {
  registrationId: string;
  clientSecret: string;
}): Promise<{ status: string }> {
  return requestJson(`/api/auth/registrations/${encodeURIComponent(input.registrationId)}/cancel`, {
    method: "POST",
    body: {
      clientSecret: input.clientSecret,
    },
  });
}

export async function completeRegistration(input: {
  registrationId: string;
  clientSecret: string;
  deviceId: string;
}): Promise<AuthTokenPayload> {
  return requestJson(`/api/auth/registrations/${encodeURIComponent(input.registrationId)}/complete`, {
    method: "POST",
    body: {
      clientSecret: input.clientSecret,
      deviceId: input.deviceId,
    },
  });
}

export async function login(input: {
  phone: string;
  password: string;
  deviceId: string;
  deviceLabel: string;
}): Promise<AuthTokenPayload> {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: input,
  });
}

export function refreshWithMutex(input: {
  refreshToken: string;
  refreshRequestId: string;
  deviceId: string;
}): Promise<AuthTokenPayload> {
  // P1-N05: 按 refreshToken 前 16 位 + deviceId 隔离
  const key = `${input.refreshToken.slice(0, 16)}:${input.deviceId}`;
  const existing = refreshPromiseMap.get(key);
  if (existing) return existing;
  const promise = requestJson<AuthTokenPayload>("/api/auth/refresh", {
    method: "POST",
    body: input,
  }).finally(() => {
    refreshPromiseMap.delete(key);
  });
  refreshPromiseMap.set(key, promise);
  return promise;
}

export async function logout(accessToken: string): Promise<void> {
  await requestJson("/api/auth/logout", {
    method: "POST",
    accessToken,
  });
}

export async function logoutAll(accessToken: string): Promise<void> {
  await requestJson("/api/auth/logout-all", {
    method: "POST",
    accessToken,
  });
}

export async function changePassword(input: {
  accessToken: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await requestJson("/api/auth/change-password", {
    method: "POST",
    accessToken: input.accessToken,
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
  });
}

export async function getAccountMe(accessToken: string): Promise<AccountMeResponse> {
  return requestJson("/api/account/me", {
    method: "GET",
    accessToken,
  });
}

async function requestJson<T>(
  path: string,
  options: {
    method: "GET" | "POST";
    body?: unknown;
    accessToken?: string;
    // P1-N04: 自动刷新凭证（仅非 auth 请求使用）
    refreshToken?: string;
    deviceId?: string;
  },
): Promise<T> {
  const perform = async (token?: string): Promise<T> => {
    const url = buildUrl(path);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
      const response = await CapacitorHttp.request({
        method: options.method,
        url,
        headers,
        data: options.body,
        connectTimeout: 30_000,
        readTimeout: 30_000,
      });
      if (response.status >= 400) throw toAuthError(response.status, response.data);
      return response.data as T;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const data = await parseFetchJson(response);
      if (!response.ok) throw toAuthError(response.status, data);
      return data as T;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    return await perform(options.accessToken);
  } catch (error) {
    // P1-N04: 401 时若有 refresh 凭证，自动刷新后重放一次
    if (
      error instanceof CloudAuthApiError &&
      error.status === 401 &&
      options.refreshToken &&
      options.deviceId &&
      path !== "/api/auth/refresh" &&
      path !== "/api/auth/login"
    ) {
      const newTokens = await refreshWithMutex({
        refreshToken: options.refreshToken,
        refreshRequestId: `auto-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        deviceId: options.deviceId,
      });
      return perform(newTokens.accessToken);
    }
    throw error;
  }
}

function buildUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_WARDROBE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  if (!baseUrl) return path;
  return `${baseUrl}${path}`;
}

async function parseFetchJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { code: "invalid_response", message: text };
  }
}

function toAuthError(status: number, data: unknown): CloudAuthApiError {
  if (data && typeof data === "object" && "code" in data && "message" in data) {
    const body = data as AuthApiErrorBody;
    return new CloudAuthApiError(status, body.code, body.message, body.retryAfterSeconds);
  }
  return new CloudAuthApiError(status, "request_failed", "账号服务暂时不可用");
}
