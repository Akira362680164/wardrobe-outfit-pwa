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

import type { AssetManifestItem } from "@wardrobe/cloud-contracts";
import { AccountImageCache } from "../src/lib/cloud-sync/image-cache";
import {
  recoverAssets,
  scheduleAssetRecovery,
  type AssetRecoveryProgress,
} from "../src/lib/cloud-sync/asset-recovery";
import type { CloudSyncRequestOptions } from "../src/lib/cloud-sync/cloud-sync-api";
import { saveWorkspaceRegistry } from "../src/lib/workspace-registry";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

const userId = "00000000-0000-4000-8000-000000000004";
const deviceId = "device-recovery-test";

function setupSessionAndRegistry(gen = 1) {
  storageMap.clear();
  sessionMap.clear();
  saveWorkspaceRegistry({
    version: 1,
    activeUserId: userId,
    activeDbName: "wardrobe_recovery_test",
    activeWorkspaceGeneration: gen,
    updatedAt: "2026-06-26T15:00:00.000Z",
    workspaces: {
      [userId]: {
        userId,
        userIdHash: "recovery-test-hash",
        dbName: "wardrobe_recovery_test",
        schemaVersion: 1,
        activeWorkspaceGeneration: gen,
        createdAt: "2026-06-26T15:00:00.000Z",
        lastOpenedAt: "2026-06-26T15:00:00.000Z",
        deviceId,
      },
    },
  });
  sessionMap.set("wardrobe-cloud-auth-session-v1", JSON.stringify({
    deviceId,
    deviceLabel: "test-device",
    accessToken: "fake-access-token",
    user: { id: userId, maskedPhone: "138****0000" },
  }));
}

function makeItem(assetId: string, updatedAt: string, hasThumbnail = true): AssetManifestItem {
  return {
    assetId,
    ownerEntityType: "garment",
    ownerEntityId: "11111111-1111-4111-8111-111111111111",
    uploadStatus: "uploaded",
    original: {
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      mimeType: "image/png",
      sizeBytes: 1024,
      width: 800,
      height: 1000,
    },
    thumbnail: hasThumbnail ? {
      sha256: "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
      mimeType: "image/jpeg",
      sizeBytes: 256,
      width: 200,
      height: 250,
    } : undefined,
    createdAt: updatedAt,
    updatedAt,
  };
}

async function main() {
  // ---- Test 1: empty manifest completes immediately ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const progressCalls: AssetRecoveryProgress[] = [];
    const result = await recoverAssets(cache, (p) => progressCalls.push(p), {
      fetchManifest: async () => [],
    });
    check("空清单返回 phase=done", result.phase === "done");
    check("空清单 totalAssets=0", result.totalAssets === 0);
    check("空清单 progress 包含 manifest", progressCalls.some((p) => p.phase === "manifest"));
    check("空清单 progress 包含 done", progressCalls.some((p) => p.phase === "done"));
  }

  // ---- Test 2: manifest with 3 assets downloads all thumbnails ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const items = [
      makeItem("a0000000-0000-4000-8000-000000000001", "2026-06-26T15:00:00.000Z"),
      makeItem("a0000000-0000-4000-8000-000000000002", "2026-06-26T14:00:00.000Z"),
      makeItem("a0000000-0000-4000-8000-000000000003", "2026-06-26T13:00:00.000Z"),
    ];
    const downloaded: string[] = [];
    const result = await recoverAssets(cache, undefined, {
      fetchManifest: async () => items,
      downloadThumbnail: async (assetId) => {
        // simulate cache put + return
        const data = new Uint8Array([1, 2, 3]);
        const blob = new Blob([data.buffer as ArrayBuffer], { type: "image/jpeg" });
        const sha256 = "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a";
        await cache.put(assetId, "thumbnail", blob, sha256);
        downloaded.push(assetId);
        return { blob, sha256, mimeType: "image/jpeg" };
      },
    });
    check("3 资产下载全部缩略图", result.downloadedThumbnails === 3 && result.failedThumbnails === 0);
    check("下载顺序最近优先", downloaded[0] === items[0].assetId);
    check("phase=done", result.phase === "done");
  }

  // ---- Test 3: asset without thumbnail is skipped ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const items = [
      makeItem("a0000000-0000-4000-8000-000000000010", "2026-06-26T15:00:00.000Z", false),
    ];
    const downloadAttempts: string[] = [];
    const result = await recoverAssets(cache, undefined, {
      fetchManifest: async () => items,
      downloadThumbnail: async (assetId) => { downloadAttempts.push(assetId); return null; },
    });
    check("无缩略图资产不触发下载", downloadAttempts.length === 0);
    check("无缩略图不影响完成", result.phase === "done");
  }

  // ---- Test 4: manifest fetch error returns error phase ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const result = await recoverAssets(cache, undefined, {
      fetchManifest: async () => { throw new Error("network error"); },
    });
    check("manifest 错误返回 phase=error", result.phase === "error");
    check("manifest 错误 totalAssets=0", result.totalAssets === 0);
  }

  // ---- Test 5: progress callback reports phases ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const items = [
      makeItem("a0000000-0000-4000-8000-000000000020", "2026-06-26T15:00:00.000Z"),
      makeItem("a0000000-0000-4000-8000-000000000021", "2026-06-26T14:00:00.000Z"),
    ];
    const progressPhases: string[] = [];
    await recoverAssets(cache, (p) => progressPhases.push(p.phase), {
      fetchManifest: async () => items,
      downloadThumbnail: async (assetId) => {
        const data = new Uint8Array([1]);
        const blob = new Blob([data.buffer as ArrayBuffer], { type: "image/jpeg" });
        const sha256 = "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a";
        await cache.put(assetId, "thumbnail", blob, sha256);
        return { blob, sha256, mimeType: "image/jpeg" };
      },
    });
    check("progress 包含 manifest", progressPhases.includes("manifest"));
    check("progress 包含 thumbnails", progressPhases.includes("thumbnails"));
    check("progress 包含 done", progressPhases.includes("done"));
  }

  // ---- Test 6: triple guard — workspace gen change stops download ----
  {
    setupSessionAndRegistry(1);
    const cache = new AccountImageCache("recovery-test-hash");
    const items = Array.from({ length: 25 }, (_, i) =>
      makeItem(`a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, `2026-06-26T${String(15 - Math.floor(i / 10)).padStart(2, "0")}:00:00.000Z`),
    );
    let downloadCount = 0;
    const result = await recoverAssets(cache, undefined, {
      fetchManifest: async () => items,
      downloadThumbnail: async (assetId) => {
        downloadCount++;
        // mid-recovery: bump workspace gen (simulates account switch)
        if (downloadCount === 5) {
          saveWorkspaceRegistry({
            version: 1,
            activeUserId: userId,
            activeDbName: "wardrobe_recovery_test",
            activeWorkspaceGeneration: 99,
            updatedAt: "2026-06-26T16:00:00.000Z",
            workspaces: {
              [userId]: {
                userId,
                userIdHash: "recovery-test-hash",
                dbName: "wardrobe_recovery_test",
                schemaVersion: 1,
                activeWorkspaceGeneration: 99,
                createdAt: "2026-06-26T15:00:00.000Z",
                lastOpenedAt: "2026-06-26T16:00:00.000Z",
                deviceId,
              },
            },
          });
        }
        const data = new Uint8Array([1]);
        const blob = new Blob([data.buffer as ArrayBuffer], { type: "image/jpeg" });
        const sha256 = "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a";
        await cache.put(assetId, "thumbnail", blob, sha256);
        return { blob, sha256, mimeType: "image/jpeg" };
      },
    });
    // batch size is 10, gen change at download #5 → first batch of 10 completes, guard fails before batch 2
    check("gen 变更后停止下载", downloadCount <= 10);
    check("totalAssets 仍为清单总数", result.totalAssets === 25);
    check("部分下载未完成", result.downloadedThumbnails < 25);
  }

  // ---- Test 7: no auth session returns error ----
  {
    sessionMap.clear();
    saveWorkspaceRegistry({
      version: 1,
      activeUserId: userId,
      activeDbName: "wardrobe_recovery_test",
      activeWorkspaceGeneration: 1,
      updatedAt: "2026-06-26T15:00:00.000Z",
      workspaces: {
        [userId]: {
          userId,
          userIdHash: "recovery-test-hash",
          dbName: "wardrobe_recovery_test",
          schemaVersion: 1,
          activeWorkspaceGeneration: 1,
          createdAt: "2026-06-26T15:00:00.000Z",
          lastOpenedAt: "2026-06-26T15:00:00.000Z",
          deviceId,
        },
      },
    });
    const cache = new AccountImageCache("recovery-test-hash");
    const result = await recoverAssets(cache);
    check("无 session 返回 error", result.phase === "error");
  }

  // ---- Test 8: download failures counted separately ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const items = [
      makeItem("a0000000-0000-4000-8000-000000000030", "2026-06-26T15:00:00.000Z"),
      makeItem("a0000000-0000-4000-8000-000000000031", "2026-06-26T14:00:00.000Z"),
    ];
    const result = await recoverAssets(cache, undefined, {
      fetchManifest: async () => items,
      downloadThumbnail: async () => { throw new Error("download failed"); },
    });
    check("下载失败计入 failed", result.failedThumbnails === 2);
    check("下载失败不影响 completed", result.phase === "done");
  }

  // ---- Test 9: fire-and-forget scheduleAssetRecovery ----
  {
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    let called = false;
    // scheduleAssetRecovery is fire-and-forget — just verify it doesn't throw
    try {
      scheduleAssetRecovery(cache, () => { called = true; });
      // wait briefly for async to settle
      await new Promise((r) => setTimeout(r, 100));
      check("scheduleAssetRecovery 不抛出异常", true);
    } catch {
      check("scheduleAssetRecovery 不抛出异常", false);
    }
  }

  // ---- Test 10: workspace disabled returns error ----
  {
    const prev = process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED;
    process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED = "false";
    setupSessionAndRegistry();
    const cache = new AccountImageCache("recovery-test-hash");
    const result = await recoverAssets(cache);
    check("workspace 关闭时返回 error", result.phase === "error");
    process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED = prev;
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
