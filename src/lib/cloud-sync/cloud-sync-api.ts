// src/lib/cloud-sync/cloud-sync-api.ts
// v1.1.37 cloud 1B B4: cloud sync API client
// 镜像 cloud-auth-api.ts 的 fetch / CapacitorHttp 双轨模式 + base URL + error class。
// 业务写入接口（push / pull / bootstrap / resolveConflict）都在这里。

"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type {
  BootstrapRequest,
  BootstrapResponse,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  ResolveConflictRequest,
  ResolveConflictResponse,
} from "@wardrobe/cloud-contracts";

export interface CloudSyncApiErrorBody {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}

export class CloudSyncApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export interface CloudSyncRequestOptions {
  accessToken: string;
  deviceId: string;
}

export async function requestBootstrap(
  request: BootstrapRequest,
  options: CloudSyncRequestOptions,
): Promise<BootstrapResponse> {
  return requestJson<BootstrapResponse>("/api/sync/bootstrap", request, options);
}

export async function requestPush(
  request: PushRequest,
  options: CloudSyncRequestOptions,
): Promise<PushResponse> {
  return requestJson<PushResponse>("/api/sync/push", request, options);
}

export async function requestPull(
  request: PullRequest,
  options: CloudSyncRequestOptions,
): Promise<PullResponse> {
  return requestJson<PullResponse>("/api/sync/pull", request, options);
}

export async function requestResolveConflict(
  request: ResolveConflictRequest,
  options: CloudSyncRequestOptions,
): Promise<ResolveConflictResponse> {
  return requestJson<ResolveConflictResponse>(
    "/api/sync/resolve-conflict",
    request,
    options,
  );
}

async function requestJson<TResponse>(
  path: string,
  body: unknown,
  options: CloudSyncRequestOptions,
): Promise<TResponse> {
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${options.accessToken}`,
    "Content-Type": "application/json",
    "X-Wardrobe-Device-Id": options.deviceId,
  };

  if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
    const response = await CapacitorHttp.request({
      method: "POST",
      url,
      headers,
      data: body,
    });
    if (response.status >= 400) throw toSyncError(response.status, response.data);
    return response.data as TResponse;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await parseFetchJson(response);
  if (!response.ok) throw toSyncError(response.status, data);
  return data as TResponse;
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

function toSyncError(status: number, data: unknown): CloudSyncApiError {
  if (data && typeof data === "object" && "code" in data && "message" in data) {
    const body = data as CloudSyncApiErrorBody;
    return new CloudSyncApiError(status, body.code, body.message, body.retryAfterSeconds);
  }
  return new CloudSyncApiError(status, "request_failed", "云端同步暂时不可用");
}
