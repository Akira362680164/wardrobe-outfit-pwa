import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";

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

import { createAccountWorkspaceDb, createWorkspaceUuidV7 } from "../src/lib/account-workspace-db";
import type { LocalAssetPayload, LocalAssetImageMetadata } from "../src/lib/cloud-sync/asset-metadata";
import {
  uploadPendingAssets,
  schedulePendingUploads,
} from "../src/lib/cloud-sync/asset-upload-coordinator";
import { saveWorkspaceRegistry, type AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import type { AssetUploadAuthorizeResponse, AssetUploadCompleteResponse } from "@wardrobe/cloud-contracts";

const now = "2026-06-26T15:00:00.000Z";
const userId = "00000000-0000-4000-8000-000000000003";
const deviceId = "device-upload-test";
const dbName = `wardrobe_upload_${Date.now()}`;

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

function makeWorkspace(): AccountWorkspaceRecord {
  return {
    userId, userIdHash: "upload-test-hash", dbName,
    schemaVersion: 1, activeWorkspaceGeneration: 1,
    createdAt: now, lastOpenedAt: now, deviceId,
  };
}

function setupSessionAndRegistry() {
  const workspace = makeWorkspace();
  saveWorkspaceRegistry({
    version: 1,
    activeUserId: userId,
    activeDbName: dbName,
    activeWorkspaceGeneration: 1,
    updatedAt: now,
    workspaces: { [userId]: workspace },
  });
  const session = {
    deviceId,
    deviceLabel: "test-device",
    accessToken: "fake-access-token",
    user: { id: userId, maskedPhone: "138****0000" },
  };
  sessionStorage.setItem("wardrobe-cloud-auth-session-v1", JSON.stringify(session));
  return workspace;
}

async function main() {
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  // ---- Test 1: no pending assets returns empty ----
  {
    setupSessionAndRegistry();
    const results = await uploadPendingAssets(db);
    check("无 pending asset 返回空数组", results.length === 0);
  }

  // ---- Prepare a pending asset for subsequent tests ----
  const assetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:01.000Z"));
  const fakeOriginalMeta: LocalAssetImageMetadata & { status: "local_pending"; dataUrl: string } = {
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    mimeType: "image/png",
    sizeBytes: 1024,
    width: 800,
    height: 1000,
    status: "local_pending",
    dataUrl: "data:image/png;base64,fake==",
  };
  const fakeThumbMeta: LocalAssetImageMetadata & { status: "local_pending"; dataUrl: string } = {
    sha256: "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
    mimeType: "image/jpeg",
    sizeBytes: 256,
    width: 200,
    height: 250,
    status: "local_pending",
    dataUrl: "data:image/jpeg;base64,thumb==",
  };

  const pendingPayload: LocalAssetPayload = {
    uploads: {
      original: fakeOriginalMeta,
      thumbnail: fakeThumbMeta,
    },
    thumbnailStatus: "ready",
  };

  await db.assets.put({
    id: assetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "garment",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: pendingPayload,
  });

  // ---- Test 2: upload succeeds for both variants ----
  {
    setupSessionAndRegistry();
    const authorized: AssetUploadAuthorizeResponse[] = [];
    const completed: AssetUploadCompleteResponse[] = [];
    let putCount = 0;

    const results = await uploadPendingAssets(db, {
      authorizeUpload: async (req) => {
        const resp: AssetUploadAuthorizeResponse = {
          assetId: req.assetId,
          variant: req.variant,
          method: "PUT",
          uploadUrl: `https://cos.example.com/upload/${req.assetId}/${req.variant}`,
          objectKey: `users/${userId}/assets/${req.assetId}/${req.variant}`,
          expiresAt: "2026-06-26T16:00:00.000Z",
          headers: { "x-cos-acl": "private" },
        };
        authorized.push(resp);
        return resp;
      },
      completeUpload: async (req) => {
        const resp: AssetUploadCompleteResponse = {
          status: "ok",
          assetId: req.assetId,
          variant: req.variant,
          uploadStatus: "uploaded",
        };
        completed.push(resp);
        return resp;
      },
      putToUrl: async (_url, _blob, _headers) => {
        putCount++;
        return { ok: true, status: 200 };
      },
      dataUrlToBlob: async () => new Blob([]),
    });

    check("上传 original 成功", results.some((r) => r.variant === "original" && r.status === "uploaded"));
    check("上传 thumbnail 成功", results.some((r) => r.variant === "thumbnail" && r.status === "uploaded"));
    check("授权被调用 2 次", authorized.length === 2);
    check("complete 被调用 2 次", completed.length === 2);
    check("PUT 被调用 2 次", putCount === 2);

    // Verify DB status updated
    const updated = await db.assets.get(assetId);
    const updatedPayload = updated?.payload as LocalAssetPayload | undefined;
    check("DB 中 original 状态为 uploaded", updatedPayload?.uploads?.original?.status === "uploaded");
    check("DB 中 thumbnail 状态为 uploaded", updatedPayload?.uploads?.thumbnail?.status === "uploaded");
  }

  // ---- Test 3: uploaded assets are not re-processed ----
  {
    setupSessionAndRegistry();
    let callCount = 0;
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async () => { callCount++; throw new Error("should not be called"); },
    });
    check("已上传 asset 不再处理", results.length === 0 && callCount === 0);
  }

  // ---- Test 4: PUT failure marks as failed ----
  const failAssetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:02.000Z"));
  await db.assets.put({
    id: failAssetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "wishlistItem",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: {
      uploads: {
        original: { sha256: fakeOriginalMeta.sha256, mimeType: fakeOriginalMeta.mimeType, sizeBytes: fakeOriginalMeta.sizeBytes, width: fakeOriginalMeta.width, height: fakeOriginalMeta.height, dataUrl: fakeOriginalMeta.dataUrl, status: "local_pending" },
      },
      thumbnailStatus: "missing",
    } satisfies LocalAssetPayload,
  });
  {
    setupSessionAndRegistry();
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async (req) => ({
        assetId: req.assetId, variant: req.variant, method: "PUT",
        uploadUrl: "https://cos.example.com/upload/fail",
        objectKey: `users/${userId}/assets/${req.assetId}/${req.variant}`,
        expiresAt: "2026-06-26T16:00:00.000Z",
        headers: {},
      }),
      completeUpload: async () => { throw new Error("should not be called on PUT fail"); },
      putToUrl: async () => ({ ok: false, status: 403 }),
      dataUrlToBlob: async () => new Blob([]),
    });
    check("PUT 失败返回 failed", results.length === 1 && results[0].status === "failed");
    check("PUT 失败错误信息包含 403", results[0].error?.includes("403") ?? false);
    const updated = await db.assets.get(failAssetId);
    const up = updated?.payload as LocalAssetPayload | undefined;
    check("PUT 失败后 DB 状态为 failed", up?.uploads?.original?.status === "failed");
  }

  // ---- Test 5: authorize failure marks as failed ----
  const authFailAssetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:03.000Z"));
  await db.assets.put({
    id: authFailAssetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "garment",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: {
      uploads: {
        original: { sha256: fakeOriginalMeta.sha256, mimeType: fakeOriginalMeta.mimeType, sizeBytes: fakeOriginalMeta.sizeBytes, width: fakeOriginalMeta.width, height: fakeOriginalMeta.height, dataUrl: fakeOriginalMeta.dataUrl, status: "local_pending" },
      },
      thumbnailStatus: "missing",
    } satisfies LocalAssetPayload,
  });
  {
    setupSessionAndRegistry();
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async () => { throw new Error("auth service unavailable"); },
    });
    check("authorize 失败返回 failed", results.length === 1 && results[0].status === "failed");
    check("authorize 失败错误信息", results[0].error?.includes("auth service unavailable") ?? false);
  }

  // ---- Test 6: complete failure still marks as failed ----
  const completeFailAssetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:04.000Z"));
  await db.assets.put({
    id: completeFailAssetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "garment",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: {
      uploads: {
        original: { sha256: fakeOriginalMeta.sha256, mimeType: fakeOriginalMeta.mimeType, sizeBytes: fakeOriginalMeta.sizeBytes, width: fakeOriginalMeta.width, height: fakeOriginalMeta.height, dataUrl: fakeOriginalMeta.dataUrl, status: "local_pending" },
      },
      thumbnailStatus: "missing",
    } satisfies LocalAssetPayload,
  });
  {
    setupSessionAndRegistry();
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async (req) => ({
        assetId: req.assetId, variant: req.variant, method: "PUT",
        uploadUrl: "https://cos.example.com/upload/complete-fail",
        objectKey: `users/${userId}/assets/${req.assetId}/${req.variant}`,
        expiresAt: "2026-06-26T16:00:00.000Z",
        headers: {},
      }),
      completeUpload: async () => { throw new Error("complete endpoint 500"); },
      putToUrl: async () => ({ ok: true, status: 200 }),
      dataUrlToBlob: async () => new Blob([]),
    });
    check("complete 失败返回 failed", results.length === 1 && results[0].status === "failed");
  }

  // ---- Test 7: schedulePendingUploads is fire-and-forget ----
  {
    setupSessionAndRegistry();
    let threw = false;
    try {
      schedulePendingUploads(db);
    } catch {
      threw = true;
    }
    check("schedulePendingUploads 不抛出异常", !threw);
    // Wait a tick for the async work
    await new Promise((r) => setTimeout(r, 50));
  }

  // ---- Test 8: failed assets are picked up for retry ----
  const retryAssetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:05.000Z"));
  await db.assets.put({
    id: retryAssetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "garment",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: {
      uploads: {
        original: { sha256: fakeOriginalMeta.sha256, mimeType: fakeOriginalMeta.mimeType, sizeBytes: fakeOriginalMeta.sizeBytes, width: fakeOriginalMeta.width, height: fakeOriginalMeta.height, dataUrl: fakeOriginalMeta.dataUrl, status: "failed" },
      },
      thumbnailStatus: "missing",
    } satisfies LocalAssetPayload,
  });
  {
    setupSessionAndRegistry();
    // failed assets are NOT "local_pending" so they won't be picked up
    // This tests the current behavior: only "local_pending" is uploaded
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async () => { throw new Error("should not be called"); },
    });
    check("failed 状态不会自动重试（仅 local_pending 触发）", !results.some((r) => r.assetId === retryAssetId));
  }

  // ---- Test 9: triple guard — registry generation mismatch from start ----
  const lateAssetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:06.000Z"));
  await db.assets.put({
    id: lateAssetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "garment",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: {
      uploads: {
        original: { sha256: fakeOriginalMeta.sha256, mimeType: fakeOriginalMeta.mimeType, sizeBytes: fakeOriginalMeta.sizeBytes, width: fakeOriginalMeta.width, height: fakeOriginalMeta.height, dataUrl: fakeOriginalMeta.dataUrl, status: "local_pending" },
      },
      thumbnailStatus: "missing",
    } satisfies LocalAssetPayload,
  });
  {
    // Active generation 2 ≠ workspace record generation 1 → loadCloudBridgeContext returns null
    const ws = makeWorkspace();
    saveWorkspaceRegistry({
      version: 1, activeUserId: userId, activeDbName: dbName,
      activeWorkspaceGeneration: 2,
      updatedAt: now,
      workspaces: { [userId]: { ...ws, activeWorkspaceGeneration: 1 } },
    });
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async () => { throw new Error("should not be called"); },
    });
    check("三重检查：generation 不匹配时不上传", results.length === 0);
  }

  // ---- Test 10: triple guard — mid-upload generation change ----
  const midUploadAssetId = createWorkspaceUuidV7(new Date("2026-06-26T15:00:07.000Z"));
  await db.assets.put({
    id: midUploadAssetId, userId, revision: 1,
    createdAt: now, updatedAt: now,
    originDeviceId: deviceId,
    ownerEntityType: "garment",
    ownerEntityId: createWorkspaceUuidV7(),
    sha256: fakeOriginalMeta.sha256,
    mimeType: fakeOriginalMeta.mimeType,
    payload: {
      uploads: {
        original: { sha256: fakeOriginalMeta.sha256, mimeType: fakeOriginalMeta.mimeType, sizeBytes: fakeOriginalMeta.sizeBytes, width: fakeOriginalMeta.width, height: fakeOriginalMeta.height, dataUrl: fakeOriginalMeta.dataUrl, status: "local_pending" },
      },
      thumbnailStatus: "missing",
    } satisfies LocalAssetPayload,
  });
  {
    // Start with matching generation 1
    const ws = makeWorkspace();
    ws.activeWorkspaceGeneration = 1;
    saveWorkspaceRegistry({
      version: 1, activeUserId: userId, activeDbName: dbName,
      activeWorkspaceGeneration: 1,
      updatedAt: now,
      workspaces: { [userId]: ws },
    });
    let authorized = false;
    const results = await uploadPendingAssets(db, {
      authorizeUpload: async (req) => {
        authorized = true;
        // Simulate another session logging in mid-upload, bumping generation
        const ws2 = { ...ws, activeWorkspaceGeneration: 2 };
        saveWorkspaceRegistry({
          version: 1, activeUserId: userId, activeDbName: dbName,
          activeWorkspaceGeneration: 2,
          updatedAt: now,
          workspaces: { [userId]: ws2 },
        });
        return { assetId: req.assetId, variant: req.variant, method: "PUT" as const,
          uploadUrl: "https://cos.example.com/upload", objectKey: "key",
          expiresAt: "2026-06-26T16:00:00.000Z", headers: {} };
      },
      completeUpload: async (req) => ({ status: "ok" as const, assetId: req.assetId,
        variant: req.variant, uploadStatus: "uploaded" as const }),
      putToUrl: async () => ({ ok: true, status: 200 }),
      dataUrlToBlob: async () => new Blob([]),
    });
    check("三重检查：mid-upload generation change 仍尝试上传", authorized);
    // Upload itself succeeded (COS PUT worked), but final status update should be blocked
    const updated = await db.assets.get(midUploadAssetId);
    const up = updated?.payload as LocalAssetPayload | undefined;
    // Status stays "uploading" because the "uploaded" update was blocked by guard
    check("三重检查：generation 变更后 DB 状态不被更新为 uploaded", up?.uploads?.original?.status !== "uploaded");
  }

  db.close();
  await Dexie.delete(dbName);
  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
