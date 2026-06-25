/**
 * test-real-user-zip-contract
 *
 * Validates that the user's real backup zip (衣橱穿搭助手-latest.wardrobebackup.zip
 * received from QQ/system auto-renamed) is accepted by the v1.1.34+ JS code on
 * the filename side, and that an example manifest and metadata are still parseable.
 *
 * This test does NOT depend on `adm-zip`; it instead validates acceptance through
 * `isLongTermBackupFileName` and direct string contracts.
 *
 * Run: npx tsx scripts/test-real-user-zip-contract.ts
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { isLongTermBackupFileName, assertLongTermBackupManifest } from "../src/lib/long-term-backup-package";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `: ${detail}` : ""}`); }
}

console.log("\n=== isLongTermBackupFileName accepts QQ/system auto-renamed files ===");

check("isLongTermBackupFileName accepts .wardrobebackup",
  isLongTermBackupFileName("衣橱穿搭助手-2026-06-25-08-14-26.wardrobebackup"));
check("isLongTermBackupFileName accepts .wardrobebackup.zip (QQ/系统自动改名)",
  isLongTermBackupFileName("衣橱穿搭助手-latest.wardrobebackup.zip"));
check("isLongTermBackupFileName accepts legacy latest alias .wardrobebackup",
  isLongTermBackupFileName("衣橱穿搭助手-latest.wardrobebackup"));
check("isLongTermBackupFileName rejects .zip alone",
  !isLongTermBackupFileName("random.zip"));
check("isLongTermBackupFileName rejects empty",
  !isLongTermBackupFileName(""));
check("isLongTermBackupFileName rejects .txt",
  !isLongTermBackupFileName("notes.txt"));

console.log("\n=== Real user backup zip integrity (unzip -t) ===");

const foundZip = "/Users/fangzheng/Library/Containers/com.tencent.qq/Data/Downloads/衣橱穿搭助手-latest.wardrobebackup.zip";

if (foundZip) {
  console.log(`  (testing real user backup: ${foundZip})`);
  check("user backup file exists at expected path", existsSync(foundZip));
  check("user backup file name passes isLongTermBackupFileName",
    isLongTermBackupFileName(basename(foundZip)));

  try {
    const out = execFileSync("/usr/bin/unzip", ["-t", foundZip], { encoding: "utf-8" });
    check("unzip -t reports no errors on user backup",
      /No errors detected/.test(out));
  } catch (e: any) {
    check("unzip -t reports no errors on user backup", false, e?.message ?? String(e));
  }

  // Verify the real manifest from the user's zip passes strict validation.
  try {
    const manifestText = execFileSync("/usr/bin/unzip", ["-p", foundZip, "manifest.json"], { encoding: "utf-8" });
    const manifest: unknown = JSON.parse(manifestText);
    const parsed = assertLongTermBackupManifest(manifest);
    check("real manifest with fileExtension .wardrobebackup passes strict validation",
      parsed.fileExtension === ".wardrobebackup" && parsed.imageCount === 15);
  } catch (e: any) {
    check("real manifest with fileExtension .wardrobebackup passes strict validation", false, e?.message);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
