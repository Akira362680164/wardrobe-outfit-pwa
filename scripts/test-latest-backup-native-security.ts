/**
 * test-latest-backup-native-security
 *
 * Static checks for Android native security requirements.
 * Does NOT run JVM tests — validates source code patterns.
 *
 * Run: npx tsx scripts/test-latest-backup-native-security.ts
 */

import { readFileSync } from "fs";
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

const pluginPath = resolve(__dirname, "../android/app/src/main/java/com/wardrobe/outfit/LongTermBackupPlugin.java");
const manifestPath = resolve(__dirname, "../android/app/src/main/AndroidManifest.xml");

const plugin = readFileSync(pluginPath, "utf-8");
const manifest = readFileSync(manifestPath, "utf-8");

// 1. API 29+ 使用 MediaStore.Downloads
check("使用 MediaStore.Downloads", /MediaStore\.Downloads/.test(plugin));

// 2. 使用 RELATIVE_PATH
check("使用 RELATIVE_PATH", /RELATIVE_PATH/.test(plugin));

// 3. 使用 IS_PENDING
check("使用 IS_PENDING", /IS_PENDING/.test(plugin));

// 4. 权限带 maxSdkVersion=28
check("READ_EXTERNAL_STORAGE maxSdkVersion=28", /READ_EXTERNAL_STORAGE.*maxSdkVersion="28"/.test(manifest) || /maxSdkVersion="28".*READ_EXTERNAL_STORAGE/.test(manifest));
check("WRITE_EXTERNAL_STORAGE maxSdkVersion=28", /WRITE_EXTERNAL_STORAGE.*maxSdkVersion="28"/.test(manifest) || /maxSdkVersion="28".*WRITE_EXTERNAL_STORAGE/.test(manifest));

// 5. 仍保留 ACTION_CREATE_DOCUMENT
check("保留 ACTION_CREATE_DOCUMENT", /ACTION_CREATE_DOCUMENT/.test(plugin));

// 6. 仍保留 ACTION_OPEN_DOCUMENT
check("保留 ACTION_OPEN_DOCUMENT", /ACTION_OPEN_DOCUMENT/.test(plugin));

// 7. canonical path 防 Zip Slip
check("canonical path 防 Zip Slip", /getCanonicalPath|canonicalPath|toRealPath/.test(plugin));

// 8. 条目白名单 (ALLOWED_ENTRY or similar)
check("条目白名单存在", /ALLOWED|ENTRY_WHITELIST|isAllowedEntry|validEntry/i.test(plugin));

// 9. 条目数限制
check("条目数限制", /MAX_ENTRY/.test(plugin) || /maxEntry/i.test(plugin));

// 10. 单文件大小限制
check("单文件大小限制", /MAX_MANIFEST|MAX_METADATA|MAX_IMAGE/.test(plugin));

// 11. 总解压大小限制
check("总解压大小限制", /MAX_TOTAL/.test(plugin));

// 12. 临时目录清理 (cleanup or delete temp)
check("临时目录清理", /cleanup|delete.*temp|tempDir.*delete|closeReadSession/i.test(plugin));

console.error("\nDone.");
