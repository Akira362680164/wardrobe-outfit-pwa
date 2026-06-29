// ponytail: Dexie-based persistent image cache, account-isolated.
// Survives page reloads and app restarts. Add LRU eviction when cache size matters.
"use client";

import Dexie, { type Table } from "dexie";
import type { ImageCacheStorage } from "@/lib/cloud-sync/image-cache";

const MAX_ENTRIES = 2000;

class ImageCacheDb extends Dexie {
  blobs!: Table<{ key: string; data: ArrayBuffer }>;

  constructor(userIdHash: string) {
    super(`wardrobe-imgcache-${userIdHash}`);
    this.version(1).stores({ blobs: "&key" });
  }
}

const instances = new Map<string, ImageCacheDb>();

function getDb(userIdHash: string): ImageCacheDb {
  let db = instances.get(userIdHash);
  if (!db) {
    db = new ImageCacheDb(userIdHash);
    instances.set(userIdHash, db);
  }
  return db;
}

export function persistentImageCacheStorage(userIdHash: string): ImageCacheStorage {
  const db = getDb(userIdHash);

  return {
    async get(key) {
      try {
        const row = await db.blobs.get(key);
        return row?.data ?? null;
      } catch {
        return null;
      }
    },
    async set(key, data) {
      try {
        const count = await db.blobs.count();
        if (count >= MAX_ENTRIES) {
          const oldest = await db.blobs.orderBy("key").first();
          if (oldest) await db.blobs.delete(oldest.key);
        }
        await db.blobs.put({ key, data });
      } catch { /* best-effort */ }
    },
    async delete(key) {
      try {
        await db.blobs.delete(key);
      } catch { /* best-effort */ }
    },
  };
}
