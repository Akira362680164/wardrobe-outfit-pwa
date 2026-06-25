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

let refreshPromise: Promise<AuthTokenPayload> | null = null;

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
  refreshPromise ??= requestJson<AuthTokenPayload>("/api/auth/refresh", {
    method: "POST",
    body: input,
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
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
  },
): Promise<T> {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
    const response = await CapacitorHttp.request({
      method: options.method,
      url,
      headers,
      data: options.body,
    });
    if (response.status >= 400) throw toAuthError(response.status, response.data);
    return response.data as T;
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await parseFetchJson(response);
  if (!response.ok) throw toAuthError(response.status, data);
  return data as T;
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
