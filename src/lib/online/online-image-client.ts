"use client";

import type { AuthSessionSnapshot } from "@/lib/auth-session-store";
import { OnlineRequestError } from "@/lib/online/online-error";
import { onlineRequestRaw } from "@/lib/online/online-request";

export type OnlineImageVariant = "original" | "thumbnail";

interface OnlineImageClientOptions {
  session?: Pick<AuthSessionSnapshot, "accessToken" | "deviceId">;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

export class OnlineImageClient {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;

  constructor(private readonly options: OnlineImageClientOptions = {}) {
    this.createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
  }

  async load(assetId: string, variant: OnlineImageVariant, expectedSha256?: string): Promise<string> {
    const key = imageKey(assetId, variant);
    const cached = this.urls.get(key);
    if (cached) return cached;
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const request = this.download(assetId, variant, expectedSha256).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  async retry(assetId: string, variant: OnlineImageVariant, expectedSha256?: string): Promise<string> {
    this.release(assetId, variant);
    return this.load(assetId, variant, expectedSha256);
  }

  release(assetId: string, variant: OnlineImageVariant): void {
    const key = imageKey(assetId, variant);
    const url = this.urls.get(key);
    if (url) this.revokeObjectUrl(url);
    this.urls.delete(key);
    this.pending.delete(key);
  }

  clear(): void {
    for (const url of this.urls.values()) this.revokeObjectUrl(url);
    this.urls.clear();
    this.pending.clear();
  }

  private async download(assetId: string, variant: OnlineImageVariant, expectedSha256?: string): Promise<string> {
    const response = await onlineRequestRaw<Blob>(
      `/api/assets/${encodeURIComponent(assetId)}/${variant}/content`,
      { responseType: "blob", session: this.options.session },
    );
    if (!response.data.type.startsWith("image/")) {
      throw new OnlineRequestError(502, "image_upload", "服务器返回的图片格式无效", true, response.requestId);
    }
    const responseSha = header(response.headers, "x-asset-sha256");
    if (expectedSha256 && responseSha && responseSha !== expectedSha256) {
      throw new OnlineRequestError(502, "image_upload", "图片校验失败，请重试", true, response.requestId);
    }
    const url = this.createObjectUrl(response.data);
    this.urls.set(imageKey(assetId, variant), url);
    return url;
  }
}

function imageKey(assetId: string, variant: OnlineImageVariant): string {
  return `${assetId}:${variant}`;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
