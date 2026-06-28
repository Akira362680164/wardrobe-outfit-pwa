#!/usr/bin/env node
// scripts/patch-capacitor-logs.mjs
// 修复 P0: Capacitor native-bridge.js 在 logcat 中输出完整 access token 和 refresh token。
// 直接替换所有 logging calls 为 safe messages，不传递敏感数据。

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const BRIDGE_PATHS = [
  join(root, "node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js"),
  join(root, "node_modules/@capacitor/android/capacitor/build/intermediates/assets/release/mergeReleaseAssets/native-bridge.js"),
  join(root, "node_modules/@capacitor/android/capacitor/build/intermediates/assets/debug/mergeDebugAssets/native-bridge.js"),
  join(root, "android/app/build/intermediates/assets/release/mergeReleaseAssets/native-bridge.js"),
  join(root, "android/app/build/intermediates/assets/debug/mergeDebugAssets/native-bridge.js"),
];

function patchLogging(content) {
  let changed = false;

  // 1. c.dir(...) for result.data — all variants
  //    Original:  c.dir(JSON.stringify(result.data))
  //    Patched:   c.dir(__redactSensitive(JSON.stringify(result.data)))
  if (content.includes("c.dir(JSON.stringify(result.data))") ||
      content.includes("c.dir(__redactSensitive(JSON.stringify(result.data)))")) {
    content = content.replace(
      /c\.dir\(__redactSensitive\(JSON\.stringify\(result\.data\)\)\)/g,
      "c.log('%cresult data redacted')",
    );
    content = content.replace(
      /c\.dir\(JSON\.stringify\(result\.data\)\)/g,
      "c.log('%cresult data redacted')",
    );
    changed = true;
  }

  // 2. c.log('LOG FROM NATIVE', ...) — all variants
  if (content.includes("c.log('LOG FROM NATIVE'")) {
    content = content.replace(
      /c\.log\('LOG FROM NATIVE', __redactSensitive\(result\.data\)\)/g,
      "c.log('LOG FROM NATIVE', '[REDACTED]')",
    );
    content = content.replace(
      /c\.log\('LOG FROM NATIVE', result\.data\)/g,
      "c.log('LOG FROM NATIVE', '[REDACTED]')",
    );
    changed = true;
  }

  // 3. c.log('LOG TO NATIVE: ', call)
  if (content.includes("c.log('LOG TO NATIVE: ', call)")) {
    content = content.replace(
      /c\.log\('LOG TO NATIVE: ', call\)/g,
      "c.log('LOG TO NATIVE: ', '[REDACTED]')",
    );
    changed = true;
  }

  // 4. c.dir(call) — in isFullConsole logToNative, logs full call object
  //    Only match the one inside createLogToNative (which is indented)
  if (content.includes("c.dir(call);")) {
    content = content.replace(
      /([ \t]+)c\.dir\(call\);/g,
      "$1c.log('%cnative call redacted');",
    );
    changed = true;
  }

  // The __redactSensitive function is unused now; remove it to keep clean
  if (content.includes("var __redactSensitive")) {
    content = content.replace(
      /var __redactSensitive = \(function\(\) \{[\s\S]*?\}\)\(\);\n*/,
      "",
    );
    changed = true;
  }

  return { content, changed };
}

let patched = 0;
for (const bridgePath of BRIDGE_PATHS) {
  try {
    let content = readFileSync(bridgePath, "utf8");
    const { content: newContent, changed } = patchLogging(content);

    if (changed) {
      writeFileSync(bridgePath, newContent, "utf8");
      patched++;
      console.log(`  ✅ Patched: ${bridgePath}`);
    } else {
      console.log(`  ⏭️  Already clean: ${bridgePath}`);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`  ⏭️  Skipped (not found): ${bridgePath}`);
    } else {
      console.error(`  ❌ Failed: ${bridgePath}:`, err.message);
    }
  }
}

if (patched > 0) {
  console.log(`\n🔒 Capacitor 日志脱敏完成 (${patched} files)`);
} else {
  console.log("\n⚠️  未找到 native-bridge.js，请先运行 cap sync android");
}
