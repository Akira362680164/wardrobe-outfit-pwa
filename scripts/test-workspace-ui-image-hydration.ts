import "fake-indexeddb/auto";
// v2.0.11-test P0-1: workspace-ui-mapper 图片资产回填测试
// 验证 UI 快照能从 db.assets 表把 imageDataUrl / thumbnailDataUrl / sourceImageDataUrl /
// outfit coverImageDataUrl / outfitRealImages 等字段正确回填到 UI 模型。

import { strict as assert } from "node:assert";
import { readWorkspaceUiSnapshot } from "../src/lib/cloud-sync/workspace-ui-mapper";
import {
  createAccountWorkspaceDb,
  type AccountWorkspaceDatabase,
} from "../src/lib/account-workspace-db";

const ORIGINAL_DATA_URL = "data:image/png;base64,ORIGINAL-IMAGE-DATA";
const THUMB_DATA_URL = "data:image/png;base64,THUMB-IMAGE-DATA";
const SOURCE_DATA_URL = "data:image/png;base64,SOURCE-IMAGE-DATA";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    const msg = detail ? ` — ${detail}` : "";
    failures.push(`${name}${msg}`);
    console.log(`  ❌ ${name}${msg}`);
  }
}

function buildDb(): AccountWorkspaceDatabase {
  const db = createAccountWorkspaceDb("test-workspace-ui-image-hydration-" + Math.random().toString(36).slice(2, 8));
  return db;
}

async function seedGarment(db: AccountWorkspaceDatabase, userId: string) {
  const garmentId = "g-1";
  await db.garments.put({
    id: garmentId,
    userId,
    revision: 1,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    originDeviceId: "device-1",
    locationId: "home",
    name: "白衬衫",
    payload: { name: "白衬衫", category: "tops" },
  });
  return garmentId;
}

async function seedAsset(db: AccountWorkspaceDatabase, userId: string, ownerEntityId: string, ownerEntityType: "garment" | "wishlistItem" | "outfit", fieldName: string, dataUrl: string, updatedAt = "2026-06-29T00:00:00.000Z") {
  await db.assets.put({
    id: `asset-${ownerEntityId}-${fieldName}`,
    userId,
    revision: 1,
    createdAt: updatedAt,
    updatedAt,
    originDeviceId: "device-1",
    ownerEntityType,
    ownerEntityId,
    payload: {
      uploads: {
        original: { dataUrl, status: "local_pending" },
        thumbnail: { dataUrl: THUMB_DATA_URL, status: "local_pending" },
      },
      source: { kind: "legacy_entity_image", fieldName },
      thumbnailStatus: "ready",
    },
  });
}

async function seedLocation(db: AccountWorkspaceDatabase, userId: string, id: string, name: string) {
  await db.locations.put({
    id,
    userId,
    revision: 1,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
    originDeviceId: "device-1",
    name,
    payload: { name, dexieId: id, sortOrder: 1 },
  });
}

async function main() {
  // case 1: garment image hydration
  {
    const db = buildDb();
    const userId = "user-1";
    await seedLocation(db, userId, "home", "默认衣橱");
    const garmentId = await seedGarment(db, userId);
    await seedAsset(db, userId, garmentId, "garment", "imageDataUrl", ORIGINAL_DATA_URL);
    const snap = await readWorkspaceUiSnapshot(db);
    const item = snap.items[0];
    check("garment imageDataUrl 从 assets 回填", item?.imageDataUrl === ORIGINAL_DATA_URL, `actual=${item?.imageDataUrl?.slice(0, 40)}`);
    check("garment thumbnailDataUrl 从 assets 回填", item?.thumbnailDataUrl === THUMB_DATA_URL);
  }

  // case 2: garment 无 assets 时不再回退 payload (v2.0.12-test 严格只读资产架构)
  {
    const db = buildDb();
    const userId = "user-2";
    await seedLocation(db, userId, "home", "默认衣橱");
    const garmentId = "g-2";
    await db.garments.put({
      id: garmentId,
      userId,
      revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1",
      locationId: "home",
      name: "no-asset",
      payload: { name: "no-asset", imageDataUrl: SOURCE_DATA_URL, thumbnailDataUrl: THUMB_DATA_URL, sourceImageDataUrl: SOURCE_DATA_URL },
    });
    const snap = await readWorkspaceUiSnapshot(db);
    const item = snap.items[0];
    check("garment 无 assets 时 imageDataUrl 为空字符串 (禁止 payload fallback)", item?.imageDataUrl === "");
    check("garment 无 assets 时 thumbnailDataUrl 为 undefined (禁止 payload fallback)", item?.thumbnailDataUrl === undefined);
    check("garment 无 assets 时 sourceImageDataUrl 为 undefined (禁止 payload fallback)", item?.sourceImageDataUrl === undefined);
  }

  // case 2b: 录入后立即回填 (录入后第一次刷新即可读取图片)
  {
    const db = buildDb();
    const userId = "user-2b";
    await seedLocation(db, userId, "home", "默认衣橱");
    const garmentId = "g-2b";
    await db.garments.put({
      id: garmentId, userId, revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z", updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1", locationId: "home", name: "fresh",
      payload: { name: "fresh" },
    });
    await seedAsset(db, userId, garmentId, "garment", "imageDataUrl", ORIGINAL_DATA_URL);
    const snap = await readWorkspaceUiSnapshot(db);
    const item = snap.items[0];
    check("录入后第一次刷新即可读取 garment 主图", item?.imageDataUrl === ORIGINAL_DATA_URL);
    check("录入后第一次刷新即可读取 garment 缩略图", item?.thumbnailDataUrl === THUMB_DATA_URL);
  }

  // case 2c: 单个 asset 解析失败不阻断其他实体读取
  {
    const db = buildDb();
    const userId = "user-2c";
    await seedLocation(db, userId, "home", "默认衣橱");
    const garmentA = "g-2c-a";
    const garmentB = "g-2c-b";
    await db.garments.put({
      id: garmentA, userId, revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z", updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1", locationId: "home", name: "A", payload: { name: "A" },
    });
    await db.garments.put({
      id: garmentB, userId, revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z", updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1", locationId: "home", name: "B", payload: { name: "B" },
    });
    // garmentA 写入一个 malformed asset (uploads 缺失)
    await db.assets.put({
      id: "a-malformed", userId, revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z", updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1",
      ownerEntityType: "garment", ownerEntityId: garmentA,
      payload: { uploads: undefined, source: { kind: "legacy_entity_image", fieldName: "imageDataUrl" }, thumbnailStatus: "failed" },
    });
    // garmentB 写入正常 asset
    await seedAsset(db, userId, garmentB, "garment", "imageDataUrl", ORIGINAL_DATA_URL);
    const snap = await readWorkspaceUiSnapshot(db);
    const items = snap.items;
    const a = items.find((it) => it.name === "A");
    const b = items.find((it) => it.name === "B");
    check("malformed asset 不阻断其他实体", items.length === 2);
    check("garmentA 在 malformed asset 下 imageDataUrl 为空", a?.imageDataUrl === "");
    check("garmentB 正常资产仍可读出", b?.imageDataUrl === ORIGINAL_DATA_URL);
  }

  // case 3: outfit cover image hydration
  {
    const db = buildDb();
    const userId = "user-5";
    await seedLocation(db, userId, "home", "默认衣橱");
    const outfitId = "o-1";
    await db.outfits.put({
      id: outfitId,
      userId,
      revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1",
      name: "套装1",
      payload: { name: "套装1" },
    });
    await seedAsset(db, userId, outfitId, "outfit", "coverImageDataUrl", ORIGINAL_DATA_URL);
    const snap = await readWorkspaceUiSnapshot(db);
    const outfit = snap.outfits[0];
    check("outfit coverImageDataUrl 从 assets 回填", outfit?.coverImageDataUrl === ORIGINAL_DATA_URL, `actual=${outfit?.coverImageDataUrl?.slice(0, 40)}`);
    check("outfit thumbnailDataUrl 从 assets 回填", outfit?.thumbnailDataUrl === THUMB_DATA_URL);
  }

  // case 6: wishlist image hydration
  {
    const db = buildDb();
    const userId = "user-6";
    await seedLocation(db, userId, "home", "默认衣橱");
    const wishlistId = "w-1";
    await db.wishlistItems.put({
      id: wishlistId,
      userId,
      revision: 1,
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
      originDeviceId: "device-1",
      status: "interested",
      payload: { name: "种草1" },
    });
    await seedAsset(db, userId, wishlistId, "wishlistItem", "imageDataUrl", ORIGINAL_DATA_URL);
    const snap = await readWorkspaceUiSnapshot(db);
    const w = snap.wishlistItems[0];
    check("wishlist imageDataUrl 从 assets 回填", w?.imageDataUrl === ORIGINAL_DATA_URL, `actual=${w?.imageDataUrl?.slice(0, 40)}`);
  }

  console.log(`\nworkspace-ui image hydration tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error("failures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("unexpected error", err);
  process.exit(1);
});
