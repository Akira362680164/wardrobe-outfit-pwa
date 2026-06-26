import "fake-indexeddb/auto";
import { strict as assert } from "node:assert";
import Dexie from "dexie";

import { createAccountWorkspaceDb, createWorkspaceUuidV7 } from "../src/lib/account-workspace-db";
import type { AccountWorkspaceRecord } from "../src/lib/workspace-registry";
import {
  buildUploadVariant,
  parseImageDataUrlMimeType,
  prepareLocalAsset,
  putPreparedLocalAsset,
} from "../src/lib/cloud-sync/asset-metadata";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function main() {
  const now = new Date("2026-06-26T14:00:00.000Z");
  const sourceDataUrl = "data:image/png;base64,aGVsbG8=";
  const thumbnailDataUrl = "data:image/jpeg;base64,dGh1bWI=";
  const userId = "00000000-0000-4000-8000-000000000001";
  const dbName = `wardrobe_assets_local_${Date.now()}`;
  await Dexie.delete(dbName);
  const db = createAccountWorkspaceDb(dbName);
  await db.open();

  const workspace: AccountWorkspaceRecord = {
    userId,
    userIdHash: "assets-local",
    dbName,
    schemaVersion: 1,
    activeWorkspaceGeneration: 1,
    createdAt: now.toISOString(),
    lastOpenedAt: now.toISOString(),
    deviceId: "device-assets-local",
  };

  check("parseImageDataUrlMimeType 读取 MIME", parseImageDataUrlMimeType(sourceDataUrl) === "image/png");
  let invalidRejected = false;
  try {
    parseImageDataUrlMimeType("data:text/plain;base64,aGVsbG8=");
  } catch {
    invalidRejected = true;
  }
  check("parseImageDataUrlMimeType 拒绝非图片 dataURL", invalidRejected);

  const original = await buildUploadVariant("original", sourceDataUrl, {
    readImageSize: async () => ({ width: 321.4, height: 654.6 }),
  });
  check("buildUploadVariant 计算 SHA-256", original.metadata.sha256 === "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  check("buildUploadVariant 记录字节数和尺寸", original.metadata.sizeBytes === 5 && original.metadata.width === 321 && original.metadata.height === 655);

  const ownerEntityId = createWorkspaceUuidV7(now);
  const prepared = await prepareLocalAsset({
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "garment",
    ownerEntityId,
    sourceDataUrl,
    thumbnailDataUrl,
    sourceFieldName: "imageDataUrl",
    now,
  }, {
    readImageSize: async (dataUrl) => dataUrl === thumbnailDataUrl ? { width: 120, height: 120 } : { width: 800, height: 1000 },
  });

  const payload = prepared.record.payload as Record<string, unknown>;
  const payloadJson = JSON.stringify(payload);
  check("prepareLocalAsset 生成 asset id 和 owner", prepared.assetId === prepared.record.id && prepared.record.ownerEntityType === "garment" && prepared.record.ownerEntityId === ownerEntityId);
  check("prepareLocalAsset 记录 original 主元数据", prepared.record.sha256 === original.metadata.sha256 && prepared.record.mimeType === "image/png");
  check("prepareLocalAsset 生成 original + thumbnail 上传变体", prepared.uploadVariants.length === 2 && prepared.uploadVariants.some((v) => v.variant === "thumbnail"));
  check("prepareLocalAsset payload 保存 dataUrl 用于上传暂存", payloadJson.includes("data:image"));
  check("prepareLocalAsset payload 标记缩略图 ready", payloadJson.includes('"thumbnailStatus":"ready"'));

  await putPreparedLocalAsset(db, prepared);
  const stored = await db.assets.get(prepared.assetId);
  check("putPreparedLocalAsset 写入 workspace assets", stored?.ownerEntityId === ownerEntityId && stored.userId === userId);

  const noThumb = await prepareLocalAsset({
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "wishlistItem",
    ownerEntityId: createWorkspaceUuidV7(new Date("2026-06-26T14:00:01.000Z")),
    sourceDataUrl,
    generateThumbnail: false,
    now,
  });
  check("prepareLocalAsset 缺缩略图时只生成 original", noThumb.uploadVariants.length === 1 && JSON.stringify(noThumb.record.payload).includes('"thumbnailStatus":"missing"'));

  const generated = await prepareLocalAsset({
    workspace,
    originDeviceId: workspace.deviceId,
    ownerEntityType: "outfit",
    ownerEntityId: createWorkspaceUuidV7(new Date("2026-06-26T14:00:02.000Z")),
    sourceDataUrl,
    generateThumbnail: true,
    now,
  }, {
    createThumbnail: async () => thumbnailDataUrl,
    readImageSize: async () => ({ width: 10, height: 20 }),
  });
  check("prepareLocalAsset 可注入缩略图生成器", generated.uploadVariants.length === 2 && JSON.stringify(generated.record.payload).includes('"thumbnailStatus":"ready"'));

  db.close();
  await Dexie.delete(dbName);
  console.log(`\n${pass} passed, ${fail} failed`);
  assert.equal(fail, 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
