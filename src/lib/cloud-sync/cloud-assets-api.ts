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
import { sha256Hex } from "@/lib/cloud-sync/asset-metadata";
import { recordDiagnosticEvent } from "@/lib/diagnostic-log";

export interface UploadAssetContentRequest {
  params: AssetUploadParams;
  metadata: Omit<AssetUploadHeaders, "content-type">;
  blob: Blob;
}

export interface DownloadedAssetContent {
  blob: Blob;
  sha256: string;
  actualSha256: string;
  mimeType: string;
  sizeBytes: number;
  requestId: string;
  transport: "fetch" | "capacitor_http";
  httpStatus: number;
}

export interface RemoteAssetVariantVerification {
  variant: "original" | "thumbnail";
  httpStatus: number;
  contentType: string;
  responseSha256: string;
  actualSha256: string;
  expectedSha256: string;
  sizeBytes: number;
  requestId: string;
  transport: "fetch" | "capacitor_http";
  verified: boolean;
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
  const data = response.data as AssetUploadResponse;
  recordDiagnosticEvent("asset", "asset_upload_validated", {
    phase: data.sha256 === request.metadata["x-asset-sha256"] && data.sizeBytes === request.metadata["x-asset-size-bytes"] ? "succeeded" : "failed",
    severity: data.sha256 === request.metadata["x-asset-sha256"] && data.sizeBytes === request.metadata["x-asset-size-bytes"] ? "info" : "error",
    requestId: response.requestId,
    transport: response.transport,
    httpStatus: response.status,
    metadata: {
      assetId: request.params.assetId,
      entityId: request.metadata["x-asset-owner-entity-id"],
      variant: request.params.variant,
      expectedSha256: request.metadata["x-asset-sha256"],
      responseSha256: data.sha256,
      expectedSizeBytes: request.metadata["x-asset-size-bytes"],
      responseSizeBytes: data.sizeBytes,
      mimeType: request.blob.type,
    },
  });
  return data;
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
  const blob = new Blob([toArrayBuffer(response.data)], { type: mimeType });
  const actualSha256 = await sha256Hex(blob);
  recordDiagnosticEvent("asset", "asset_download_validated", {
    phase: actualSha256 === sha256 ? "succeeded" : "failed",
    severity: actualSha256 === sha256 ? "info" : "error",
    requestId: response.requestId,
    transport: response.transport,
    httpStatus: response.status,
    errorCode: actualSha256 === sha256 ? undefined : "ASSET_DOWNLOAD_SHA256_MISMATCH",
    metadata: { assetId: request.assetId, variant: request.variant, responseSha256: sha256, actualSha256, sizeBytes: blob.size, mimeType },
  });
  return {
    blob,
    sha256: sha256!,
    actualSha256,
    mimeType,
    sizeBytes: blob.size,
    requestId: response.requestId,
    transport: response.transport,
    httpStatus: response.status,
  };
}

export async function verifyRemoteAssetVariants(
  input: { assetId: string; expectedSha256: Record<"original" | "thumbnail", string> },
  options: CloudSyncRequestOptions,
): Promise<RemoteAssetVariantVerification[]> {
  const results: RemoteAssetVariantVerification[] = [];
  for (const variant of ["original", "thumbnail"] as const) {
    const content = await downloadAssetContent({ assetId: input.assetId, variant }, options);
    const verified = content.sha256 === input.expectedSha256[variant] && content.actualSha256 === input.expectedSha256[variant];
    results.push({
      variant,
      httpStatus: content.httpStatus,
      contentType: content.mimeType,
      responseSha256: content.sha256,
      actualSha256: content.actualSha256,
      expectedSha256: input.expectedSha256[variant],
      sizeBytes: content.sizeBytes,
      requestId: content.requestId,
      transport: content.transport,
      verified,
    });
    if (!verified) {
      throw new CloudSyncApiError(502, "asset_sha256_mismatch", `${variant} 图片摘要校验失败`);
    }
  }
  return results;
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
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const transport = Capacitor.isNativePlatform() && /^https?:\/\//.test(url) ? "capacitor_http" : "fetch";
  const eventName = path === "/api/assets/manifest" ? "asset_manifest_request" : "asset_delete_request";
  const headers = authHeaders(options, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  recordDiagnosticEvent("asset", eventName, {
    phase: "started", severity: "info", requestId, endpoint: path, method, transport,
  });
  try {
    if (transport === "capacitor_http") {
      const response = await CapacitorHttp.request({ method, url, headers, data: body });
      if (response.status >= 400) throw toAssetsError(response.status, response.data);
      recordDiagnosticEvent("asset", eventName, {
        phase: "succeeded", severity: "info", requestId, endpoint: path, method, transport,
        httpStatus: response.status, durationMs: Math.round(performance.now() - startedAt),
      });
      return response.data as TResponse;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
    });
    const data = await parseFetchJson(response);
    if (!response.ok) throw toAssetsError(response.status, data);
    recordDiagnosticEvent("asset", eventName, {
      phase: "succeeded", severity: "info", requestId, endpoint: path, method, transport,
      httpStatus: response.status, durationMs: Math.round(performance.now() - startedAt),
    });
    return data as TResponse;
  } catch (error) {
    recordDiagnosticEvent("asset", eventName, {
      phase: "failed", severity: "error", requestId, endpoint: path, method, transport,
      httpStatus: error instanceof CloudSyncApiError ? error.status : undefined,
      errorCode: error instanceof CloudSyncApiError ? error.code : "ASSET_REQUEST_NETWORK_ERROR",
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

async function requestBinary(
  method: "GET" | "PUT",
  path: string,
  options: CloudSyncRequestOptions,
  headers: Record<string, string>,
  body: Blob | undefined,
  responseType: "arraybuffer" | "json",
): Promise<{
  data: unknown;
  headers: Record<string, string>;
  status: number;
  requestId: string;
  transport: "fetch" | "capacitor_http";
}> {
  const url = buildUrl(path);
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  // CapacitorHttp.request only accepts strings/JSON on native platforms. The
  // enabled CapacitorHttp fetch patch is the supported path for Blob bodies.
  const transport = "fetch" as const;
  const eventName = method === "PUT" ? "asset_upload_request" : "asset_download_request";
  recordDiagnosticEvent("asset", eventName, {
    phase: "started", severity: "info", requestId, endpoint: path, method, transport,
    metadata: { assetId: assetRequestPart(path, 3), variant: assetRequestPart(path, 4) },
  });
  try {
    // Capacitor's fetch patch preserves File bytes via its base64/file path;
    // a Blob becomes a ReadableStream and is UTF-8 decoded, corrupting images.
    const fetchBody = method === "PUT" && body && Capacitor.isNativePlatform()
      ? new File([body], `${assetRequestPart(path, 3) ?? "asset"}-${assetRequestPart(path, 4) ?? "content"}`, { type: body.type })
      : body;
    const response = await fetch(url, { method, headers, body: fetchBody });
    if (!response.ok) throw toAssetsError(response.status, await parseFetchJson(response));
    const data = responseType === "json" ? await response.json() : await response.arrayBuffer();
    recordDiagnosticEvent("asset", eventName, {
      phase: "succeeded", severity: "info", requestId, endpoint: path, method, transport,
      httpStatus: response.status, durationMs: Math.round(performance.now() - startedAt),
    });
    return { data, headers: Object.fromEntries(response.headers.entries()), status: response.status, requestId, transport };
  } catch (error) {
    recordDiagnosticEvent("asset", eventName, {
      phase: "failed", severity: "error", requestId, endpoint: path, method, transport,
      httpStatus: error instanceof CloudSyncApiError ? error.status : undefined,
      errorCode: error instanceof CloudSyncApiError ? error.code : method === "PUT" ? "ASSET_UPLOAD_NETWORK_ERROR" : "ASSET_DOWNLOAD_NETWORK_ERROR",
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

function assetRequestPart(path: string, index: number): string | undefined {
  const value = path.split("/")[index];
  return value ? decodeURIComponent(value) : undefined;
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
