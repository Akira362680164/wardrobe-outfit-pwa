"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type {
  AssetDeleteResponse,
  AssetDownloadParams,
  AssetManifestRequest,
  AssetManifestResponse,
  AssetUploadHeaders,
  AssetUploadParams,
  AssetUploadResponse,
} from "@wardrobe/cloud-contracts";

import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";
import { CloudSyncApiError, type CloudSyncApiErrorBody } from "@/lib/cloud-sync/cloud-sync-api";

export interface UploadAssetContentRequest {
  params: AssetUploadParams;
  metadata: Omit<AssetUploadHeaders, "content-type">;
  blob: Blob;
}

export interface DownloadedAssetContent {
  blob: Blob;
  sha256: string;
  mimeType: string;
}

export async function uploadAssetContent(
  request: UploadAssetContentRequest,
  options: CloudSyncRequestOptions,
): Promise<AssetUploadResponse> {
  const path = assetContentPath(request.params);
  const headers = authHeaders(options, {
    Accept: "application/json",
    "Content-Type": request.blob.type,
    "X-Asset-Owner-Entity-Type": request.metadata["x-asset-owner-entity-type"],
    "X-Asset-Owner-Entity-Id": request.metadata["x-asset-owner-entity-id"],
    "X-Asset-Sha256": request.metadata["x-asset-sha256"],
    "X-Asset-Size-Bytes": String(request.metadata["x-asset-size-bytes"]),
  });
  if (request.metadata["x-asset-width"] != null) {
    headers["X-Asset-Width"] = String(request.metadata["x-asset-width"]);
  }
  if (request.metadata["x-asset-height"] != null) {
    headers["X-Asset-Height"] = String(request.metadata["x-asset-height"]);
  }

  const response = await requestBinary("PUT", path, options, headers, request.blob, "json");
  return response.data as AssetUploadResponse;
}

export async function downloadAssetContent(
  request: AssetDownloadParams,
  options: CloudSyncRequestOptions,
): Promise<DownloadedAssetContent> {
  const response = await requestBinary(
    "GET",
    assetContentPath(request),
    options,
    authHeaders(options, { Accept: "image/*" }),
    undefined,
    "arraybuffer",
  );
  const mimeType = headerValue(response.headers, "content-type");
  const sha256 = headerValue(response.headers, "x-asset-sha256");
  if (!mimeType?.startsWith("image/") || !/^[a-f0-9]{64}$/.test(sha256 ?? "")) {
    throw new CloudSyncApiError(502, "invalid_asset_response", "图片资产响应缺少有效的类型或摘要");
  }
  return {
    blob: new Blob([toArrayBuffer(response.data)], { type: mimeType }),
    sha256: sha256!,
    mimeType,
  };
}

export function deleteCloudAsset(
  assetId: string,
  options: CloudSyncRequestOptions,
): Promise<AssetDeleteResponse> {
  return requestJson<AssetDeleteResponse>("DELETE", `/api/assets/${encodeURIComponent(assetId)}`, undefined, options);
}

export function requestAssetManifest(
  request: AssetManifestRequest,
  options: CloudSyncRequestOptions,
): Promise<AssetManifestResponse> {
  return requestJson<AssetManifestResponse>("POST", "/api/assets/manifest", request, options);
}

async function requestJson<TResponse>(
  method: "POST" | "DELETE",
  path: string,
  body: unknown,
  options: CloudSyncRequestOptions,
): Promise<TResponse> {
  const url = buildUrl(path);
  const headers = authHeaders(options, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
    const response = await CapacitorHttp.request({ method, url, headers, data: body });
    if (response.status >= 400) throw toAssetsError(response.status, response.data);
    return response.data as TResponse;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await parseFetchJson(response);
  if (!response.ok) throw toAssetsError(response.status, data);
  return data as TResponse;
}

async function requestBinary(
  method: "GET" | "PUT",
  path: string,
  options: CloudSyncRequestOptions,
  headers: Record<string, string>,
  body: Blob | undefined,
  responseType: "arraybuffer" | "json",
): Promise<{ data: unknown; headers: Record<string, string> }> {
  const url = buildUrl(path);
  if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
    const response = await CapacitorHttp.request({ method, url, headers, data: body, responseType });
    if (response.status >= 400) throw toAssetsError(response.status, response.data);
    return { data: response.data, headers: response.headers ?? {} };
  }

  const response = await fetch(url, { method, headers, body });
  if (!response.ok) {
    throw toAssetsError(response.status, await parseFetchJson(response));
  }
  return {
    data: responseType === "json" ? await response.json() : await response.arrayBuffer(),
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function authHeaders(options: CloudSyncRequestOptions, extra: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    Authorization: `Bearer ${options.accessToken}`,
    "X-Wardrobe-Device-Id": options.deviceId,
  };
}

function assetContentPath(request: AssetUploadParams | AssetDownloadParams): string {
  return `/api/assets/${encodeURIComponent(request.assetId)}/${encodeURIComponent(request.variant)}/content`;
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

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function toArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  if (typeof data === "string") {
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
  }
  throw new CloudSyncApiError(502, "invalid_asset_response", "图片资产响应不是有效的二进制内容");
}

function toAssetsError(status: number, data: unknown): CloudSyncApiError {
  if (data && typeof data === "object" && "code" in data && "message" in data) {
    const body = data as CloudSyncApiErrorBody;
    return new CloudSyncApiError(status, body.code, body.message, body.retryAfterSeconds);
  }
  return new CloudSyncApiError(status, "request_failed", "图片资产服务暂时不可用");
}
