import type { WorkspaceErrorCode, WorkspaceErrorResponse } from "@wardrobe/cloud-contracts";

export class OnlineRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: WorkspaceErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly requestId?: string,
    readonly serverData?: unknown,
    readonly retryAfterSeconds?: number,
    readonly details?: { reasonCode: string },
  ) {
    super(message);
    this.name = "OnlineRequestError";
  }
}

export function toOnlineRequestError(status: number, value: unknown, requestId?: string, retryAfterHeader?: string): OnlineRequestError {
  if (isWorkspaceError(value)) {
    return new OnlineRequestError(
      status,
      value.code,
      value.message,
      value.retryable,
      value.requestId ?? requestId,
      value.serverData,
      positiveInteger(value.retryAfterSeconds) ?? parseRetryAfter(retryAfterHeader),
      controlledDetails(value.details),
    );
  }
  if (status === 401 || status === 403) {
    return new OnlineRequestError(status, "auth", "登录状态已失效，请重新登录", false, requestId, undefined, parseRetryAfter(retryAfterHeader));
  }
  if (status === 404) {
    return new OnlineRequestError(status, "not_found", "内容不存在或已被删除", false, requestId, undefined, parseRetryAfter(retryAfterHeader));
  }
  if (status === 409) {
    return new OnlineRequestError(status, "conflict", "内容已在其他设备更新，请刷新后重试", true, requestId, value, parseRetryAfter(retryAfterHeader));
  }
  return new OnlineRequestError(status, "server", "服务器暂时不可用，请稍后重试", status >= 500, requestId, value, parseRetryAfter(retryAfterHeader));
}

function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? Math.ceil((date - now) / 1000) : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function controlledDetails(value: unknown): { reasonCode: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const reasonCode = (value as Record<string, unknown>).reasonCode;
  return typeof reasonCode === "string" && reasonCode.length > 0 && reasonCode.length <= 120 ? { reasonCode } : undefined;
}

export function onlineErrorMessage(error: unknown): string {
  if (error instanceof OnlineRequestError) return error.message;
  return error instanceof Error && error.message ? error.message : "网络连接失败，请检查网络后重试";
}

function isWorkspaceError(value: unknown): value is WorkspaceErrorResponse {
  if (!value || typeof value !== "object") return false;
  const error = value as Partial<WorkspaceErrorResponse>;
  return typeof error.code === "string" && typeof error.message === "string" && typeof error.retryable === "boolean";
}
