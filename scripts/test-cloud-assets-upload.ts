import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";

process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED = "true";
process.env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED = "true";

const localMap = new Map<string, string>();
const sessionMap = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: { getItem: (key: string) => localMap.get(key) ?? null, setItem: (key: string, value: string) => localMap.set(key, value) },
    sessionStorage: { getItem: (key: string) => sessionMap.get(key) ?? null, setItem: (key: string, value: string) => sessionMap.set(key, value) },
  },
});

import { createAccountWorkspaceDb, createWorkspaceUuidV7, type AccountWorkspaceDatabase } from "../src/lib/account-workspace-db";
import type { LocalAssetPayload } from "../src/lib/cloud-sync/asset-metadata";
import { uploadPendingAssets } from "../src/lib/cloud-sync/asset-upload-coordinator";
import { CloudSyncApiError } from "../src/lib/cloud-sync/cloud-sync-api";
import { saveWorkspaceRegistry, type AccountWorkspaceRecord } from "../src/lib/workspace-registry";

const now = "2026-06-27T15:00:00.000Z";
const userId = "00000000-0000-4000-8000-000000000003";
const deviceId = "device-upload-test";
const dbName = `wardrobe_upload_${Date.now()}`;
let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}`); }
}

function setupSession(generation = 1) {
  const workspace: AccountWorkspaceRecord = {
    userId, userIdHash: "upload-test-hash", dbName, schemaVersion: 1,
    activeWorkspaceGeneration: generation, createdAt: now, lastOpenedAt: now, deviceId,
  };
  saveWorkspaceRegistry({ version: 1, activeUserId: userId, activeDbName: dbName, activeWorkspaceGeneration: generation, updatedAt: now, workspaces: { [userId]: workspace } });
  sessionMap.set("wardrobe-cloud-auth-session-v1", JSON.stringify({ deviceId, deviceLabel: "test-device", accessToken: "token", user: { id: userId, maskedPhone: "133****8876" } }));
}

async function addPending(db: AccountWorkspaceDatabase, date: string, status: "local_pending" | "failed" = "local_pending", retryable?: boolean) {
  const id = createWorkspaceUuidV7(new Date(date));
  const payload: LocalAssetPayload = {
    uploads: {
      original: {
        sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 16, width: 8, height: 8,
        dataUrl: "data:image/png;base64,iVBORw0KGgo=", status, retryable,
        ...(status === "failed" ? { nextAttemptAt: "2026-01-01T00:00:00.000Z" } : {}),
      },
    },
    thumbnailStatus: "missing",
  };
  await db.assets.put({
    id, userId, revision: 1, createdAt: now, updatedAt: now, originDeviceId: deviceId,
    ownerEntityType: "garment", ownerEntityId: createWorkspaceUuidV7(), sha256: "a".repeat(64), mimeType: "image/png", payload,
  });
  return id;
}

async function main() {
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();
  setupSession();

  check("无待上传资产时返回空数组", (await uploadPendingAssets(db)).length === 0);

  const successId = await addPending(db, "2026-06-27T15:00:01.000Z");
  const uploadedRequests: any[] = [];
  const success = await uploadPendingAssets(db, {
    dataUrlToBlob: async () => new Blob([new Uint8Array(16)], { type: "image/png" }),
    uploadContent: async (request) => {
      uploadedRequests.push(request);
      return {
        status: "ok", assetId: request.params.assetId, variant: request.params.variant, uploadStatus: "uploaded",
        sha256: request.metadata["x-asset-sha256"], mimeType: request.blob.type, sizeBytes: request.blob.size,
        updatedAt: new Date().toISOString(),
      };
    },
  });
  check("直接 API 上传成功", success.length === 1 && success[0].status === "uploaded");
  check("请求包含 asset/variant/blob 和 owner header", uploadedRequests[0]?.params.assetId === successId && uploadedRequests[0]?.blob instanceof Blob && uploadedRequests[0]?.metadata["x-asset-owner-entity-type"] === "garment");
  check("成功后本地状态 uploaded", ((await db.assets.get(successId))?.payload as LocalAssetPayload).uploads.original?.status === "uploaded");

  const mismatchId = await addPending(db, "2026-06-27T15:00:01.500Z");
  const mismatch = await uploadPendingAssets(db, {
    dataUrlToBlob: async () => new Blob([new Uint8Array(16)], { type: "image/png" }),
    uploadContent: async (request) => ({
      status: "ok", assetId: request.params.assetId, variant: request.params.variant, uploadStatus: "uploaded",
      sha256: "b".repeat(64), mimeType: request.blob.type, sizeBytes: request.blob.size,
      updatedAt: new Date().toISOString(),
    }),
  });
  check("服务端上传摘要不一致时标记失败", mismatch[0]?.status === "failed" && mismatch[0]?.errorCode === "ASSET_UPLOAD_RESPONSE_MISMATCH");
  check("摘要不一致保留本地失败状态", ((await db.assets.get(mismatchId))?.payload as LocalAssetPayload).uploads.original?.lastErrorCode === "ASSET_UPLOAD_RESPONSE_MISMATCH");

  const authFailId = await addPending(db, "2026-06-27T15:00:02.000Z");
  await uploadPendingAssets(db, {
    dataUrlToBlob: async () => new Blob([]),
    uploadContent: async () => { throw new CloudSyncApiError(401, "AUTH_REQUIRED", "expired"); },
  });
  const authFailure = ((await db.assets.get(authFailId))?.payload as LocalAssetPayload).uploads.original;
  check("401 归类为不可重试认证失败", authFailure?.lastErrorCode === "ASSET_UPLOAD_AUTH_ERROR" && authFailure.retryable === false);

  const serverFailId = await addPending(db, "2026-06-27T15:00:03.000Z");
  await uploadPendingAssets(db, {
    dataUrlToBlob: async () => new Blob([]),
    uploadContent: async () => { throw new CloudSyncApiError(503, "unavailable", "retry"); },
  });
  const serverFailure = ((await db.assets.get(serverFailId))?.payload as LocalAssetPayload).uploads.original;
  check("503 归类为可重试服务端失败", serverFailure?.lastErrorCode === "ASSET_UPLOAD_SERVER_ERROR" && serverFailure.retryable === true && Boolean(serverFailure.nextAttemptAt));

  const retryId = await addPending(db, "2026-06-27T15:00:04.000Z", "failed", true);
  let retryCalled = false;
  await uploadPendingAssets(db, {
    dataUrlToBlob: async () => new Blob([], { type: "image/png" }),
    uploadContent: async (request) => {
      retryCalled = request.params.assetId === retryId;
      return { status: "ok", assetId: request.params.assetId, variant: request.params.variant, uploadStatus: "uploaded", sha256: "a".repeat(64), mimeType: "image/png", sizeBytes: 1, updatedAt: new Date().toISOString() };
    },
  });
  check("到期的 failed retryable 资产会重试", retryCalled);

  const guardedId = await addPending(db, "2026-06-27T15:00:05.000Z");
  let attempted = false;
  setupSession(1);
  const registryKey = "wardrobe-account-workspace-registry-v1";
  const registry = JSON.parse(localMap.get(registryKey) ?? "{}") as any;
  registry.activeWorkspaceGeneration = 2;
  localMap.set(registryKey, JSON.stringify(registry));
  const guarded = await uploadPendingAssets(db, { uploadContent: async () => { attempted = true; throw new Error("unexpected"); } });
  check("workspace generation guard 阻止跨会话上传", guarded.length === 0 && !attempted && Boolean(await db.assets.get(guardedId)));

  db.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
