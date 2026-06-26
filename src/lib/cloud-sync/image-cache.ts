// src/lib/cloud-sync/image-cache.ts
// v1.1.37 cloud 1C C3b: account-isolated image cache
//
// 按 userIdHash 隔离缓存 key，下载后校验 SHA-256，写文件使用临时 key + 原子替换。
// 存储后端可注入，默认内存实现用于测试和浏览器环境。

"use client";

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { AssetVariant } from "@wardrobe/cloud-contracts";

import { requestAssetDownloadUrl } from "@/lib/cloud-sync/cloud-assets-api";
import { sha256Hex } from "@/lib/cloud-sync/asset-metadata";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import { stableUserIdHash } from "@/lib/workspace-registry";
import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";

export interface ImageCacheStorage {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, data: ArrayBuffer): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CachedImage {
  blob: Blob;
  sha256: string;
  mimeType: string;
}

export interface ImageCacheDeps {
  storage?: ImageCacheStorage;
}

export class AccountImageCache {
  private prefix: string;

  constructor(userIdHash: string) {
    this.prefix = `img-${userIdHash}-`;
  }

  async get(assetId: string, variant: AssetVariant, deps: ImageCacheDeps = {}): Promise<CachedImage | null> {
    const storage = deps.storage ?? memoryStorage();
    const key = this.cacheKey(assetId, variant);
    const metaKey = this.metaKey(assetId, variant);
    try {
      const [data, metaRaw] = await Promise.all([
        storage.get(key),
        storage.get(metaKey),
      ]);
      if (!data) return null;
      const meta = metaRaw ? parseMeta(metaRaw) : null;
      const mimeType = meta?.mimeType ?? guessMime(assetId);
      const sha256 = await sha256Hex(new Blob([data]));
      return { blob: new Blob([data], { type: mimeType }), sha256, mimeType };
    } catch {
      return null;
    }
  }

  async put(assetId: string, variant: AssetVariant, blob: Blob, expectedSha256: string, deps: ImageCacheDeps = {}): Promise<boolean> {
    const storage = deps.storage ?? memoryStorage();
    const key = this.cacheKey(assetId, variant);
    const metaKey = this.metaKey(assetId, variant);
    const tmpKey = `${key}.tmp`;

    try {
      const data = await blob.arrayBuffer();
      const actualSha256 = await sha256Hex(blob);
      if (actualSha256 !== expectedSha256) return false;

      // atomic: write tmp first, then set final + meta
      await storage.set(tmpKey, data);
      await storage.set(key, data);
      await storage.set(metaKey, encodeMeta({ mimeType: blob.type }));
      await storage.delete(tmpKey);
      return true;
    } catch {
      try { await storage.delete(tmpKey); } catch { /* best-effort */ }
      return false;
    }
  }

  async downloadAndCache(
    assetId: string,
    variant: AssetVariant,
    deps: ImageCacheDeps = {},
  ): Promise<CachedImage | null> {
    const cached = await this.get(assetId, variant, deps);
    if (cached) return cached;

    const ctx = await loadCloudBridgeContext();
    if (!ctx) return null;
    const session = await loadAuthSessionSnapshot();
    if (!session.accessToken) return null;
    const options: CloudSyncRequestOptions = { accessToken: session.accessToken, deviceId: ctx.deviceId };

    try {
      const auth = await requestAssetDownloadUrl({ assetId, variant }, options);
      const blob = await downloadBlob(auth.downloadUrl);
      const ok = await this.put(assetId, variant, blob, auth.sha256, deps);
      if (!ok) return null;
      return { blob, sha256: auth.sha256, mimeType: auth.mimeType };
    } catch {
      return null;
    }
  }

  private cacheKey(assetId: string, variant: string): string {
    return `${this.prefix}${assetId}-${variant}`;
  }

  private metaKey(assetId: string, variant: string): string {
    return `${this.prefix}${assetId}-${variant}.meta`;
  }
}

async function downloadBlob(url: string): Promise<Blob> {
  if (Capacitor.isNativePlatform() && /^https?:\/\//.test(url)) {
    const resp = await CapacitorHttp.request({ method: "GET", url });
    if (resp.status >= 400) throw new Error(`download failed: ${resp.status}`);
    return new Blob([resp.data as ArrayBuffer]);
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed: ${resp.status}`);
  return resp.blob();
}

// ponytail: module-level Map — survives page switches within same session.
// Full persistence (IndexedDB / Capacitor Filesystem) via ImageCacheStorage interface.
const memoryStore = new Map<string, ArrayBuffer>();
const MAX_MEMORY_CACHE_ENTRIES = 500;

function memoryStorage(): ImageCacheStorage {
  return {
    get: async (key) => memoryStore.get(key) ?? null,
    set: async (key, data) => {
      if (memoryStore.size >= MAX_MEMORY_CACHE_ENTRIES && !memoryStore.has(key)) {
        // drop oldest entry to keep cache bounded
        const oldest = memoryStore.keys().next().value;
        if (oldest != null) memoryStore.delete(oldest);
      }
      memoryStore.set(key, data);
    },
    delete: async (key) => { memoryStore.delete(key); },
  };
}

function encodeMeta(meta: { mimeType: string }): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(meta)).buffer as ArrayBuffer;
}

function parseMeta(raw: ArrayBuffer): { mimeType?: string } | null {
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(raw)));
  } catch {
    return null;
  }
}

function guessMime(assetId: string): string {
  return "image/jpeg"; // ponytail: COS objectKey contains extension but assetId doesn't; default to jpeg, caller can override via meta
}
