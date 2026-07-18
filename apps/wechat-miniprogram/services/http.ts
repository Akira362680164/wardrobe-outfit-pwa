import { clearSession, getAccessToken, getSession, setSession, type SessionState } from "../stores/session";
import type { MiniAbortSignal } from "../utils/request-cancellation";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  path: string;
  data?: unknown;
  auth?: boolean;
  toast?: boolean;
  timeoutMs?: number;
  signal?: MiniAbortSignal;
}

export interface UploadOptions {
  path: string;
  filePath: string;
  name?: string;
  formData?: Record<string, string>;
  auth?: boolean;
  timeoutMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly retryable = false,
    public readonly retryAfterSeconds?: number,
    public readonly details?: { reasonCode: string },
  ) {
    super(message);
  }
}

let apiBaseUrl = "";
let refreshPromise: Promise<SessionState> | null = null;
const REFRESH_RETRY_WINDOW_MS = 5 * 60 * 1000;

export function configureHttp(options: { baseUrl: string }): void {
  apiBaseUrl = options.baseUrl.replace(/\/$/, "");
}

export function getConfiguredApiBaseUrl(): string {
  const app = getApp<{ globalData?: { apiBaseUrl?: string } }>();
  return (apiBaseUrl || app.globalData?.apiBaseUrl || "").replace(/\/$/, "");
}

export function buildAuthHeaders(requestId = requestIdForTrace()): Record<string, string> {
  return buildHeaders(true, requestId);
}

export async function request<T>(options: RequestOptions): Promise<T> {
  return performRequest<T>(options, false);
}

async function performRequest<T>(options: RequestOptions, replayed: boolean): Promise<T> {
  const requestId = requestIdForTrace();
  const header = buildHeaders(options.auth !== false, requestId);

  return new Promise<T>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("请求已取消"));
      return;
    }
    let settled = false;
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    const task = wx.request<T>({
      url: buildUrl(options.path),
      method: options.method ?? "GET",
      data: options.data,
      header,
      timeout: options.timeoutMs ?? 30000,
      success: (result) => {
        settled = true;
        cleanup();
        handleResponse(result.statusCode, result.data, result.header, requestId, options.toast !== false, options.auth !== false, replayed)
          .then(async (data): Promise<T> => data === RETRY_AFTER_REFRESH ? performRequest<T>(options, true) : data)
          .then(resolve)
          .catch(reject);
      },
      fail: (error) => {
        settled = true;
        cleanup();
        reject(options.signal?.aborted ? new Error("请求已取消") : toNetworkError(error, requestId, options.toast !== false));
      },
    });
    function abort() {
      if (settled) return;
      task.abort();
    }
    options.signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function uploadFile<T = unknown>(options: UploadOptions): Promise<T> {
  return performUpload<T>(options, false);
}

async function performUpload<T>(options: UploadOptions, replayed: boolean): Promise<T> {
  const requestId = requestIdForTrace();
  const header = buildHeaders(options.auth !== false, requestId);

  return new Promise<T>((resolve, reject) => {
    wx.uploadFile({
      url: buildUrl(options.path),
      filePath: options.filePath,
      name: options.name ?? "file",
      formData: options.formData,
      header,
      timeout: options.timeoutMs ?? 60000,
      success: (result) => {
        const data = parseUploadData(result.data) as T;
        handleResponse<T>(result.statusCode, data, result.header, requestId, true, options.auth !== false, replayed)
          .then(async (value): Promise<T> => value === RETRY_AFTER_REFRESH ? performUpload<T>(options, true) : value)
          .then(resolve).catch(reject);
      },
      fail: (error) => reject(toNetworkError(error, requestId, true)),
    });
  });
}

function buildUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;

  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) throw new HttpError(0, "missing_api_base_url", "请先配置后端 API 域名");
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildHeaders(auth: boolean, requestId: string): Record<string, string> {
  const header: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Wardrobe-Request-Id": requestId,
  };

  const token = getAccessToken();
  if (auth && token) header.Authorization = `Bearer ${token}`;
  const session = getSession();
  if (auth && session?.deviceId) header["X-Wardrobe-Device-Id"] = session.deviceId;
  return header;
}

async function handleResponse<T>(
  statusCode: number,
  data: T,
  header: Record<string, string> | undefined,
  fallbackRequestId: string,
  toast: boolean,
  auth: boolean,
  replayed: boolean,
): Promise<T | typeof RETRY_AFTER_REFRESH> {
  if (statusCode < 400) return data;

  const body = normalizeErrorBody(data);
  const error = httpErrorFromResponse(statusCode, data, header, fallbackRequestId);
  if (statusCode === 401 && auth && !replayed) {
    await recoverSession(true);
    return RETRY_AFTER_REFRESH;
  }
  if (statusCode === 401 && isExplicitRevocation(body.code)) {
    clearSession();
    wx.redirectTo({ url: "/pages/login/index" });
  }
  if (toast) wx.showToast({ title: body.message, icon: "none" });
  throw error;
}

const RETRY_AFTER_REFRESH = Symbol("retry-after-refresh");

export async function recoverSession(force = false): Promise<SessionState> {
  const session = getSession();
  if (!session?.refreshToken || !session.deviceId) throw new HttpError(401, "AUTH_SESSION_MISSING", "请重新登录后继续");
  if (!force && session.expiresAt && session.expiresAt > Date.now() + 60_000) return session;
  if (refreshPromise) return refreshPromise;
  const pending = session.pendingRefresh;
  const pendingIsReusable = pending
    && pending.refreshTokenPrefix === session.refreshToken.slice(0, 16)
    && pending.startedAt + REFRESH_RETRY_WINDOW_MS > Date.now();
  const refreshRequestId = pendingIsReusable ? pending.requestId : createUuid();
  const prepared: SessionState = {
    ...session,
    pendingRefresh: {
      requestId: refreshRequestId,
      refreshTokenPrefix: session.refreshToken.slice(0, 16),
      startedAt: pendingIsReusable ? pending.startedAt : Date.now(),
    },
  };
  setSession(prepared);
  refreshPromise = rawRefresh(prepared, refreshRequestId).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function rawRefresh(session: SessionState, refreshRequestId: string): Promise<SessionState> {
  return new Promise((resolve, reject) => {
    wx.request<Record<string, any>>({
      url: buildUrl("/api/auth/refresh"), method: "POST",
      data: { refreshToken: session.refreshToken, refreshRequestId, deviceId: session.deviceId },
      header: { Accept: "application/json", "Content-Type": "application/json" }, timeout: 30000,
      success: (result) => {
        if (result.statusCode >= 400) {
          const error = httpErrorFromResponse(result.statusCode, result.data, result.header, refreshRequestId);
          if (isExplicitRevocation(error.code)) {
            clearSession();
            wx.redirectTo({ url: "/pages/login/index" });
          }
          reject(error);
          return;
        }
        const data = result.data;
        resolve(setSession({ token: data.accessToken, refreshToken: data.refreshToken, deviceId: session.deviceId,
          expiresAt: Date.parse(data.accessTokenExpiresAt), refreshTokenExpiresAt: Date.parse(data.refreshTokenExpiresAt), user: data.user }));
      },
      fail: () => reject(new HttpError(0, "network", "网络连接失败，请检查网络后重试", refreshRequestId, true)),
    });
  });
}

function isExplicitRevocation(code: string): boolean {
  return ["AUTH_SESSION_REVOKED", "AUTH_REFRESH_REUSED", "AUTH_TOKEN_INVALID", "account_deleted"].includes(code);
}

function createUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function normalizeErrorBody(data: unknown): { code: string; message: string; retryable: boolean; retryAfterSeconds?: number; requestId?: string; details?: { reasonCode: string } } {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const details = controlledDetails(record.details);
    return {
      code: typeof record.code === "string" ? record.code : "request_failed",
      message: typeof record.message === "string" ? record.message : "请求失败，请稍后重试",
      retryable: typeof record.retryable === "boolean" ? record.retryable : false,
      ...(positiveInteger(record.retryAfterSeconds) === undefined ? {} : { retryAfterSeconds: positiveInteger(record.retryAfterSeconds) }),
      ...(typeof record.requestId === "string" && record.requestId ? { requestId: record.requestId } : {}),
      ...(details ? { details } : {}),
    };
  }
  return { code: "request_failed", message: "请求失败，请稍后重试", retryable: false };
}

export function httpErrorFromResponse(statusCode: number, data: unknown, header: Record<string, string> | undefined, fallbackRequestId: string): HttpError {
  const body = normalizeErrorBody(data);
  const headerRequestId = headerValue(header, "x-wardrobe-request-id");
  return new HttpError(
    statusCode, body.code, body.message, body.requestId ?? headerRequestId ?? fallbackRequestId,
    body.retryable, body.retryAfterSeconds ?? parseRetryAfter(headerValue(header, "retry-after")), body.details,
  );
}

function controlledDetails(value: unknown): { reasonCode: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const reasonCode = (value as Record<string, unknown>).reasonCode;
  return typeof reasonCode === "string" && reasonCode.length > 0 && reasonCode.length <= 120 ? { reasonCode } : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function headerValue(header: Record<string, string> | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const key = Object.keys(header).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? header[key] : undefined;
}

function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? Math.ceil((date - now) / 1000) : undefined;
}

function toNetworkError(error: unknown, requestId: string, toast: boolean): HttpError {
  const message = error instanceof Error ? error.message : "网络连接失败，请检查后重试";
  if (toast) wx.showToast({ title: message, icon: "none" });
  return new HttpError(0, "network", message, requestId);
}

function parseUploadData(data: string): unknown {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return { code: "invalid_upload_response", message: data };
  }
}

function requestIdForTrace(): string {
  return `mini-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
