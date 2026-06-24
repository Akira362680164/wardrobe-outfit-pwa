// Long-term backup system assertions
import { strict as assert } from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== Long-term backup file existence ===");

// 1. src/lib/long-term-backup.ts exists
check("src/lib/long-term-backup.ts exists",
  existsSync(join(root, "src/lib/long-term-backup.ts")));

// 2. src/lib/long-term-backup-package.ts exists
check("src/lib/long-term-backup-package.ts exists",
  existsSync(join(root, "src/lib/long-term-backup-package.ts")));

// 3. LongTermBackupPlugin.java exists
check("LongTermBackupPlugin.java exists",
  existsSync(join(root, "android/app/src/main/java/com/wardrobe/outfit/LongTermBackupPlugin.java")));

console.log("\n=== MainActivity.java plugin registration ===");

const mainActivity = readFileSync(join(root, "android/app/src/main/java/com/wardrobe/outfit/MainActivity.java"), "utf8");

// 4. MainActivity registers LongTermBackupPlugin.class
check("MainActivity.java registers LongTermBackupPlugin.class",
  /registerPlugin\s*\(\s*LongTermBackupPlugin\.class\s*\)/.test(mainActivity));

console.log("\n=== proguard-rules.pro ===");

const proguard = readFileSync(join(root, "android/app/proguard-rules.pro"), "utf8");

// 5. proguard keeps LongTermBackupPlugin
check("proguard-rules.pro keeps LongTermBackupPlugin",
  /-keep\s+class\s+com\.wardrobe\.outfit\.LongTermBackupPlugin\s+\{\s*\*\s*;\s*\}/.test(proguard));

console.log("\n=== long-term-backup-package.ts constants ===");

const ltbPkg = readFileSync(join(root, "src/lib/long-term-backup-package.ts"), "utf8");

// 6. LONG_TERM_BACKUP_EXTENSION = ".wardrobebackup"
check("LONG_TERM_BACKUP_EXTENSION = \".wardrobebackup\"",
  /export\s+const\s+LONG_TERM_BACKUP_EXTENSION\s*=\s*["']\.wardrobebackup["']/.test(ltbPkg));

// 7. LONG_TERM_BACKUP_DIR_LABEL
check("LONG_TERM_BACKUP_DIR_LABEL = \"Download/衣橱穿搭助手备份\"",
  /export\s+const\s+LONG_TERM_BACKUP_DIR_LABEL\s*=\s*["']Download\/衣橱穿搭助手备份["']/.test(ltbPkg));

// 8. LONG_TERM_BACKUP_LATEST_FILE_NAME
check("LONG_TERM_BACKUP_LATEST_FILE_NAME",
  /export\s+const\s+LONG_TERM_BACKUP_LATEST_FILE_NAME\s*=\s*["']衣橱穿搭助手-latest\.wardrobebackup["']/.test(ltbPkg));

// 9. LONG_TERM_BACKUP_MANIFEST_FILE
check("LONG_TERM_BACKUP_MANIFEST_FILE = \"manifest.json\"",
  /export\s+const\s+LONG_TERM_BACKUP_MANIFEST_FILE\s*=\s*["']manifest\.json["']/.test(ltbPkg));

// 10. LONG_TERM_BACKUP_METADATA_FILE
check("LONG_TERM_BACKUP_METADATA_FILE = \"metadata.json\"",
  /export\s+const\s+LONG_TERM_BACKUP_METADATA_FILE\s*=\s*["']metadata\.json["']/.test(ltbPkg));

// 11. LONG_TERM_BACKUP_IMAGE_DIR
check("LONG_TERM_BACKUP_IMAGE_DIR = \"images\"",
  /export\s+const\s+LONG_TERM_BACKUP_IMAGE_DIR\s*=\s*["']images["']/.test(ltbPkg));

console.log("\n=== long-term-backup.ts exports ===");

const ltb = readFileSync(join(root, "src/lib/long-term-backup.ts"), "utf8");

// 12. exportLongTermBackupToDefault exists
check("exportLongTermBackupToDefault function exists",
  /export\s+async\s+function\s+exportLongTermBackupToDefault/.test(ltb));

// 13. exportLongTermBackupSaveAs exists
check("exportLongTermBackupSaveAs function exists",
  /export\s+async\s+function\s+exportLongTermBackupSaveAs/.test(ltb));

// 14. listDefaultLongTermBackups exists
check("listDefaultLongTermBackups function exists",
  /export\s+async\s+function\s+listDefaultLongTermBackups/.test(ltb));

// 15. restoreDefaultLongTermBackup exists
check("restoreDefaultLongTermBackup function exists",
  /export\s+async\s+function\s+restoreDefaultLongTermBackup/.test(ltb));

// 16. restorePickedLongTermBackup exists
check("restorePickedLongTermBackup function exists",
  /export\s+async\s+function\s+restorePickedLongTermBackup/.test(ltb));

// 17. DEFAULT_BACKUP_READ_REQUIRES_PICKER exported
check("DEFAULT_BACKUP_READ_REQUIRES_PICKER exported",
  /export\s+const\s+DEFAULT_BACKUP_READ_REQUIRES_PICKER/.test(ltb));

// 18. buildLongTermBackupEntries exists
check("buildLongTermBackupEntries function exists",
  /export\s+async\s+function\s+buildLongTermBackupEntries/.test(ltb));

// 19. restoreLongTermBackupFromPackage exists
check("restoreLongTermBackupFromPackage function exists",
  /export\s+async\s+function\s+restoreLongTermBackupFromPackage/.test(ltb));

console.log("\n=== wardrobe-app.tsx backup UI ===");

const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");

// 20. Settings page shows "数据备份与恢复"
check("Settings page shows \"数据备份与恢复\"",
  /数据备份与恢复/.test(wardrobeApp));

// 21. Settings page shows "导出到默认长期备份目录"
check("Settings page shows \"导出到默认长期备份目录\"",
  /导出到默认长期备份目录/.test(wardrobeApp));

// 22. Settings page shows "从默认长期备份恢复"
check("Settings page shows \"从默认长期备份恢复\"",
  /从默认长期备份恢复/.test(wardrobeApp));

// 23. Settings page shows LONG_TERM_BACKUP_DIR_LABEL text
check("Settings page shows \"Download/衣橱穿搭助手备份\"",
  /Download\/衣橱穿搭助手备份/.test(wardrobeApp));

// 24. Settings page shows "另存为..."
check("Settings page shows \"另存为...\"",
  /另存为\.\.\./.test(wardrobeApp));

// 25. Settings page shows "从其他位置选择备份..."
check("Settings page shows \"从其他位置选择备份...\"",
  /从其他位置选择备份\.\.\./.test(wardrobeApp));

// 26. Settings page shows "高级恢复旧版备份"
check("Settings page shows \"高级恢复旧版备份\"",
  /高级恢复旧版备份/.test(wardrobeApp));

console.log("\n=== wardrobe-app.tsx forbidden strings ===");

// 27. Main backup section does NOT show "应用内备份" in main flow
check("Main backup section does NOT show \"应用内备份\" in main flow",
  !/应用内备份/.test(wardrobeApp.split("高级恢复旧版备份")[0]));

// 28. Main backup section does NOT show "默认备份文件夹" in main flow
check("Main backup section does NOT show \"默认备份文件夹\" in main flow",
  wardrobeApp.split("高级恢复旧版备份")[0].indexOf("默认备份文件夹") === -1);

// 29. Main backup section does NOT show "从默认目录恢复" in main flow
check("Main backup section does NOT show \"从默认目录恢复\" in main flow",
  wardrobeApp.split("高级恢复旧版备份")[0].indexOf("从默认目录恢复") === -1);

// 30. Main backup section does NOT show "Documents/WardrobeBackups" in main flow
check("Main backup section does NOT show \"Documents/WardrobeBackups\" in main flow",
  wardrobeApp.split("高级恢复旧版备份")[0].indexOf("Documents/WardrobeBackups") === -1);

console.log("\n=== BackupDialogState kind values ===");

// 31. BackupDialogState includes "ltb_export"
check("BackupDialogState kind includes \"ltb_export\"",
  /kind:\s*"ltb_export"/.test(wardrobeApp));

// 32. BackupDialogState includes "ltb_scan"
check("BackupDialogState kind includes \"ltb_scan\"",
  /kind:\s*"ltb_scan"/.test(wardrobeApp));

// 33. BackupDialogState includes "ltb_confirm"
check("BackupDialogState kind includes \"ltb_confirm\"",
  /kind:\s*"ltb_confirm"/.test(wardrobeApp));

console.log("\n=== exportBackup function ===");

// 34. exportBackup function calls exportLongTermBackupToDefault
check("exportBackup calls exportLongTermBackupToDefault",
  /exportLongTermBackupToDefault[\s\S]*?\{/.test(wardrobeApp));

// 35. exportBackup function does NOT call saveBackupToDefaultFolder
const exportIdx = wardrobeApp.indexOf("async function exportBackup()");
const nextFuncIdx = wardrobeApp.indexOf("async function openDefaultBackupFolder()");
const exportSection = wardrobeApp.substring(exportIdx, nextFuncIdx > 0 ? nextFuncIdx : exportIdx + 2000);
check("exportBackup does NOT call saveBackupToDefaultFolder",
  !/saveBackupToDefaultFolder/.test(exportSection));

// 36. openDefaultBackupFolder function calls listDefaultLongTermBackups
check("openDefaultBackupFolder calls listDefaultLongTermBackups",
  /await\s+listDefaultLongTermBackups\s*\(/.test(wardrobeApp));

console.log("\n=== LongTermBackupPlugin.java content ===");

const plugin = readFileSync(join(root, "android/app/src/main/java/com/wardrobe/outfit/LongTermBackupPlugin.java"), "utf8");

// 37. Plugin uses @CapacitorPlugin(name = "LongTermBackup")
check("Plugin uses @CapacitorPlugin(name = \"LongTermBackup\")",
  /@CapacitorPlugin\s*\(\s*name\s*=\s*"LongTermBackup"\s*\)/.test(plugin));

// 38. Plugin uses ZipOutputStream
check("Plugin uses ZipOutputStream",
  /ZipOutputStream/.test(plugin));

// 39. Plugin uses ZipInputStream
check("Plugin uses ZipInputStream",
  /ZipInputStream/.test(plugin));

// 40. Plugin uses MediaStore
check("Plugin uses MediaStore",
  /MediaStore/.test(plugin));

// 41. Plugin does NOT use getExternalFilesDir as final save location
check("Plugin does NOT use getExternalFilesDir as final save location",
  !/getExternalFilesDir/.test(plugin));

// 42. Plugin does NOT request MANAGE_EXTERNAL_STORAGE
check("Plugin does NOT request MANAGE_EXTERNAL_STORAGE",
  !/MANAGE_EXTERNAL_STORAGE/.test(plugin));

// 43. Plugin includes DEFAULT_BACKUP_READ_REQUIRES_PICKER
check("Plugin includes DEFAULT_BACKUP_READ_REQUIRES_PICKER",
  /DEFAULT_BACKUP_READ_REQUIRES_PICKER/.test(plugin));

// 44. listDefaultBackups returns JSArray files
check("Plugin listDefaultBackups uses JSArray files",
  /JSArray\s+filesArray\s*=\s*new\s+JSArray\s*\(\s*\)/.test(plugin));

// 45. listDefaultBackups resolves files array under files key
check("Plugin listDefaultBackups returns files array",
  /result\.put\(\s*"files"\s*,\s*filesArray\s*\)/.test(plugin));

// 46. listDefaultBackups no longer uses filename as object key
check("Plugin listDefaultBackups does not key files by filename",
  !/filesArray\.put\(\s*file\.getName\(\)\s*,/.test(plugin));

// 47. openPickedBackup is implemented with ACTION_OPEN_DOCUMENT
check("Plugin openPickedBackup uses ACTION_OPEN_DOCUMENT",
  /Intent\.ACTION_OPEN_DOCUMENT/.test(plugin));

// 48. openPickedBackup is not fixed reject fallback
check("Plugin openPickedBackup is not fixed reject",
  !/Use Capacitor Filesystem plugin to pick file/.test(plugin));

// 49. commitSaveAsExport uses ACTION_CREATE_DOCUMENT
check("Plugin commitSaveAsExport uses ACTION_CREATE_DOCUMENT",
  /Intent\.ACTION_CREATE_DOCUMENT/.test(plugin));

// 50. Frontend listDefaultLongTermBackups supports array and object results
check("Frontend listDefaultLongTermBackups normalizes array/object files",
  /const rawFiles = result\.files[\s\S]*Array\.isArray\(rawFiles\)[\s\S]*Object\.values\(rawFiles\)/.test(ltb));

// 51. Web fallback default restore message is explicit
check("Web fallback default restore message asks for Android device validation",
  /浏览器无法读取 Android 默认长期备份目录，请在 Android 真机验证/.test(ltb) && /浏览器无法读取 Android 默认长期备份目录，请在 Android 真机验证/.test(wardrobeApp));

// 52. Web fallback export text is explicitly browser debug
check("Web fallback export text says browser debug backup",
  /已下载浏览器调试备份文件。浏览器不能验证 Android 默认长期备份目录。/.test(wardrobeApp));

console.log("\n=== getLongTermBackupTimestampFileName ===");

// 53. getLongTermBackupTimestampFileName produces .wardrobebackup extension
check("getLongTermBackupTimestampFileName produces .wardrobebackup extension",
  /\.wardrobebackup/.test(ltbPkg));

// 54. sortLongTermBackupFiles puts latest first
check("sortLongTermBackupFiles puts latest first",
  /a\.isLatest.*return\s+-1/.test(ltbPkg));

console.log("\n=== restoreBackupFromRaw error handling ===");

// 55. restoreBackupFromRaw checks for metadata.json
check("restoreBackupFromRaw checks sourceName === \"metadata.json\"",
  /sourceName\s*===\s*["']metadata\.json["']/.test(wardrobeApp));

// 56. Error message for wrong file type includes .wardrobebackup
check("Error message for wrong file includes .wardrobebackup",
  /请选择\s*\.wardrobebackup/.test(wardrobeApp));

// === v1.1.16-dev commit2 §4.4-4.5 assertions ===

console.log("\n=== Native fallback throws when plugin missing (commit2 §4.4.1) ===");

// 57. long-term-backup.ts has assertNativeLongTermBackupAvailable
check("long-term-backup.ts exports assertNativeLongTermBackupAvailable",
  /export\s+function\s+assertNativeLongTermBackupAvailable/.test(ltb));

// 58. LTB_NATIVE_PLUGIN_MISSING_MESSAGE is the fixed string
check("LTB_NATIVE_PLUGIN_MISSING_MESSAGE is fixed text",
  /Android 长期备份插件未注册，无法导出。请重新同步并打包 APK。/.test(ltb));

// 59. LTB_NATIVE_PLUGIN_METHOD_MISSING_MESSAGE is the fixed string
check("LTB_NATIVE_PLUGIN_METHOD_MISSING_MESSAGE is fixed text",
  /Android 长期备份插件方法缺失，无法完成长期备份。/.test(ltb));

// 60. exportLongTermBackupToDefault calls assertNativeLongTermBackupAvailable
check("exportLongTermBackupToDefault calls assertNativeLongTermBackupAvailable",
  /exportLongTermBackupToDefault[\s\S]*?assertNativeLongTermBackupAvailable\s*\(/.test(ltb));

// 61. listDefaultLongTermBackups calls assertNativeLongTermBackupAvailable
check("listDefaultLongTermBackups calls assertNativeLongTermBackupAvailable",
  /listDefaultLongTermBackups[\s\S]*?assertNativeLongTermBackupAvailable/.test(ltb));

console.log("\n=== exportLongTermBackupToDefault no longer returns WEB_DEBUG_DOWNLOAD success (commit2 §4.4.2) ===");

// 62. exportLongTermBackupToDefault no longer compares against WEB_DEBUG_DOWNLOAD string
const exportResultType = /export\s+interface\s+LongTermBackupExportResult[\s\S]*?imageCount:\s*number;\s*}/.test(ltb);
check("LongTermBackupExportResult interface is defined", exportResultType);
check("exportLongTermBackupToDefault result has webFallback flag",
  /export\s+interface\s+LongTermBackupExportResult[\s\S]*?webFallback:\s*boolean/.test(ltb));

// 63. Native success result in wardrobe-app.tsx shows new text labels
check("Native export success shows 保存位置",
  /保存位置：Download\/衣橱穿搭助手备份/.test(wardrobeApp));
check("Native export success shows 最新备份",
  /最新备份：衣橱穿搭助手-latest\.wardrobebackup/.test(wardrobeApp));
check("Native export success shows 衣物件数",
  /衣物：\$\{itemCount\}\s*件/.test(wardrobeApp));
check("Native export success shows 套装数",
  /套装：\$\{outfitCount\}\s*套/.test(wardrobeApp));
check("Native export success shows 种草数",
  /种草：\$\{wishlistCount\}\s*件/.test(wardrobeApp));
check("Native export success shows 图片数",
  /图片：\$\{imageCount\}\s*张/.test(wardrobeApp));

// 64. wardrobe-app.tsx no longer contains WEB_DEBUG_DOWNLOAD string
check("wardrobe-app.tsx no longer references WEB_DEBUG_DOWNLOAD",
  !/WEB_DEBUG_DOWNLOAD/.test(wardrobeApp));

// 65. wardrobe-app.tsx no longer mentions "JSON 调试导出" in user-facing main flow
const mainBackupFlow = wardrobeApp.split("高级恢复旧版备份")[0];
check("Main backup flow no longer mentions JSON 调试导出",
  !/JSON 调试导出/.test(mainBackupFlow));

// 66. wardrobe-app.tsx no longer mentions "ZIP 包验证" in user-facing main flow
check("Main backup flow no longer mentions ZIP 包验证",
  !/ZIP 包验证/.test(mainBackupFlow));

// 67. Browser fallback text in wardrobe-app.tsx is the fixed 调试 message
check("Browser fallback shows debug message with 不能验证",
  /已下载浏览器调试备份文件。浏览器不能验证 Android 默认长期备份目录。/.test(wardrobeApp));

console.log("\n=== Default restore directory / list (commit2 §4.4.3) ===");

// 68. ltb.ts listDefaultLongTermBackups supports array form
check("listDefaultLongTermBackups handles array form",
  /const rawFiles = result\.files[\s\S]*?Array\.isArray\(rawFiles\)/.test(ltb));

// 69. ltb.ts listDefaultLongTermBackups supports object form
check("listDefaultLongTermBackups handles object form via Object.values",
  /Object\.values\(rawFiles\)/.test(ltb));

// 70. sortLongTermBackupFiles puts latest first
check("sortLongTermBackupFiles in package puts latest first",
  /a\.isLatest[\s\S]*?return\s+-1/.test(ltbPkg));

// 71. Empty list text in wardrobe-app.tsx mentions .wardrobebackup
check("Empty list text mentions .wardrobebackup",
  /默认长期备份目录中还没有\s*\.wardrobebackup\s*文件/.test(wardrobeApp));

// 72. openDefaultBackupFolder distinguishes empty vs error paths
const openIdx2 = wardrobeApp.indexOf("async function openDefaultBackupFolder()");
const openSection2 = wardrobeApp.substring(openIdx2, openIdx2 + 2000);
check("openDefaultBackupFolder has separate catch block",
  /catch[\s\S]*?status:\s*"读取长期备份文件夹失败"|status:\s*"浏览器无法读取/.test(openSection2));

console.log("\n=== Restore confirm uses real filename (commit2 §4.4.4) ===");

// 73. restoreLongTermBackupData accepts a fileName parameter
const restoreFuncIdx = wardrobeApp.indexOf("async function restoreLongTermBackupData(");
const restoreSection = wardrobeApp.substring(restoreFuncIdx, restoreFuncIdx + 2000);
check("restoreLongTermBackupData accepts a fileName parameter",
  /async function restoreLongTermBackupData\(\s*backup:\s*WardrobeBackup\s*,\s*fileName:\s*string/.test(restoreSection));

// 74. previewData.fileName uses the passed fileName (not hard-coded latest)
check("previewData.fileName uses fileName argument",
  /previewData:\s*\{[\s\S]*?fileName:\s*fileName/.test(restoreSection));

// 75. restorePickedLongTermBackup is called destructured as { backup, fileName }
const pickIdx = wardrobeApp.indexOf("async function pickBackupFile()");
const pickSection = wardrobeApp.substring(pickIdx, pickIdx + 1000);
check("pickBackupFile destructures fileName from restorePickedLongTermBackup",
  /const\s*\{\s*backup\s*,\s*fileName\s*\}\s*=\s*await\s+restorePickedLongTermBackup/.test(pickSection));

// 76. There is a pickLtbFileFromList function for picking from ltbFiles list
check("pickLtbFileFromList function exists",
  /async function pickLtbFileFromList\(/.test(wardrobeApp));

// 77. ltb.ts restorePickedLongTermBackup returns fileName
check("ltb restorePickedLongTermBackup returns { backup, fileName }",
  /export\s+async\s+function\s+restorePickedLongTermBackup[\s\S]*?return\s*\{\s*backup\s*,\s*fileName\s*\}/.test(ltb));

// 78. ltb.ts restoreDefaultLongTermBackup returns fileName
check("ltb restoreDefaultLongTermBackup returns { backup, fileName }",
  /export\s+async\s+function\s+restoreDefaultLongTermBackup[\s\S]*?return\s*\{\s*backup\s*,\s*fileName\s*\}/.test(ltb));

console.log("\n=== Native plugin reads and writes the same directory (commit2 §4.4.3) ===");

// 79. Android plugin uses the same BACKUP_DIR_NAME for read and write
const commitDefaultIdx = plugin.indexOf("public void commitDefaultExport");
const listDefaultIdx = plugin.indexOf("public void listDefaultBackups");
const openDefaultIdx = plugin.indexOf("public void openDefaultBackup");
const commitDefaultSec = plugin.substring(commitDefaultIdx, commitDefaultIdx + 1200);
const listDefaultSec = plugin.substring(listDefaultIdx, listDefaultIdx + 1500);
const openDefaultSec = plugin.substring(openDefaultIdx, openDefaultIdx + 1500);
check("commitDefaultExport uses getBackupDirectory()", /getBackupDirectory\s*\(\s*\)/.test(commitDefaultSec));
check("listDefaultBackups uses getBackupDirectory()", /getBackupDirectory\s*\(\s*\)/.test(listDefaultSec));
check("openDefaultBackup uses getBackupDirectory()", /getBackupDirectory\s*\(\s*\)/.test(openDefaultSec));

// 80. commitDefaultExport writes both latest and timestamp files
check("commitDefaultExport writes latest file",
  /File\s+latestZip\s*=\s*new\s+File\s*\(\s*backupDir\s*,\s*latestFileName\s*\)/.test(plugin));
check("commitDefaultExport writes timestamp file",
  /File\s+timestampZip\s*=\s*new\s+File\s*\(\s*backupDir\s*,\s*timestampFileName\s*\)/.test(plugin));
check("commitDefaultExport creates both ZIPs",
  /createZipFromDirectory\s*\(\s*tempDir\s*,\s*latestZip\s*\)/.test(plugin) &&
  /createZipFromDirectory\s*\(\s*tempDir\s*,\s*timestampZip\s*\)/.test(plugin));

console.log("\n=== MainActivity plugin registration (commit2 §4.5 #8) ===");

// 81. MainActivity registers LongTermBackupPlugin (already covered above but duplicated per §4.5)
check("MainActivity registers LongTermBackupPlugin.class",
  /registerPlugin\s*\(\s*LongTermBackupPlugin\.class\s*\)/.test(mainActivity));

console.log("\n=== Plugin logs only status, no payload (commit2 §4.4.5) ===");

// 82. Plugin Logger.error calls do not pass the exception object (only label + class name)
const loggerErrorLines = plugin.match(/Logger\.error\([^;]*\);/g) ?? [];
const allStatusOnly = loggerErrorLines.every((line) => /Logger\.error\([^,]+,\s*null\s*\)/.test(line));
check("All plugin Logger.error calls pass null (no exception payload)", allStatusOnly && loggerErrorLines.length >= 10);

// 83. Plugin Logger.error labels include "failed" status words, no JSON / base64 / key strings
const allStatusLabels = loggerErrorLines.every((line) =>
  /failed/i.test(line) && !/"manifest\.json"/.test(line) && !/"metadata\.json"/.test(line) && !/"base64"/i.test(line) && !/"key"/i.test(line)
);
check("All plugin log labels are status words (no payload data)", allStatusLabels);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
