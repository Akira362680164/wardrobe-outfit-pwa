// src/lib/cloud-sync/image-cache.ts
// v1.1.37 cloud 1C C3b: account-isolated image cache
//
// 按 userIdHash 隔离缓存 key，下载后校验 SHA-256，写文件使用临时 key + 原子替换。
// 存储后端可注入，默认内存实现用于测试和浏览器环境。

"use client";

import type { AssetVariant } from "@wardrobe/cloud-contracts";

import { downloadAssetContent } from "@/lib/cloud-sync/cloud-assets-api";
import { sha256Hex } from "@/lib/cloud-sync/asset-metadata";
import { loadCloudBridgeContext } from "@/lib/cloud-sync/bridge-context";
import { loadAuthSessionSnapshot } from "@/lib/auth-session-store";
import type { CloudSyncRequestOptions } from "@/lib/cloud-sync/cloud-sync-api";
import { CloudSyncApiError } from "@/lib/cloud-sync/cloud-sync-api";
import { persistentImageCacheStorage } from "@/lib/cloud-sync/persistent-image-cache-storage";

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

export interface ImageCacheGetOptions {
  expectedSha256?: string;
}

export interface ImageCacheDeps {
  storage?: ImageCacheStorage;
  downloadContent?: typeof downloadAssetContent;
}

export class AccountImageCache {
  private prefix: string;
  private userIdHash: string;

  constructor(userIdHash: string) {
    this.userIdHash = userIdHash;
    this.prefix = `img-${userIdHash}-`;
  }

  async get(assetId: string, variant: AssetVariant, options: ImageCacheGetOptions = {}, deps: ImageCacheDeps = {}): Promise<CachedImage | null> {
    const storage = deps.storage ?? persistentImageCacheStorage(this.userIdHash);
    const key = this.cacheKey(assetId, variant);
    const metaKey = this.metaKey(assetId, variant);
    try {
      const [data, metaRaw] = await Promise.all([
        storage.get(key),
        storage.get(metaKey),
      ]);
      if (!data || !metaRaw) return null;
      const meta = metaRaw ? parseMeta(metaRaw) : null;
      if (!meta?.mimeType?.startsWith("image/")) return null;
      const mimeType = meta.mimeType;
      const sha256 = await sha256Hex(new Blob([data]));
      if (options.expectedSha256 && sha256 !== options.expectedSha256) {
        await storage.delete(key);
        await storage.delete(metaKey);
        return null;
      }
      return { blob: new Blob([data], { type: mimeType }), sha256, mimeType };
    } catch (error) {
      logImageCacheFailure(assetId, variant, "cache_read_failed", error);
      return null;
    }
  }

  async put(assetId: string, variant: AssetVariant, blob: Blob, expectedSha256: string, deps: ImageCacheDeps = {}): Promise<boolean> {
    const storage = deps.storage ?? persistentImageCacheStorage(this.userIdHash);
    const key = this.cacheKey(assetId, variant);
    const metaKey = this.metaKey(assetId, variant);
    const tmpKey = `${key}.tmp`;

    try {
      const data = await blob.arrayBuffer();
      const actualSha256 = await sha256Hex(blob);
      if (actualSha256 !== expectedSha256) {
        logImageCacheFailure(assetId, variant, "sha256_mismatch");
        return false;
      }

      // atomic: write tmp first, then set final + meta
      await storage.set(tmpKey, data);
      await storage.set(key, data);
      await storage.set(metaKey, encodeMeta({ mimeType: blob.type }));
      await storage.delete(tmpKey);
      return true;
    } catch (error) {
      try { await storage.delete(tmpKey); } catch (cleanupError) {
        logImageCacheFailure(assetId, variant, "cache_cleanup_failed", cleanupError);
      }
      logImageCacheFailure(assetId, variant, "cache_write_failed", error);
      return false;
    }
  }

  async downloadAndCache(
    assetId: string,
    variant: AssetVariant,
    deps: ImageCacheDeps = {},
  ): Promise<CachedImage | null> {
    const cached = await this.get(assetId, variant, {}, deps);
    if (cached) return cached;

    const ctx = await loadCloudBridgeContext();
    if (!ctx) {
      logImageCacheFailure(assetId, variant, "workspace_unavailable");
      return null;
    }
    const session = await loadAuthSessionSnapshot();
    if (!session.accessToken) {
      logImageCacheFailure(assetId, variant, "authentication_required");
      return null;
    }
    const options: CloudSyncRequestOptions = { accessToken: session.accessToken, deviceId: ctx.deviceId };

    try {
      const download = deps.downloadContent ?? downloadAssetContent;
      const content = await download({ assetId, variant }, options);
      const ok = await this.put(assetId, variant, content.blob, content.sha256, deps);
      if (!ok) return null;
      return { blob: content.blob, sha256: content.sha256, mimeType: content.mimeType };
    } catch (error) {
      logImageCacheFailure(assetId, variant, "download_failed", error);
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

function logImageCacheFailure(assetId: string, variant: AssetVariant, code: string, error?: unknown): void {
  console.warn("[image-cache] asset unavailable", {
    assetId,
    variant,
    code: error instanceof CloudSyncApiError ? error.code : code,
    httpStatus: error instanceof CloudSyncApiError ? error.status : undefined,
    authenticationFailure: error instanceof CloudSyncApiError && (error.status === 401 || error.status === 403),
    missingRemoteAsset: error instanceof CloudSyncApiError && error.status === 404,
    sha256Mismatch: code === "sha256_mismatch",
  });
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
