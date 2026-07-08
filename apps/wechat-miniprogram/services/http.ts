import { clearSession, getAccessToken, getSession } from "../stores/session";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  path: string;
  data?: unknown;
  auth?: boolean;
  toast?: boolean;
  timeoutMs?: number;
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
  ) {
    super(message);
  }
}

let apiBaseUrl = "";

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
  const requestId = requestIdForTrace();
  const header = buildHeaders(options.auth !== false, requestId);

  return new Promise<T>((resolve, reject) => {
    wx.request<T>({
      url: buildUrl(options.path),
      method: options.method ?? "GET",
      data: options.data,
      header,
      timeout: options.timeoutMs ?? 30000,
      success: (result) => {
        handleResponse(result.statusCode, result.data, result.header, requestId, options.toast !== false)
          .then(resolve)
          .catch(reject);
      },
      fail: (error) => reject(toNetworkError(error, requestId, options.toast !== false)),
    });
  });
}

export async function uploadFile<T = unknown>(options: UploadOptions): Promise<T> {
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
        handleResponse<T>(result.statusCode, data, result.header, requestId, true).then(resolve).catch(reject);
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
): Promise<T> {
  if (statusCode < 400) return data;

  const body = normalizeErrorBody(data);
  const requestId = header?.["X-Wardrobe-Request-Id"] ?? header?.["x-wardrobe-request-id"] ?? fallbackRequestId;
  const error = new HttpError(statusCode, body.code, body.message, requestId);
  if (statusCode === 401) {
    clearSession();
    wx.redirectTo({ url: "/pages/login/index" });
  }
  if (toast) wx.showToast({ title: body.message, icon: "none" });
  throw error;
}

function normalizeErrorBody(data: unknown): { code: string; message: string } {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    return {
      code: typeof record.code === "string" ? record.code : "request_failed",
      message: typeof record.message === "string" ? record.message : "请求失败，请稍后重试",
    };
  }
  return { code: "request_failed", message: "请求失败，请稍后重试" };
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
