// P0: Android backup export success but "restore from default folder" fails - source assertions
// Updated for v1.1.13 long-term backup system
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const backup = readFileSync(join(root, "src/lib/backup.ts"), "utf8");
const wardrobeApp = readFileSync(join(root, "src/components/wardrobe-app.tsx"), "utf8");
const ltb = readFileSync(join(root, "src/lib/long-term-backup.ts"), "utf8");
const plugin = readFileSync(join(root, "android/app/src/main/java/com/wardrobe/outfit/LongTermBackupPlugin.java"), "utf8");

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== backup.ts listV4BackupFolders logic assertions (retained for backward compatibility) ===");

// 1. listV4BackupFolders does NOT have entry.type !== "directory" as pre-condition skip
check("listV4BackupFolders does not contain entry.type !== directory pre-check",
  !/for\s*\(\s*const\s+entry\s+of\s+result\.files\s*\)\s*\{[\s\S]*?if\s*\(\s*entry\.type\s*!==\s*["']directory["']\s*\)\s*continue/.test(backup),
  "still contains entry.type !== directory pre-check skip");

// 2. listV4BackupFolders probes backup-* by directly reading metadata.json
check("listV4BackupFolders uses entry.name.startsWith(backup-) for initial filter",
  /if\s*\(\s*!entry\.name\.startsWith\s*\(\s*["']backup-["']\s*\)\s*\)\s*continue/.test(backup));
check("listV4BackupFolders directly reads metadata.json for probing",
  /\$\{DEFAULT_BACKUP_FOLDER\}\/\$\{entry\.name\}\/\$\{BACKUP_V4_METADATA\}/.test(backup));

// 3. listV4BackupFolders skips on read failure (try/catch)
check("listV4BackupFolders catches and skips on read failure",
  /for\s*\(\s*const\s+entry\s+of[\s\S]*?catch\s*\{[\s\S]*?\/\/.*skip/.test(backup));

console.log("\n=== New long-term backup system assertions ===");

// 4. Settings page shows new backup UI
check("Settings page shows 数据备份与恢复",
  /数据备份与恢复/.test(wardrobeApp));

// 5. Settings page shows 导出到默认长期备份目录
check("Settings page shows 导出到默认长期备份目录",
  /导出到默认长期备份目录/.test(wardrobeApp));

// 6. Settings page shows 从默认长期备份恢复
check("Settings page shows 从默认长期备份恢复",
  /从默认长期备份恢复/.test(wardrobeApp));

// 7. Settings page shows 高级恢复旧版备份
check("Settings page shows 高级恢复旧版备份",
  /高级恢复旧版备份/.test(wardrobeApp));

console.log("\n=== Old backup UI removed from main section ===");

// 8. Main backup section does NOT show 应用内备份
check("Main backup section does NOT show 应用内备份",
  !/应用内备份/.test(wardrobeApp.split("高级恢复旧版备份")[0]));

// 9. Main backup section does NOT show 默认备份文件夹
check("Main backup section does NOT show 默认备份文件夹",
  wardrobeApp.split("高级恢复旧版备份")[0].indexOf("默认备份文件夹") === -1);

// 10. Main backup section does NOT show Documents/WardrobeBackups
check("Main backup section does NOT show Documents/WardrobeBackups",
  wardrobeApp.split("高级恢复旧版备份")[0].indexOf("Documents/WardrobeBackups") === -1);

// 11. Main backup section does NOT show 从默认目录恢复
check("Main backup section does NOT show 从默认目录恢复",
  wardrobeApp.split("高级恢复旧版备份")[0].indexOf("从默认目录恢复") === -1);

console.log("\n=== Long-term backup functions in wardrobe-app.tsx ===");

// 12. exportBackup calls exportLongTermBackupToDefault
check("exportBackup calls exportLongTermBackupToDefault",
  /exportLongTermBackupToDefault/.test(wardrobeApp));

// 13. openDefaultBackupFolder calls listDefaultLongTermBackups
check("openDefaultBackupFolder calls listDefaultLongTermBackups",
  /await\s+listDefaultLongTermBackups\s*\(/.test(wardrobeApp));

// 14. openDefaultBackupFolder does NOT call listV4BackupFolders (new system)
const openIdx = wardrobeApp.indexOf("async function openDefaultBackupFolder()");
const openSection = wardrobeApp.substring(openIdx, openIdx + 2000);
check("openDefaultBackupFolder does NOT call listV4BackupFolders",
  !/listV4BackupFolders/.test(openSection));

// 15. openDefaultBackupFolder does NOT call listDefaultBackupFiles (old system)
check("openDefaultBackupFolder does NOT call listDefaultBackupFiles",
  !/listDefaultBackupFiles/.test(openSection));

console.log("\n=== restoreBackupFromRaw still handles metadata.json ===");

// 16. restoreBackupFromRaw checks sourceName === metadata.json
check("restoreBackupFromRaw checks sourceName === metadata.json",
  /sourceName\s*===\s*["']metadata\.json["']/.test(wardrobeApp));

// 17. metadata.json import warning mentions .wardrobebackup
check("metadata.json warning mentions .wardrobebackup",
  /请选择\s*\.wardrobebackup/.test(wardrobeApp));

console.log("\n=== BackupDialogState updated ===");

// 18. BackupDialogState includes ltb_export
check("BackupDialogState includes ltb_export",
  /kind:\s*"ltb_export"/.test(wardrobeApp));

// 19. BackupDialogState includes ltb_scan
check("BackupDialogState includes ltb_scan",
  /kind:\s*"ltb_scan"/.test(wardrobeApp));

// 20. BackupDialogState includes ltb_confirm
check("BackupDialogState includes ltb_confirm",
  /kind:\s*"ltb_confirm"/.test(wardrobeApp));

console.log("\n=== Long-term native restore integration ===");

// 21. Native listDefaultBackups returns JSArray files
check("LongTermBackupPlugin listDefaultBackups uses JSArray files",
  /JSArray\s+filesArray\s*=\s*new\s+JSArray\s*\(\s*\)/.test(plugin));

// 22. Native listDefaultBackups returns files key
check("LongTermBackupPlugin listDefaultBackups returns files key",
  /result\.put\(\s*"files"\s*,\s*filesArray\s*\)/.test(plugin));

// 23. Native listDefaultBackups does not key by filename
check("LongTermBackupPlugin listDefaultBackups does not key by filename",
  !/filesArray\.put\(\s*file\.getName\(\)\s*,/.test(plugin));

// 24. Native openPickedBackup uses system picker
check("LongTermBackupPlugin openPickedBackup uses ACTION_OPEN_DOCUMENT",
  /Intent\.ACTION_OPEN_DOCUMENT/.test(plugin));

// 25. Native openPickedBackup no longer fixed rejects
check("LongTermBackupPlugin openPickedBackup no longer fixed rejects",
  !/Use Capacitor Filesystem plugin to pick file/.test(plugin));

// 26. Native Save As uses system create document
check("LongTermBackupPlugin commitSaveAsExport uses ACTION_CREATE_DOCUMENT",
  /Intent\.ACTION_CREATE_DOCUMENT/.test(plugin));

// 27. Frontend listDefaultLongTermBackups supports files array and object
check("listDefaultLongTermBackups supports files array/object",
  /const rawFiles = result\.files[\s\S]*Array\.isArray\(rawFiles\)[\s\S]*Object\.values\(rawFiles\)/.test(ltb));

// 28. Web fallback message is explicit
check("Web fallback default restore message is explicit",
  /浏览器无法读取 Android 默认长期备份目录，请在 Android 真机验证/.test(ltb) && /浏览器无法读取 Android 默认长期备份目录，请在 Android 真机验证/.test(wardrobeApp));

// 29. Browser debug export is not described as Android default success
check("Browser fallback export message is debug-only",
  /已下载浏览器调试备份文件。浏览器不能验证 Android 默认长期备份目录。/.test(wardrobeApp));

// === v1.1.16-dev commit2 §4.5 additional assertions ===

console.log("\n=== commit2 §4.4.1: Native fallback throws (not WEB_DEBUG_DOWNLOAD success) ===");

// 30. ltb.ts has assertNativeLongTermBackupAvailable
check("ltb.ts has assertNativeLongTermBackupAvailable",
  /export\s+function\s+assertNativeLongTermBackupAvailable/.test(ltb));

// 31. ltb.ts has the fixed missing-plugin error message
check("ltb.ts has fixed missing-plugin error message",
  /Android 长期备份插件未注册，无法导出。请重新同步并打包 APK。/.test(ltb));

// 32. ltb.ts has the fixed missing-method error message
check("ltb.ts has fixed missing-method error message",
  /Android 长期备份插件方法缺失，无法完成长期备份。/.test(ltb));

// 33. wardrobe-app.tsx no longer contains WEB_DEBUG_DOWNLOAD magic value
check("wardrobe-app.tsx no longer references WEB_DEBUG_DOWNLOAD",
  !/WEB_DEBUG_DOWNLOAD/.test(wardrobeApp));

console.log("\n=== commit2 §4.4.2: exportBackup no longer shows fallback text on Native success ===");

// 34. wardrobe-app.tsx Native success shows 保存位置 / 衣物件 / 套装 / 种草 / 图片
check("Native export success contains 保存位置", /保存位置：Download\/衣橱穿搭助手备份/.test(wardrobeApp));
check("Native export success contains 衣物件数", /衣物：\$\{itemCount\}\s*件/.test(wardrobeApp));
check("Native export success contains 套装数", /套装：\$\{outfitCount\}\s*套/.test(wardrobeApp));
check("Native export success contains 种草数", /种草：\$\{wishlistCount\}\s*件/.test(wardrobeApp));
check("Native export success contains 图片数", /图片：\$\{imageCount\}\s*张/.test(wardrobeApp));

// 35. Main backup flow no longer has fallback / JSON / ZIP verification text
const mainBackupFlow2 = wardrobeApp.split("高级恢复旧版备份")[0];
check("Main backup flow has no JSON 调试导出", !/JSON 调试导出/.test(mainBackupFlow2));
check("Main backup flow has no ZIP 包验证", !/ZIP 包验证/.test(mainBackupFlow2));

console.log("\n=== commit2 §4.4.3: default restore list (latest sorted first, empty text) ===");

// 36. listDefaultLongTermBackups supports array files
check("listDefaultLongTermBackups supports { files: [...] }",
  /const rawFiles = result\.files[\s\S]*?Array\.isArray\(rawFiles\)[\s\S]*?Object\.values\(rawFiles\)/.test(ltb));

// 37. Empty list text contains .wardrobebackup
check("Empty list text contains .wardrobebackup",
  /默认长期备份目录中还没有\s*\.wardrobebackup\s*文件/.test(wardrobeApp));

// 38. sortLongTermBackupFiles puts latest first
const ltbPkg = readFileSync(join(root, "src/lib/long-term-backup-package.ts"), "utf8");
check("sortLongTermBackupFiles puts latest first",
  /a\.isLatest[\s\S]*?return\s+-1/.test(ltbPkg));

console.log("\n=== commit2 §4.4.4: restore confirm uses real filename ===");

// 39. restoreLongTermBackupData accepts fileName parameter
const restoreIdx = wardrobeApp.indexOf("async function restoreLongTermBackupData(");
const restoreSection = wardrobeApp.substring(restoreIdx, restoreIdx + 1500);
check("restoreLongTermBackupData accepts (backup, fileName)",
  /async function restoreLongTermBackupData\(\s*backup:\s*WardrobeBackup\s*,\s*fileName:\s*string/.test(restoreSection));

// 40. previewData.fileName uses fileName argument (not hard-coded latest)
check("previewData.fileName uses fileName argument",
  /previewData:\s*\{[\s\S]*?fileName:\s*fileName/.test(restoreSection));

console.log("\n=== commit2 §4.4.5: plugin logs only status ===");

// 41. Plugin Logger.error calls pass null (no exception payload)
const loggerErrorLines = plugin.match(/Logger\.error\([^;]*\);/g) ?? [];
check("Plugin Logger.error calls pass null (no payload)",
  loggerErrorLines.length >= 10 && loggerErrorLines.every((line) => /Logger\.error\([^,]+,\s*null\s*\)/.test(line)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
