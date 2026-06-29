import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";

process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED = "true";
process.env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED = "true";

const storageMap = new Map<string, string>();
const sessionMap = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => { storageMap.set(key, value); },
};
const sessionStorage = {
  getItem: (key: string) => sessionMap.get(key) ?? null,
  setItem: (key: string, value: string) => { sessionMap.set(key, value); },
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage, sessionStorage },
});

import { sha256Hex } from "../src/lib/cloud-sync/asset-metadata";
import { AccountImageCache, type ImageCacheStorage } from "../src/lib/cloud-sync/image-cache";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

function makeStorage(): { storage: ImageCacheStorage; map: Map<string, ArrayBuffer> } {
  const map = new Map<string, ArrayBuffer>();
  return {
    map,
    storage: {
      get: async (key) => map.get(key) ?? null,
      set: async (key, data) => { map.set(key, data); },
      delete: async (key) => { map.delete(key); },
    },
  };
}

function makeBlob(data: Uint8Array, mimeType = "image/png"): Blob {
  return new Blob([data.buffer as ArrayBuffer], { type: mimeType });
}

async function main() {
  // ---- Test 1: put + get roundtrip ----
  {
    const cache = new AccountImageCache("hash123");
    const { storage } = makeStorage();
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = makeBlob(data);
    const expectedSha256 = await sha256Hex(blob);
    const ok = await cache.put("asset-1", "original", blob, expectedSha256, { storage });
    check("put 成功返回 true", ok);

    const cached = await cache.get("asset-1", "original", {}, { storage });
    check("get 返回非 null", cached !== null);
    check("get SHA-256 匹配", cached?.sha256 === expectedSha256);
    check("get MIME 正确", cached?.mimeType === "image/png");
    const cachedData = new Uint8Array(await cached!.blob.arrayBuffer());
    check("get 二进制内容一致", cachedData.length === 5 && cachedData[0] === 1);
  }

  // ---- Test 2: SHA-256 mismatch rejects put ----
  {
    const cache = new AccountImageCache("hash123");
    const { storage } = makeStorage();
    const blob = makeBlob(new Uint8Array([9, 9, 9]));
    const wrongSha256 = "0000000000000000000000000000000000000000000000000000000000000000";
    const ok = await cache.put("asset-2", "thumbnail", blob, wrongSha256, { storage });
    check("SHA-256 不匹配时 put 返回 false", !ok);

    const cached = await cache.get("asset-2", "thumbnail", {}, { storage });
    check("SHA-256 不匹配时不写入缓存", cached === null);
  }

  // ---- Test 3: get returns null for missing ----
  {
    const cache = new AccountImageCache("hash123");
    const { storage } = makeStorage();
    const cached = await cache.get("nonexistent", "original", {}, { storage });
    check("missing key 返回 null", cached === null);
  }

  // ---- Test 4: account isolation ----
  {
    const cacheA = new AccountImageCache("hashA");
    const cacheB = new AccountImageCache("hashB");
    const { storage } = makeStorage();
    const data = new Uint8Array([42]);
    const blob = makeBlob(data);
    const sha256 = await sha256Hex(blob);
    await cacheA.put("asset-iso", "original", blob, sha256, { storage });

    const fromA = await cacheA.get("asset-iso", "original", {}, { storage });
    check("账号 A 写入可读", fromA !== null);

    const fromB = await cacheB.get("asset-iso", "original", {}, { storage });
    check("账号 B 读不到 A 的缓存", fromB === null);
  }

  // ---- Test 5: cache key format ----
  {
    const cache = new AccountImageCache("abc123def");
    const { storage, map } = makeStorage();
    const data = new Uint8Array([7]);
    const blob = makeBlob(data);
    const sha256 = await sha256Hex(blob);
    await cache.put("img-1", "thumbnail", blob, sha256, { storage });

    const keys = Array.from(map.keys());
    check("cache key 包含 userIdHash 前缀", keys.some((k) => k.startsWith("img-abc123def-")));
  }

  // ---- Test 6: tmp key cleaned up after successful put ----
  {
    const cache = new AccountImageCache("hash123");
    const { storage, map } = makeStorage();
    const data = new Uint8Array([10, 20, 30]);
    const blob = makeBlob(data);
    const sha256 = await sha256Hex(blob);
    await cache.put("asset-tmp", "original", blob, sha256, { storage });

    const keys = Array.from(map.keys());
    const hasTmp = keys.some((k) => k.includes(".tmp"));
    check("put 成功后 tmp key 已清理", !hasTmp);
  }

  // ---- Test 7: persistent write failure is observable ----
  {
    const cache = new AccountImageCache("hash123");
    const blob = makeBlob(new Uint8Array([99]));
    const sha256 = await sha256Hex(blob);
    const failingStorage: ImageCacheStorage = {
      get: async () => null,
      set: async () => { throw new Error("disk full"); },
      delete: async () => undefined,
    };
    const ok = await cache.put("asset-write-fail", "thumbnail", blob, sha256, { storage: failingStorage });
    check("缓存写入失败不得误报成功", ok === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
