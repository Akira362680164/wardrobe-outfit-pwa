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

export interface AccountMeResponse {
  user: AuthUserSnapshot;
  deviceId: string;
}

export interface SendEmailCodeResponse {
  status: "sent";
  emailMasked: string;
  cooldownSeconds: number;
  expiresInSeconds: number;
}

export interface AccountSecurityResponse {
  user: { id: string; displayName: string };
  email: { bound: boolean; masked?: string; verified: boolean };
  phone: { bound: boolean; masked?: string; verified: boolean; usage: "login_name" };
  wechat: { bound: boolean; appId?: string };
  password: { set: boolean; changedAt?: string };
}

const refreshPromiseMap = new Map<string, Promise<AuthTokenPayload>>();

export async function register(input: {
  email: string;
  emailCode: string;
  password: string;
  phone?: string;
  deviceId: string;
  deviceLabel: string;
}): Promise<AuthTokenPayload> {
  return requestJson("/api/auth/register", {
    method: "POST",
    body: input,
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

export async function login(input: {
  account: string;
  password: string;
  deviceId: string;
  deviceLabel: string;
}): Promise<AuthTokenPayload> {
  return requestJson("/api/auth/login", {
    method: "POST",
    body: input,
  });
}

export function sendEmailCode(input: {
  email: string;
  purpose: "register" | "reset_password" | "change_password";
}): Promise<SendEmailCodeResponse> {
  return requestJson("/api/auth/email/send-code", {
    method: "POST",
    body: input,
  });
}

export function requestPasswordReset(email: string): Promise<SendEmailCodeResponse> {
  return requestJson("/api/auth/password/reset/request", {
    method: "POST",
    body: { email },
  });
}

export function confirmPasswordReset(input: {
  email: string;
  emailCode: string;
  newPassword: string;
}): Promise<{ status: "ok" }> {
  return requestJson("/api/auth/password/reset/confirm", {
    method: "POST",
    body: input,
  });
}

export function refreshWithMutex(input: {
  refreshToken: string;
  refreshRequestId: string;
  deviceId: string;
}): Promise<AuthTokenPayload> {
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
  await requestJson("/api/auth/password/change", {
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

export async function getAccountSecurity(accessToken: string): Promise<AccountSecurityResponse> {
  return requestJson("/api/auth/account/security", {
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
    refreshToken?: string;
    deviceId?: string;
  },
): Promise<T> {
  const perform = async (token?: string): Promise<T> => {
    const url = buildUrl(path);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
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
    } catch (error) {
      if (error instanceof CloudAuthApiError) throw error;
      throw new CloudAuthApiError(0, "network_unavailable", "网络连接失败，请检查网络后重试");
    }
  };

  try {
    return await perform(options.accessToken);
  } catch (error) {
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
  if (status === 502 || status === 503 || status === 504) {
    return new CloudAuthApiError(status, "service_unavailable", "账号服务暂时不可用，请稍后重试");
  }
  return new CloudAuthApiError(status, "request_failed", "操作失败，请稍后重试");
}
