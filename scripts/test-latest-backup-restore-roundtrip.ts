/**
 * test-latest-backup-restore-roundtrip
 *
 * Validates backup roundtrip: create → tokenize → resolve → restore
 * Uses real Dexie for transaction testing.
 *
 * Run: npx tsx scripts/test-latest-backup-restore-roundtrip.ts
 */

import "fake-indexeddb/auto";
import { createLatestBackup, parseLatestBackupMetadata } from "../src/lib/backup-data";
import { validateLatestBackupReferences, applyLatestWardrobeBackup } from "../src/lib/backup-restore";
import { buildLongTermBackupEntries, resolveLatestImageTokensStrict, restoreLongTermBackupFromPackage } from "../src/lib/long-term-backup";
import { getWardrobeDb } from "../src/lib/db";
import type { WardrobeItem, ClosetLocation, SavedOutfit, WishlistItem, OutfitPlanEntry, OutfitCalendarPlan, PlanPackingChecklistItem, TryOnProfile } from "../src/lib/types";

const PASS = 0;
const FAIL = 1;

function check(name: string, cond: unknown): void {
  if (!cond) {
    console.error(`  FAIL  ${name}`);
    process.exitCode = FAIL;
  } else {
    console.error(`  OK    ${name}`);
  }
}

const now = "2026-06-25T00:00:00.000Z";
function id(): string { return `test-${Math.random().toString(36).slice(2)}`; }

async function main() {
  const loc1: ClosetLocation = { id: id(), name: "主衣柜", note: "", sortOrder: 1, createdAt: now, updatedAt: now };
  const loc2: ClosetLocation = { id: id(), name: "鞋柜", note: "", sortOrder: 2, createdAt: now, updatedAt: now };
  const locations = [loc1, loc2];

  const items: WardrobeItem[] = [
    { id: 1, name: "白衬衫", category: "tops", colors: { mode: "single", primary: "白" } as const, seasons: ["spring", "summer"], styles: ["commute"], status: "active", needsReview: false, locationId: loc1.id, imageDataUrl: "data:image/png;base64,test1", wornDates: [], createdAt: now, updatedAt: now },
    { id: 2, name: "牛仔裤", category: "pants", colors: { mode: "single", primary: "牛仔蓝" } as const, seasons: ["all"], styles: ["casual"], status: "active", needsReview: false, locationId: loc1.id, imageDataUrl: "data:image/png;base64,test2", wornDates: [], createdAt: now, updatedAt: now },
    { id: 3, name: "运动鞋", category: "shoes", colors: { mode: "single", primary: "黑" } as const, seasons: ["all"], styles: ["casual"], status: "active", needsReview: false, locationId: loc2.id, imageDataUrl: "", wornDates: [], createdAt: now, updatedAt: now },
    { id: 4, name: "公文包", category: "bags", colors: { mode: "single", primary: "棕" } as const, seasons: ["all"], styles: ["commute"], status: "active", needsReview: false, locationId: loc1.id, imageDataUrl: "data:image/png;base64,test4", wornDates: [], createdAt: now, updatedAt: now },
  ];

  const outfits: SavedOutfit[] = [
    { id: id(), name: "通勤套装", itemIds: [1, 2, 4], coverImageDataUrl: "data:image/png;base64,outfit1", destination: "办公室", activity: "commute", style: "commute", source: "manual", favorite: true, createdAt: now, updatedAt: now },
    { id: id(), name: "休闲套装", itemIds: [1, 2, 3], source: "manual", favorite: false, createdAt: now, updatedAt: now },
  ];

  const wishlistItems: WishlistItem[] = [
    { id: id(), name: "种草1", category: "tops", colors: { mode: "single", primary: "红" } as const, seasons: ["autumn"], styles: ["casual"], status: "interested", imageDataUrl: "data:image/png;base64,wish1", createdAt: now, updatedAt: now },
    { id: id(), name: "种草2", category: "pants", colors: { mode: "single", primary: "黑" } as const, seasons: ["winter"], styles: ["commute"], status: "interested", imageDataUrl: "", createdAt: now, updatedAt: now },
  ];

  const tryOnProfile = { id: "default" as const, enabled: true, fullBodyImageDataUrl: "data:image/png;base64,profile", createdAt: now, updatedAt: now } as TryOnProfile;

  const outfitPlanEntries: OutfitPlanEntry[] = [
    { id: id(), date: "2026-06-26", outfitId: outfits[0].id, status: "planned" as const, createdAt: now, updatedAt: now },
    { id: id(), date: "2026-06-27", outfitId: outfits[1].id, status: "planned" as const, createdAt: now, updatedAt: now },
    { id: id(), date: "2026-06-28", itemIds: [1, 2], status: "planned" as const, createdAt: now, updatedAt: now },
  ];

  const outfitCalendarPlans: OutfitCalendarPlan[] = [
    { id: id(), type: "travel", title: "旅行计划", startDate: "2026-07-01", endDate: "2026-07-03", destination: "上海", tone: "slate", createdAt: now, updatedAt: now },
  ];

  const planPackingChecklistItems: PlanPackingChecklistItem[] = [
    { id: id(), calendarPlanId: outfitCalendarPlans[0].id, source: "wardrobe", itemId: 1, label: "白衬衫", checked: false, createdAt: now, updatedAt: now },
    { id: id(), calendarPlanId: outfitCalendarPlans[0].id, source: "wardrobe", itemId: 2, label: "牛仔裤", checked: false, createdAt: now, updatedAt: now },
    { id: id(), calendarPlanId: outfitCalendarPlans[0].id, source: "manual", label: "防晒霜", checked: true, createdAt: now, updatedAt: now },
  ];

  // 1. 备份创建包含全部表
  const backup = createLatestBackup(items, locations, outfits, tryOnProfile, wishlistItems, outfitPlanEntries, outfitCalendarPlans, planPackingChecklistItems);
  check("备份包含 locations", backup.locations.length === 2);
  check("备份包含 items", backup.items.length === 4);
  check("备份包含 outfits", (backup.outfits ?? []).length === 2);
  check("备份包含 wishlistItems", (backup.wishlistItems ?? []).length === 2);
  check("备份包含 tryOnProfile", !!backup.tryOnProfile);
  check("备份包含 outfitPlanEntries", (backup.outfitPlanEntries ?? []).length === 3);
  check("备份包含 outfitCalendarPlans", (backup.outfitCalendarPlans ?? []).length === 1);
  check("备份包含 planPackingChecklistItems", (backup.planPackingChecklistItems ?? []).length === 3);

  // 2. 包构建后图片 Token 数正确
  const entries = await buildLongTermBackupEntries({ items, locations, outfits, wishlistItems, outfitPlanEntries, outfitCalendarPlans, planPackingChecklistItems, tryOnProfile, appVersion: "1.1.30" });
  // items[0,1,3] + outfits[0] + wishlistItems[0] + tryOnProfile = 6 images with data:image
  const dataImageCount = [items[0], items[1], items[3], wishlistItems[0]].filter(i => i.imageDataUrl).length +
    (outfits[0].coverImageDataUrl ? 1 : 0) +
    (tryOnProfile.fullBodyImageDataUrl ? 1 : 0);
  check("图片 Token 数正确", entries.imageCount === dataImageCount);

  // 3. 严格还原后图片内容逐字一致
  const resolved = await resolveLatestImageTokensStrict(entries.metadataJson, async (fileName) => {
    const entry = entries.imageEntries.find(e => e.fileName === fileName);
    return entry?.text ?? "";
  }, entries.imageCount);
  check("还原后包含所有图片 data:image", (resolved.match(/data:image\//g) ?? []).length === dataImageCount);

  const imageEntry = entries.imageEntries[0];
  const cleanImageDataUrl = imageEntry.text;
  const pollutionCases: Array<[string, string]> = [
    ["旧 Android 尾部 LF", `${cleanImageDataUrl}\n`],
    ["旧 Android 尾部 CRLF", `${cleanImageDataUrl}\r\n`],
    ["UTF-8 BOM", `﻿${cleanImageDataUrl}`],
    ["首尾空白", `  ${cleanImageDataUrl}  `],
  ];
  for (const [name, polluted] of pollutionCases) {
    const pollutedResolved = await resolveLatestImageTokensStrict(entries.metadataJson, async (fileName) => {
      const entry = entries.imageEntries.find(e => e.fileName === fileName);
      return entry?.fileName === imageEntry.fileName ? polluted : (entry?.text ?? "");
    }, entries.imageCount);
    const pollutedParsed = parseLatestBackupMetadata(pollutedResolved);
    check(`${name} 可恢复且图片逐字一致`, pollutedParsed.items[0].imageDataUrl === cleanImageDataUrl);
  }

  async function expectResolveFailure(name: string, metadataJson: string, imageText: string, expectedImageCount = entries.imageCount) {
    try {
      await resolveLatestImageTokensStrict(metadataJson, async (fileName) => {
        const entry = entries.imageEntries.find(e => e.fileName === fileName);
        return entry?.fileName === imageEntry.fileName ? imageText : (entry?.text ?? "");
      }, expectedImageCount);
      check(name, false);
    } catch {
      check(name, true);
    }
  }

  await expectResolveFailure("图片正文中间换行会失败", entries.metadataJson, cleanImageDataUrl.replace(",", ",\n"));
  await expectResolveFailure("图片条目为空会失败", entries.metadataJson, "");
  await expectResolveFailure("非 data:image 会失败", entries.metadataJson, "data:text/plain;base64,abc");
  await expectResolveFailure("缺少 ;base64, 会失败", entries.metadataJson, "data:image/png,abc");
  await expectResolveFailure("manifest imageCount 少于 Token 数量会失败", entries.metadataJson, cleanImageDataUrl, entries.imageCount - 1);
  await expectResolveFailure("manifest imageCount 多于 Token 数量会失败", entries.metadataJson, cleanImageDataUrl, entries.imageCount + 1);
  await expectResolveFailure("metadata JSON 损坏会失败", entries.metadataJson.slice(0, -1), cleanImageDataUrl);

  const discontinuousMetadata = entries.metadataJson.replace("%%IMG_1%%", "%%IMG_2%%");
  await expectResolveFailure("Token 索引不连续会失败", discontinuousMetadata, cleanImageDataUrl);

  const noteTokenMetadata = JSON.stringify({
    version: 5,
    exportedAt: now,
    locations,
    items: [{ ...items[2], note: "abc%%IMG_0%%xyz" }],
    outfits: [],
    wishlistItems: [],
    outfitPlanEntries: [],
    outfitCalendarPlans: [],
    planPackingChecklistItems: [],
  });
  const noteTokenResolved = await resolveLatestImageTokensStrict(noteTokenMetadata, async () => cleanImageDataUrl, 0);
  check("普通备注中的局部 Token 不会被替换", JSON.parse(noteTokenResolved).items[0].note === "abc%%IMG_0%%xyz");

  const duplicatedTokenMetadata = JSON.stringify({
    version: 5,
    exportedAt: now,
    locations,
    items: [
      { ...items[0], imageDataUrl: "%%IMG_0%%" },
      { ...items[1], imageDataUrl: "%%IMG_0%%" },
    ],
    outfits: [],
    wishlistItems: [],
    outfitPlanEntries: [],
    outfitCalendarPlans: [],
    planPackingChecklistItems: [],
  });
  const duplicatedTokenResolved = await resolveLatestImageTokensStrict(duplicatedTokenMetadata, async () => cleanImageDataUrl, 1);
  check("同一个 Token 多次出现复用同一图片", (duplicatedTokenResolved.match(new RegExp(cleanImageDataUrl, "g")) ?? []).length >= 2);

  // 4. metadata roundtrip
  const parsed = parseLatestBackupMetadata(resolved);
  check("metadata roundtrip: items 数量一致", parsed.items.length === 4);
  check("metadata roundtrip: locations 数量一致", parsed.locations.length === 2);

  // 5. Manifest metadata roundtrip
  const restored = await restoreLongTermBackupFromPackage({
    manifestJson: entries.manifestJson,
    metadataJson: entries.metadataJson,
    readImageText: async (fileName) => {
      const entry = entries.imageEntries.find(e => e.fileName === fileName);
      return entry?.text ?? "";
    },
  });
  check("完整 roundtrip: items", restored.items.length === 4);
  check("完整 roundtrip: outfits", (restored.outfits ?? []).length === 2);

  // 6. 验证引用
  const preview = validateLatestBackupReferences(restored);
  check("验证通过 itemCount", preview.itemCount === 4);

  // 7. Dexie 原子事务
  const db = getWardrobeDb();
  // Clear first, then apply
  await applyLatestWardrobeBackup(restored);
  const dbItems = await db.items.toArray();
  check("Dexie apply: items 写入", dbItems.length === 4);
  const dbLocs = await db.locations.toArray();
  check("Dexie apply: locations 写入", dbLocs.length === 2);
  const dbOutfits = await db.outfits.toArray();
  check("Dexie apply: outfits 写入", dbOutfits.length === 2);

  console.error("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
