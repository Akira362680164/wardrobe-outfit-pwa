// scripts/test-thumbnail.ts
// ============================================================
// 缩略图链路 (v0.9.43-dev, 批次 1 缩略图基础设施) 单元测试
// ------------------------------------------------------------
// 覆盖批次 1 提示词包 §6 全部 8 个测试点:
//   1. 老 WardrobeItem 无 thumbnail 字段, 迁移后不崩
//   2. 已有 thumbnail 字段的 WardrobeItem, 迁移后字段保留
//   3. 老 ReferenceOutfitImage 无 thumbnail 字段, 迁移后不崩
//   4. 已有 thumbnail 字段的 ReferenceOutfitImage, 迁移后字段保留
//   5. 非法 thumbnailStatus 被清理
//   6. needsItemThumbnail 对 missing / failed / version 过期 / ready 判断正确
//   7. countMissingThumbnails 统计主图和参考图缺失数量正确
//   8. createThumbnailDataUrl 对一个测试 dataURL 能输出 data:image/ 开头的结果
//      (在无 canvas 的 Node 环境验证错误抛错路径, 不验证真实产出)
//
// 运行: npx tsx scripts/test-thumbnail.ts
// ============================================================

import { migrateItemRecord } from "../src/lib/migrate";
import {
  countMissingThumbnails,
  needsItemThumbnail,
  needsReferenceThumbnail,
} from "../src/lib/thumbnail";
import {
  CURRENT_THUMBNAIL_VERSION,
  createThumbnailDataUrl,
  supportsWebpDataUrl,
} from "../src/lib/image-variants";
import { generateThumbnailSafe } from "../src/lib/thumbnail-runtime";
import type { ReferenceOutfitImage, WardrobeItem } from "../src/lib/types";

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

function checkEq<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, `actual=${a} expected=${b}`);
}

function makeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 1,
    name: "白色 T 恤",
    imageDataUrl: "data:image/png;base64,MAIN",
    category: "tops",
    colors: { mode: "single", primary: "白" },
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRef(overrides: Partial<ReferenceOutfitImage> = {}): ReferenceOutfitImage {
  return {
    id: "ref-1",
    imageDataUrl: "data:image/png;base64,REF",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

// ============================================================
// 测试 1: 老 WardrobeItem 无 thumbnail 字段, 迁移后不崩
// ============================================================
console.log("\n=== 测试 1: 老 WardrobeItem 无 thumbnail 字段, 迁移后不崩 ===");
{
  const oldItem = {
    id: 1,
    name: "旧版衣物",
    imageDataUrl: "data:image/png;base64,OLD_MAIN",
    category: "top",
    primaryColors: ["白"],
    secondaryColors: [],
    seasons: ["all"],
    styles: ["casual"],
    formality: 2,
    warmth: 2,
    locationId: "home",
    status: "active",
    wornDates: [],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    // 注意: 没有 thumbnailDataUrl / Version / UpdatedAt / Status
  };
  const migrated = migrateItemRecord(oldItem);
  check("迁移成功 (不抛错)", !!migrated);
  check("thumbnailDataUrl 为 undefined", migrated.thumbnailDataUrl === undefined);
  check("thumbnailVersion 为 undefined", migrated.thumbnailVersion === undefined);
  check("thumbnailStatus 为 undefined", migrated.thumbnailStatus === undefined);
  checkEq("imageDataUrl 保留", migrated.imageDataUrl, "data:image/png;base64,OLD_MAIN");
}

// ============================================================
// 测试 2: 已有 thumbnail 字段的 WardrobeItem, 迁移后字段保留
// ============================================================
console.log("\n=== 测试 2: 已有 thumbnail 字段的 WardrobeItem, 迁移后字段保留 ===");
{
  const now = "2026-06-01T00:00:00.000Z";
  const itemWithThumb = makeItem({
    thumbnailDataUrl: "data:image/webp;base64,THUMB_MAIN",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailUpdatedAt: now,
    thumbnailStatus: "ready",
  });
  const migrated = migrateItemRecord(itemWithThumb);
  checkEq("thumbnailDataUrl 保留", migrated.thumbnailDataUrl, "data:image/webp;base64,THUMB_MAIN");
  checkEq("thumbnailVersion 保留", migrated.thumbnailVersion, CURRENT_THUMBNAIL_VERSION);
  checkEq("thumbnailUpdatedAt 保留", migrated.thumbnailUpdatedAt, now);
  checkEq("thumbnailStatus 保留", migrated.thumbnailStatus, "ready");
}

// ============================================================
// 测试 3: 老 ReferenceOutfitImage 无 thumbnail 字段, 迁移后不崩
// ============================================================
console.log("\n=== 测试 3: 老 ReferenceOutfitImage 无 thumbnail 字段, 迁移后不崩 ===");
{
  const item = makeItem({
    referenceOutfitImages: [
      { id: "old-ref-1", imageDataUrl: "data:image/png;base64,REF_OLD", createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
    ] as ReferenceOutfitImage[], // 老数据: 无 thumbnail 字段
  });
  const migrated = migrateItemRecord(item);
  const ref = migrated.referenceOutfitImages?.[0];
  check("参考图迁移成功", !!ref);
  check("ref.thumbnailDataUrl 为 undefined", ref?.thumbnailDataUrl === undefined);
  check("ref.thumbnailVersion 为 undefined", ref?.thumbnailVersion === undefined);
  check("ref.thumbnailStatus 为 undefined", ref?.thumbnailStatus === undefined);
  checkEq("ref.imageDataUrl 保留", ref?.imageDataUrl, "data:image/png;base64,REF_OLD");
}

// ============================================================
// 测试 4: 已有 thumbnail 字段的 ReferenceOutfitImage, 迁移后字段保留
// ============================================================
console.log("\n=== 测试 4: 已有 thumbnail 字段的 ReferenceOutfitImage, 迁移后字段保留 ===");
{
  const now = "2026-06-01T00:00:00.000Z";
  const refWithThumb: ReferenceOutfitImage = {
    id: "ref-thumb-1",
    imageDataUrl: "data:image/png;base64,REF",
    createdAt: now,
    updatedAt: now,
    thumbnailDataUrl: "data:image/webp;base64,THUMB_REF",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailUpdatedAt: now,
    thumbnailStatus: "ready",
  };
  const item = makeItem({ referenceOutfitImages: [refWithThumb] });
  const migrated = migrateItemRecord(item);
  const ref = migrated.referenceOutfitImages?.[0];
  checkEq("ref.thumbnailDataUrl 保留", ref?.thumbnailDataUrl, "data:image/webp;base64,THUMB_REF");
  checkEq("ref.thumbnailVersion 保留", ref?.thumbnailVersion, CURRENT_THUMBNAIL_VERSION);
  checkEq("ref.thumbnailUpdatedAt 保留", ref?.thumbnailUpdatedAt, now);
  checkEq("ref.thumbnailStatus 保留", ref?.thumbnailStatus, "ready");
}

// ============================================================
// 测试 5: 非法 thumbnailStatus 被清理
// ============================================================
console.log("\n=== 测试 5: 非法 thumbnailStatus 被清理 ===");
{
  // 主图非法 status
  const itemBadMain = makeItem({ thumbnailStatus: "wrong_value" as unknown as "ready" });
  const migratedMain = migrateItemRecord(itemBadMain);
  check("主图非法 status 清理为 undefined", migratedMain.thumbnailStatus === undefined);

  // 参考图非法 status
  const refBadStatus: ReferenceOutfitImage = {
    id: "ref-bad",
    imageDataUrl: "data:image/png;base64,REF",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    thumbnailStatus: "loading" as unknown as "ready",
  };
  const itemBadRef = makeItem({ referenceOutfitImages: [refBadStatus] });
  const migratedRef = migrateItemRecord(itemBadRef);
  check("参考图非法 status 清理为 undefined", migratedRef.referenceOutfitImages?.[0]?.thumbnailStatus === undefined);

  // 合法 status 全部保留
  for (const status of ["ready", "missing", "failed"] as const) {
    const m = migrateItemRecord(makeItem({ thumbnailStatus: status }));
    check(`合法 status "${status}" 保留`, m.thumbnailStatus === status);
  }
}

// ============================================================
// 测试 6: needsItemThumbnail 判断正确
// ============================================================
console.log("\n=== 测试 6: needsItemThumbnail 对 missing / failed / version 过期 / ready 判断正确 ===");
{
  // ready + version 一致 → false
  check("ready + version 一致 → 不需要", needsItemThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "ready",
  }) === false);

  // 缺 url → true
  check("缺 thumbnailDataUrl → 需要", needsItemThumbnail({
    thumbnailDataUrl: undefined,
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "ready",
  }) === true);

  // 空字符串 url → true
  check("空字符串 thumbnailDataUrl → 需要", needsItemThumbnail({
    thumbnailDataUrl: "",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "ready",
  }) === true);

  // 缺 version → true
  check("缺 thumbnailVersion → 需要", needsItemThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: undefined,
    thumbnailStatus: "ready",
  }) === true);

  // version 过期 → true
  check("thumbnailVersion 过期 → 需要", needsItemThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION - 1,
    thumbnailStatus: "ready",
  }) === true);

  // failed → true
  check("thumbnailStatus=failed → 需要", needsItemThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "failed",
  }) === true);

  // status=missing 也需要重生成
  check("thumbnailStatus=missing → 需要", needsItemThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "missing",
  }) === true);

  // 参考图同源逻辑
  check("needsReferenceThumbnail: ready + version 一致 → 不需要", needsReferenceThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "ready",
  }) === false);
  check("needsReferenceThumbnail: failed → 需要", needsReferenceThumbnail({
    thumbnailDataUrl: "data:image/webp;base64,X",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "failed",
  }) === true);
}

// ============================================================
// 测试 7: countMissingThumbnails 统计正确
// ============================================================
console.log("\n=== 测试 7: countMissingThumbnails 统计主图和参考图缺失数量正确 ===");
{
  // 场景 1: 空数组
  const empty = countMissingThumbnails([]);
  checkEq("空数组 → 全部为 0", empty, {
    mainTotal: 0, mainMissing: 0, referenceTotal: 0, referenceMissing: 0, failed: 0, outdatedVersion: 0,
  });

  // 场景 2: null/undefined
  const nullStats = countMissingThumbnails(null);
  checkEq("null → 全部为 0", nullStats, {
    mainTotal: 0, mainMissing: 0, referenceTotal: 0, referenceMissing: 0, failed: 0, outdatedVersion: 0,
  });

  // 场景 3: 1 件衣物, 1 个参考图, 都 ready
  const ready = makeItem({
    thumbnailDataUrl: "data:image/webp;base64,T",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "ready",
    referenceOutfitImages: [makeRef({
      thumbnailDataUrl: "data:image/webp;base64,R",
      thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
      thumbnailStatus: "ready",
    })],
  });
  const readyStats = countMissingThumbnails([ready]);
  checkEq("1+1 ready → mainTotal=1, refTotal=1, missing=0", {
    m: readyStats.mainTotal, mm: readyStats.mainMissing, rt: readyStats.referenceTotal, rm: readyStats.referenceMissing,
  }, { m: 1, mm: 0, rt: 1, rm: 0 });
  checkEq("failed=0, outdated=0", { f: readyStats.failed, o: readyStats.outdatedVersion }, { f: 0, o: 0 });

  // 场景 4: 主图 missing + 参考图 failed
  const mixed = makeItem({
    // 无 thumbnailDataUrl → 视为 missing
    referenceOutfitImages: [makeRef({
      thumbnailDataUrl: "data:image/webp;base64,R",
      thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
      thumbnailStatus: "failed",
    })],
  });
  const mixedStats = countMissingThumbnails([mixed]);
  checkEq("主图 missing + 参考图 failed", {
    mm: mixedStats.mainMissing, rm: mixedStats.referenceMissing, f: mixedStats.failed,
  }, { mm: 1, rm: 1, f: 1 });

  // 场景 5: 2 件衣物, 1 件有 main + ref 全 ready, 1 件有 main 无 thumbnail (缺) + ref failed
  const a = makeItem({ id: 1,
    thumbnailDataUrl: "data:image/webp;base64,A",
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    thumbnailStatus: "ready",
  });
  const b = makeItem({ id: 2,
    // 缺 thumbnail
    referenceOutfitImages: [makeRef({
      thumbnailDataUrl: "data:image/webp;base64,BR",
      thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
      thumbnailStatus: "failed",
    })],
  });
  const c = makeItem({ id: 3,
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION - 1, // 过期
    thumbnailDataUrl: "data:image/webp;base64,C",
    thumbnailStatus: "ready",
  });
  const multiStats = countMissingThumbnails([a, b, c]);
  checkEq("3 件: 1 件 ready, 1 件缺 main thumb + 1 ref failed, 1 件 version 过期",
    {
      m: multiStats.mainTotal, mm: multiStats.mainMissing,
      rt: multiStats.referenceTotal, rm: multiStats.referenceMissing,
      f: multiStats.failed, o: multiStats.outdatedVersion,
    },
    { m: 3, mm: 2, rt: 1, rm: 1, f: 1, o: 1 },
  );

  // 场景 6: 缺 imageDataUrl 的衣物不计入 mainTotal
  const noImage = { ...makeItem(), imageDataUrl: "" };
  const noImageStats = countMissingThumbnails([noImage]);
  checkEq("无 imageDataUrl 的衣物不计 main", {
    m: noImageStats.mainTotal, mm: noImageStats.mainMissing,
  }, { m: 0, mm: 0 });
}

// ============================================================
// 测试 8: createThumbnailDataUrl 对测试 dataURL 的错误处理路径
// ============================================================
async function runAsyncSuite(): Promise<void> {
  console.log("\n=== 测试 8: createThumbnailDataUrl 输入验证 (Node 无 canvas 路径) ===");
  // 8a: 非 dataURL 输入 → 抛错
  try {
    await createThumbnailDataUrl("not-a-data-url");
    check("非 dataURL 应该抛错", false, "未抛错");
  } catch (e) {
    check("非 dataURL 抛错", /data:image\//.test((e as Error).message), `msg=${(e as Error).message}`);
  }

  // 8b: 非字符串 → 抛错
  try {
    await createThumbnailDataUrl(null as unknown as string);
    check("非字符串应抛错", false, "未抛错");
  } catch (e) {
    check("非字符串抛错", /dataURL/.test((e as Error).message), `msg=${(e as Error).message}`);
  }

  // 8c: 合法 dataURL 但无 canvas → 抛"不支持图片处理"
  // 1x1 透明 PNG base64 (合法 PNG, 短)
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  try {
    const out = await createThumbnailDataUrl(tinyPng);
    // 走到这里说明有 canvas (理论上不可能在 Node 22 裸跑), 验证返回 data:image/ 开头
    check("有 canvas 时返回 data:image/ 开头", out.startsWith("data:image/"), `out=${out.slice(0, 30)}...`);
  } catch (e) {
    const msg = (e as Error).message;
    // Node 22 裸跑无 canvas → 抛"不支持图片处理", 这也是合法路径
    check(
      "无 canvas 环境抛 '图片处理' 错误",
      /图片处理|canvas|HTTP|HtmlCanvas/.test(msg) || /createImageBitmap/.test(msg),
      `msg=${msg}`,
    );
  }

  // 8d: supportsWebpDataUrl 在 Node 环境默认 false
  const webpSupport = await supportsWebpDataUrl();
  check("Node 环境 supportsWebpDataUrl() 返回 boolean", typeof webpSupport === "boolean");
}

// ============================================================
// 批次 2: generateThumbnailSafe helper 契约 (不依赖 React / Dexie)
// ============================================================
async function runBatch2Suite(): Promise<void> {
  console.log("\n=== 批次 2: generateThumbnailSafe helper 契约 ===");

  // 9a: 传 undefined → 返回 {} (无源图, 不算失败, 不写 status)
  const r1 = await generateThumbnailSafe(undefined);
  checkEq("undefined → 返回 {} (无 thumbnailStatus)", r1, {});

  // 9b: 传 null → 返回 {}
  const r2 = await generateThumbnailSafe(null);
  checkEq("null → 返回 {} (无 thumbnailStatus)", r2, {});

  // 9c: 传空字符串 → 返回 {}
  const r3 = await generateThumbnailSafe("");
  checkEq("空字符串 → 返回 {} (无 thumbnailStatus)", r3, {});

  // 9d: 传非 dataURL → 内部 createThumbnailDataUrl 抛错, generateThumbnailSafe 兜住
  //     返回 { thumbnailStatus: "failed" } (不抛, 不写 url)
  const r4 = await generateThumbnailSafe("not-a-data-url");
  check("非 dataURL → 不抛错, 返回 failed 状态", !r4.thumbnailDataUrl && r4.thumbnailStatus === "failed");
  check("非 dataURL → 不含 thumbnailVersion", r4.thumbnailVersion === undefined);

  // 9e: 传合法 PNG 头 dataURL → 在 Node 环境无 canvas, 内部抛错兜住
  //     成功路径返回 ready 状态 + thumbnailVersion, 失败路径返回 failed
  const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const r5 = await generateThumbnailSafe(tinyPng);
  if (r5.thumbnailDataUrl) {
    // 走到这里说明有 canvas, 验证 ready 路径
    check("有 canvas: thumbnailDataUrl 是 data:image/ 开头", r5.thumbnailDataUrl.startsWith("data:image/"));
    check("有 canvas: thumbnailVersion = CURRENT_THUMBNAIL_VERSION", r5.thumbnailVersion === CURRENT_THUMBNAIL_VERSION);
    check("有 canvas: thumbnailStatus = ready", r5.thumbnailStatus === "ready");
    check("有 canvas: thumbnailUpdatedAt 是 ISO 字符串", typeof r5.thumbnailUpdatedAt === "string" && r5.thumbnailUpdatedAt!.includes("T"));
  } else {
    // 无 canvas, 验证 failed 兜底
    check("无 canvas: 兜底返回 failed 状态", r5.thumbnailStatus === "failed");
    check("无 canvas: 不含 version / updatedAt", r5.thumbnailVersion === undefined && r5.thumbnailUpdatedAt === undefined);
  }

  // 9f: 多次调用结果应独立 (不污染彼此 / 不共享 state)
  const r6a = await generateThumbnailSafe(undefined);
  const r6b = await generateThumbnailSafe("not-a-data-url");
  checkEq("多次调用结果独立 (a=undefined 路径)", r6a, {});
  check("多次调用结果独立 (b=failed 路径)", !r6b.thumbnailDataUrl && r6b.thumbnailStatus === "failed");
}

runAsyncSuite()
  .then(() => runBatch2Suite())
  .then(() => {
    console.log(`\n=== 总计: ${pass} pass / ${fail} fail ===\n`);
    if (fail > 0) {
      console.log("失败项：");
      for (const f of failures) console.log(`  - ${f}`);
      process.exit(1);
    }
    console.log("🎉 批次 1 + 批次 2 helper 全部测试通过");
  })
  .catch((e) => {
    console.error("测试异常:", e);
    process.exit(1);
  });
