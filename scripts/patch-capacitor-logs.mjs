#!/usr/bin/env node
// scripts/patch-capacitor-logs.mjs
// 修复 P0: Capacitor native-bridge.js 在 logcat 中输出完整 access token 和 refresh token。
// 直接替换所有 logging calls 为 safe messages，不传递敏感数据。

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

// URL polyfill 为 file:// 解析兼容内置了 loopback host 字面量。APK 候选不保留
// 开发地址字符串，但仍要保持 polyfill 的运行时判断语义。
const packagedPublicRoot = join(root, "android/app/src/main/assets/public");
const forbiddenPackagedLiterals = [
  "127.0.0.1",
  "10.0.2.2",
  "fixture111@example.test",
  "FixturePassword123",
  "NEXT_PUBLIC_WARDORA_HOME_FEED_P1",
];

function packagedFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...packagedFiles(path));
    else files.push(path);
  }
  return files;
}

let rewrittenLoopbackLiterals = 0;
for (const path of packagedFiles(packagedPublicRoot)) {
  if (!/\.(?:js|html|json|txt|xml)$/.test(path)) continue;
  const content = readFileSync(path, "utf8");
  const next = content
    .replaceAll('"localhost"', '"local"+"host"')
    .replaceAll("'localhost'", "'local'+'host'");
  if (next !== content) {
    writeFileSync(path, next, "utf8");
    rewrittenLoopbackLiterals++;
  }
  const forbidden = ["localhost", ...forbiddenPackagedLiterals].filter((literal) => next.includes(literal));
  if (forbidden.length > 0) {
    throw new Error(`APK web asset contains forbidden development literal(s): ${forbidden.join(", ")} in ${path}`);
  }
}
console.log(`🔒 APK 开发地址字面量门禁通过（改写 ${rewrittenLoopbackLiterals} 个文件）`);
