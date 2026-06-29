import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";

process.env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED = "true";
process.env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED = "true";

const storage = new Map<string, string>();
const session = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    sessionStorage: {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => session.set(key, value),
    },
  },
});

import { getAccountWorkspaceDb } from "../src/lib/account-workspace-db";
import { buildGarmentAssetDiagnosticSnapshot } from "../src/lib/cloud-sync/asset-diagnostics";
import { saveWorkspaceRegistry } from "../src/lib/workspace-registry";

const userId = "10000000-0000-4000-8000-000000000001";
const garmentId = "20000000-0000-4000-8000-000000000001";
const assetId = "30000000-0000-4000-8000-000000000001";
const restoredOnlyAssetId = "30000000-0000-4000-8000-000000000002";
const originalSha = "a".repeat(64);
const thumbnailSha = "b".repeat(64);
const now = "2026-06-30T00:00:00.000Z";

async function main() {
  session.set("wardrobe-cloud-auth-session-v1", JSON.stringify({
    deviceId: "diagnostic-device",
    deviceLabel: "diagnostic-test",
    accessToken: "test-access-token",
    user: { id: userId, maskedPhone: "138****0000" },
  }));
  saveWorkspaceRegistry({
  version: 1,
  activeUserId: userId,
  activeDbName: "wardrobe_asset_diagnostics_test",
  activeWorkspaceGeneration: 1,
  updatedAt: now,
  workspaces: {
    [userId]: {
      userId,
      userIdHash: "diagnostic-user-hash",
      dbName: "wardrobe_asset_diagnostics_test",
      schemaVersion: 2,
      activeWorkspaceGeneration: 1,
      createdAt: now,
      lastOpenedAt: now,
      deviceId: "diagnostic-device",
    },
  },
  });

  const db = getAccountWorkspaceDb({ dbName: "wardrobe_asset_diagnostics_test" });
  await db.garments.put({
  id: garmentId, userId, revision: 1, createdAt: now, updatedAt: now, originDeviceId: "diagnostic-device",
  payload: {
    cloudAssetRefs: {
      imageDataUrl: { assetId, sourceFieldName: "imageDataUrl", variants: ["original", "thumbnail"], sha256: originalSha, mimeType: "image/jpeg", variantSha256: { original: originalSha, thumbnail: thumbnailSha } },
      "referenceOutfitImages.restored.imageDataUrl": { assetId: restoredOnlyAssetId, sourceFieldName: "referenceOutfitImages.restored.imageDataUrl", variants: ["original"], sha256: originalSha, mimeType: "image/jpeg", variantSha256: { original: originalSha } },
    },
  },
  });
  await db.assets.put({
  id: assetId, userId, ownerEntityType: "garment", ownerEntityId: garmentId, sha256: originalSha,
  revision: 1, createdAt: now, updatedAt: now, originDeviceId: "diagnostic-device",
  payload: {
    source: { kind: "legacy_entity_image", fieldName: "imageDataUrl" },
    thumbnailStatus: "ready",
    uploads: {
      original: { status: "uploaded", sha256: originalSha, sizeBytes: 100, mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,SECRET" },
      thumbnail: { status: "failed", sha256: thumbnailSha, sizeBytes: 20, mimeType: "image/jpeg", attemptCount: 2, lastErrorCode: "ASSET_UPLOAD_SERVER_ERROR", dataUrl: "data:image/jpeg;base64,SECRET" },
    },
  },
  });

  const snapshot = await buildGarmentAssetDiagnosticSnapshot();
  assert.equal(snapshot.available, true, JSON.stringify(snapshot));
  assert.equal(snapshot.pendingUploadCount, 0);
  assert.equal(snapshot.failedUploadCount, 1);
  assert.equal(snapshot.records[0]?.cloudAssetRef?.variantSha256?.thumbnail, thumbnailSha);
  assert.equal(snapshot.records[0]?.thumbnail.lastErrorCode, "ASSET_UPLOAD_SERVER_ERROR");
  const restoredOnly = snapshot.records.find((record) => record.assetId === restoredOnlyAssetId);
  assert.equal(restoredOnly?.original.status, "missing", "重装后即使没有本地 asset 记录也必须导出 cloudAssetRef");
  assert.equal(JSON.stringify(snapshot).includes("base64"), false, "诊断快照不得包含图片内容");

  console.log("asset diagnostics snapshot: passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
