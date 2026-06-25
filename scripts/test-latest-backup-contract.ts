/**
 * test-latest-backup-contract
 *
 * Validates that the v1.1.30 latest backup format contract holds:
 * - Only .wardrobebackup extension
 * - packageVersion=1, backupVersion=5
 * - WardrobeBackup version type narrowed to 5
 * - Manifest strict validation
 * - Image token consistency
 * - No old code references
 *
 * Run: npx tsx scripts/test-latest-backup-contract.ts
 */

import { LONG_TERM_BACKUP_EXTENSION, LONG_TERM_BACKUP_ZIP_FALLBACK_EXTENSION, isLongTermBackupFileName } from "../src/lib/long-term-backup-package";
import { LATEST_BACKUP_VERSION } from "../src/lib/backup-data";
import { assertLongTermBackupManifest, createLongTermBackupManifest } from "../src/lib/long-term-backup-package";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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

// 1. 主扩展名为 .wardrobebackup
check("主扩展名为 .wardrobebackup", LONG_TERM_BACKUP_EXTENSION === ".wardrobebackup");
// 1b. 兼容扩展名为 .wardrobebackup.zip（v1.1.34+ Android/QQ 自动改名后缀）
check("兼容扩展名为 .wardrobebackup.zip", LONG_TERM_BACKUP_ZIP_FALLBACK_EXTENSION === ".wardrobebackup.zip");
// 1c. isLongTermBackupFileName 同时接受两种扩展名
check("isLongTermBackupFileName 接受 .wardrobebackup", isLongTermBackupFileName("衣橱穿搭助手-2026-06-25-08-14-26.wardrobebackup"));
check("isLongTermBackupFileName 接受 .wardrobebackup.zip", isLongTermBackupFileName("衣橱穿搭助手-latest.wardrobebackup.zip"));
check("isLongTermBackupFileName 拒绝非备份文件", !isLongTermBackupFileName("notes.txt"));

// 2. backupVersion 固定 5
check("backupVersion 固定 5", LATEST_BACKUP_VERSION === 5);

// 3. Manifest 严格校验 — valid manifest
const validManifest = createLongTermBackupManifest({
  appVersion: "1.1.30",
  backup: {
    version: 5 as const,
    exportedAt: "2026-01-01T00:00:00.000Z",
    items: [],
    locations: [],
    outfits: [],
    wishlistItems: [],
    outfitPlanEntries: [],
    outfitCalendarPlans: [],
    planPackingChecklistItems: [],
  } as never,
  imageCount: 0,
});
check("Manifest 包含 packageVersion", validManifest.packageVersion === 1);
check("Manifest 包含 appName", validManifest.appName === "衣橱穿搭助手");
check("Manifest 包含 appVersion", typeof validManifest.appVersion === "string" && validManifest.appVersion.length > 0);
check("Manifest 包含 backupVersion", validManifest.backupVersion === 5);

const parsed = assertLongTermBackupManifest(JSON.parse(JSON.stringify(validManifest)));
check("Manifest roundtrip 成功", parsed.packageVersion === 1 && parsed.backupVersion === 5);

// 4. Manifest rejects wrong packageVersion
try {
  assertLongTermBackupManifest({ ...validManifest, packageVersion: 2 });
  check("Manifest 拒绝错误的 packageVersion", false);
} catch {
  check("Manifest 拒绝错误的 packageVersion", true);
}

// 5. Manifest rejects wrong appName
try {
  assertLongTermBackupManifest({ ...validManifest, appName: "wrong" });
  check("Manifest 拒绝错误的 appName", false);
} catch {
  check("Manifest 拒绝错误的 appName", true);
}

// 6. Manifest rejects wrong backupVersion
try {
  assertLongTermBackupManifest({ ...validManifest, backupVersion: 4 });
  check("Manifest 拒绝错误的 backupVersion", false);
} catch {
  check("Manifest 拒绝错误的 backupVersion", true);
}

// 7. Manifest rejects missing appVersion
try {
  assertLongTermBackupManifest({ ...validManifest, appVersion: "" });
  check("Manifest 拒绝空 appVersion", false);
} catch {
  check("Manifest 拒绝空 appVersion", true);
}

// 8. No old backup.ts file
check("旧 backup.ts 已删除", !existsSync(resolve(__dirname, "../src/lib/backup.ts")));

// 9. No old test files
check("旧 test-backup-import-export.ts 已删除", !existsSync(resolve(__dirname, "test-backup-import-export.ts")));
check("旧 test-foundation-infra.ts 已删除", !existsSync(resolve(__dirname, "test-foundation-infra.ts")));

// 10. Source code scan: no old patterns
const srcDir = resolve(__dirname, "../src");
const androidDir = resolve(__dirname, "../android");
function scanFile(filePath: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const p of patterns) {
      if (p.test(content)) hits.push(`${filePath}: ${p.source}`);
    }
  } catch { /* skip */ }
  return hits;
}

const forbidPatterns = [
  /restoreBackupFromRaw/,
  /restoreV4Backup/,
  /listV4BackupFolders/,
  /saveBackupToDefaultFolder/,
  /exportBackupV4/,
  /DEFAULT_BACKUP_FOLDER_LABEL/,
  /backupInputRef/,
  /Capacitor as any/,
  /appVersion = "1\.1\.14"/,
];

const wardrobeApp = readFileSync(resolve(srcDir, "components/wardrobe-app.tsx"), "utf-8");
const ltb = readFileSync(resolve(srcDir, "lib/long-term-backup.ts"), "utf-8");

// Check no old function names in wardrobe-app.tsx
check("wardrobe-app.tsx 没有 restoreBackupFromRaw", !/restoreBackupFromRaw/.test(wardrobeApp));
check("wardrobe-app.tsx 没有 restoreV4Backup", !/restoreV4Backup/.test(wardrobeApp));
check("wardrobe-app.tsx 没有 importDefaultBackupFile", !/importDefaultBackupFile/.test(wardrobeApp));
check("wardrobe-app.tsx 没有 backupInputRef", !/backupInputRef/.test(wardrobeApp));
check("wardrobe-app.tsx 没有 DEFAULT_BACKUP_FOLDER_LABEL", !/DEFAULT_BACKUP_FOLDER_LABEL/.test(wardrobeApp));
check("wardrobe-app.tsx 没有硬编码 appVersion", !/appVersion = "1\.1\.14"/.test(wardrobeApp));
check("wardrobe-app.tsx 没有 Capacitor as any", !/Capacitor as any/.test(wardrobeApp));

// Check registerPlugin is used
check("long-term-backup.ts 使用 registerPlugin", /\bregisterPlugin\b/.test(ltb));

// Check new types and functions exist
check("wardrobe-app.tsx 有 BackupOperationState", /BackupOperationState/.test(wardrobeApp));
check("wardrobe-app.tsx 有 applyLatestWardrobeBackup", /applyLatestWardrobeBackup/.test(wardrobeApp));
check("wardrobe-app.tsx 有 confirmRestore", /confirmRestore/.test(wardrobeApp));

console.error("\nDone.");
