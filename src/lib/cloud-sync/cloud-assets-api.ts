"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type {
  AssetUploadAuthorizeRequest,
  AssetUploadAuthorizeResponse,
  AssetUploadCompleteRequest,
  AssetUploadCompleteResponse,
} from "@wardrobe/cloud-contracts";

import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";
import { CloudSyncApiError, type CloudSyncApiErrorBody } from "@/lib/cloud-sync/cloud-sync-api";

export function requestAssetUploadUrl(
  request: AssetUploadAuthorizeRequest,
  options: CloudSyncRequestOptions,
): Promise<AssetUploadAuthorizeResponse> {
  return requestJson<AssetUploadAuthorizeResponse>("/api/assets/upload-url", request, options);
}

export function requestAssetUploadComplete(
  request: AssetUploadCompleteRequest,
  options: CloudSyncRequestOptions,
): Promise<AssetUploadCompleteResponse> {
  return requestJson<AssetUploadCompleteResponse>("/api/assets/complete-upload", request, options);
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
    if (response.status >= 400) throw toAssetsError(response.status, response.data);
    return response.data as TResponse;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await parseFetchJson(response);
  if (!response.ok) throw toAssetsError(response.status, data);
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

function toAssetsError(status: number, data: unknown): CloudSyncApiError {
  if (data && typeof data === "object" && "code" in data && "message" in data) {
    const body = data as CloudSyncApiErrorBody;
    return new CloudSyncApiError(status, body.code, body.message, body.retryAfterSeconds);
  }
  return new CloudSyncApiError(status, "request_failed", "图片资产服务暂时不可用");
}
