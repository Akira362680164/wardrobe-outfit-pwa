"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";

import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";
import { OnlineRequestError, toOnlineRequestError } from "@/lib/online/online-error";

export interface OnlineRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  responseType?: "json" | "blob";
  session?: Pick<AuthSessionSnapshot, "accessToken" | "deviceId">;
}

export interface OnlineRawResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  requestId: string;
}

export async function onlineRequest<T>(path: string, options: OnlineRequestOptions = {}): Promise<T> {
  return (await onlineRequestRaw<T>(path, options)).data;
}

export async function onlineRequestRaw<T>(path: string, options: OnlineRequestOptions = {}): Promise<OnlineRawResponse<T>> {
  const session = options.session ?? await loadAuthSessionSnapshot();
  if (!session.accessToken) throw new OnlineRequestError(401, "auth", "请重新登录后继续", false);

  const method = options.method ?? "GET";
  const responseType = options.responseType ?? "json";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const requestId = globalThis.crypto?.randomUUID?.() ?? `request-${Date.now()}`;
  const url = buildUrl(path);
  const headers: Record<string, string> = {
    Accept: responseType === "blob" ? "image/*" : "application/json",
    Authorization: `Bearer ${session.accessToken}`,
    "X-Wardrobe-Device-Id": session.deviceId,
    "X-Wardrobe-Request-Id": requestId,
    ...options.headers,
  };
  const isBlobBody = options.body instanceof Blob;
  if (options.body !== undefined && !isBlobBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const transport = Capacitor.isNativePlatform() && !isBlobBody && /^https?:\/\//.test(url)
    ? "capacitor_http"
    : "fetch";
  const startedAt = Date.now();

  recordDiagnosticEvent("network", "online_workspace_request", {
    phase: "started", severity: "info", requestId, endpoint: path, method, transport,
  });
  try {
    let result: OnlineRawResponse<T>;
    if (transport === "capacitor_http") {
      const response = await CapacitorHttp.request({
        method,
        url,
        headers,
        data: options.body,
        responseType: responseType === "blob" ? "blob" : "json",
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const responseHeaders = normalizeHeaders(response.headers);
      if (response.status >= 400) throw toOnlineRequestError(response.status, response.data, header(responseHeaders, "x-wardrobe-request-id") ?? requestId);
      const data = responseType === "blob"
        ? nativeBase64ToBlob(String(response.data), header(responseHeaders, "content-type") ?? "application/octet-stream")
        : response.data;
      result = { data: data as T, status: response.status, headers: responseHeaders, requestId: header(responseHeaders, "x-wardrobe-request-id") ?? requestId };
    } else {
      result = await requestWithFetch<T>(url, path, requestId, headers, { ...options, method, responseType, timeoutMs });
    }
    recordDiagnosticEvent("network", "online_workspace_request", {
      phase: "succeeded", severity: "info", requestId: result.requestId, endpoint: path, method, transport,
      httpStatus: result.status, durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const normalized = normalizeFailure(error, requestId);
    recordDiagnosticEvent("network", "online_workspace_request", {
      phase: "failed", severity: "error", requestId: normalized.requestId ?? requestId, endpoint: path, method, transport,
      httpStatus: normalized.status || undefined, errorCode: normalized.code, durationMs: Date.now() - startedAt,
    });
    throw normalized;
  }
}

export function nativeBase64ToBlob(base64: string, mimeType: string): Blob {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

async function requestWithFetch<T>(
  url: string,
  path: string,
  requestId: string,
  headers: Record<string, string>,
  options: Required<Pick<OnlineRequestOptions, "method" | "responseType" | "timeoutMs">> & OnlineRequestOptions,
): Promise<OnlineRawResponse<T>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = globalThis.setTimeout(abort, options.timeoutMs);
  try {
    const body = options.body instanceof Blob && Capacitor.isNativePlatform()
      ? new File([options.body], `wardrobe-upload-${requestId}`, { type: options.body.type })
      : options.body instanceof Blob || typeof options.body === "string"
        ? options.body
        : options.body === undefined ? undefined : JSON.stringify(options.body);
    const response = await fetch(url, { method: options.method, headers, body, signal: controller.signal, cache: "no-store" });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const data = options.responseType === "blob" ? await response.blob() : await parseJson(response);
    const serverRequestId = header(responseHeaders, "x-wardrobe-request-id") ?? requestId;
    if (!response.ok) throw toOnlineRequestError(response.status, data, serverRequestId);
    return { data: data as T, status: response.status, headers: responseHeaders, requestId: serverRequestId };
  } catch (error) {
    if (error instanceof OnlineRequestError) throw error;
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new OnlineRequestError(0, "timeout", "请求超时，请稍后重试", true, requestId);
    }
    if (options.signal?.aborted) throw error;
    throw new OnlineRequestError(0, "network", `网络连接失败，无法访问${path.startsWith("/api/assets/") ? "图片" : "云端衣橱"}`, true, requestId);
  } finally {
    globalThis.clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

function normalizeFailure(error: unknown, requestId: string): OnlineRequestError {
  if (error instanceof OnlineRequestError) return error;
  return new OnlineRequestError(0, "network", "网络连接失败，请检查网络后重试", true, requestId);
}

function buildUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_WARDROBE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  return baseUrl ? `${baseUrl}${path}` : path;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { code: "invalid_request", message: text, retryable: false }; }
}

function normalizeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item)]));
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
