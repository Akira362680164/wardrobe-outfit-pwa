#!/usr/bin/env node
// scripts/validate-build.mjs
// P3-17: 构建前校验与构建后检查
//
// 用法：
//   node scripts/validate-build.mjs pre   — 构建前校验
//   node scripts/validate-build.mjs post  — 构建后 APK 信息输出

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readEnv() {
  const envPath = join(root, ".env");
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  }
  return env;
}

function getPackageJson() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

function getCommitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function parseSemver(version) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function pre() {
  const pkg = getPackageJson();
  const [major, minor, patch] = parseSemver(pkg.version);
  const env = readEnv();
  const version = pkg.version;
  const isTest = version.includes("-test");
  const apiUrl = env.NEXT_PUBLIC_WARDROBE_API_BASE_URL ?? "";

  let ok = true;

  // v2.0.1/v2.0.2: 允许临时 HTTP + 云开关 ON 构建（域名 HTTPS 备案中）
  const isHttpAllowed = (version === "2.0.1" || version.startsWith("2.0.2")) && apiUrl.startsWith("http://");

  if (!isTest && !isHttpAllowed) {
    if (!apiUrl.startsWith("https://")) {
      console.error("❌ 正式构建必须使用 HTTPS API，当前：", apiUrl);
      ok = false;
    }
    if (env.NEXT_PUBLIC_CLOUD_AUTH_ENABLED === "true") {
      console.error("❌ 正式构建 CLOUD_AUTH 应默认关闭");
      ok = false;
    }
    if (env.NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED === "true") {
      console.error("❌ 正式构建 ACCOUNT_WORKSPACE 应默认关闭");
      ok = false;
    }
    if (env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED === "true") {
      console.error("❌ 正式构建 CLOUD_SYNC 应默认关闭");
      ok = false;
    }
  }

  if (isHttpAllowed) {
    console.log("⚠️  v2.0.1 使用临时 HTTP API，域名 HTTPS 可用后需切换");
  }

  if (!apiUrl) {
    console.error("❌ NEXT_PUBLIC_WARDROBE_API_BASE_URL 未设置");
    ok = false;
  }

  if (ok) {
    console.log("✅ 构建前校验通过");
    console.log("   版本:", version);
    console.log("   类型:", isTest ? "内部测试" : "正式发布");
    console.log("   API:", apiUrl);
    console.log("   CLOUD_AUTH:", env.NEXT_PUBLIC_CLOUD_AUTH_ENABLED ?? "未设置");
    console.log("   CLOUD_SYNC:", env.NEXT_PUBLIC_CLOUD_SYNC_ENABLED ?? "未设置");
  }

  return ok;
}

function post() {
  const pkg = getPackageJson();
  const [major, minor, patch] = parseSemver(pkg.version);
  const version = pkg.version;
  const versionCode = Math.max(1, major * 10000 + minor * 100 + patch);
  const sha = getCommitSha();

  console.log("📦 构建产物");
  console.log("   versionName:", version);
  console.log("   versionCode:", versionCode);
  console.log("   commit:", sha);

  // 移动 APK 到本地产物目录
  const androidReleaseDir = join(root, "android", "app", "build", "outputs", "apk", "release");

  if (existsSync(androidReleaseDir)) {
    const apkFiles = readdirSync(androidReleaseDir).filter((f) => f.endsWith(".apk"));
    if (apkFiles.length > 0) {
      const apkLocalDir = join(root, "apk-local");
      if (!existsSync(apkLocalDir)) mkdirSync(apkLocalDir, { recursive: true });
      for (const apk of apkFiles) {
        const src = join(androidReleaseDir, apk);
        const dest = join(apkLocalDir, apk.replace(".apk", `-${sha}.apk`));
        renameSync(src, dest);
        const sizeMb = (statSync(dest).size / (1024 * 1024)).toFixed(1);
        console.log(`   APK → ${dest} (${sizeMb}MB)`);
      }
    }
  } else {
    console.log("   (无 APK 产物，跳过归档)");
  }
}

const mode = process.argv[2] ?? "pre";
if (mode === "pre") {
  process.exit(pre() ? 0 : 1);
} else if (mode === "post") {
  post();
} else {
  console.error("用法: node scripts/validate-build.mjs [pre|post]");
  process.exit(1);
}
