#!/usr/bin/env node
// scripts/build-web-with-info.mjs
// 编译时注入完整构建身份（Git SHA、版本、构建时间、渠道）

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function getPackageJson() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

function parseSemver(version) {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function getGitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function validateGitCommit(sha) {
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) {
    console.error("❌ 无法读取有效的 40 位 Git Commit SHA");
    console.error("   当前值:", sha ?? "(null)");
    return false;
  }
  return true;
}

function main() {
  const pkg = getPackageJson();
  const version = pkg.version;
  const [major, minor, patch] = parseSemver(version);
  const versionCode = Math.max(1, major * 10000 + minor * 100 + patch);
  const gitCommit = getGitCommit();

  if (!validateGitCommit(gitCommit)) {
    process.exit(1);
  }

  const buildTime = new Date().toISOString();
  const buildChannel = process.env.BUILD_CHANNEL ?? "internal";

  console.log("🔨 开始构建...");
  console.log("   版本:", version);
  console.log("   versionCode:", versionCode);
  console.log("   Git Commit:", gitCommit);
  console.log("   构建时间:", buildTime);
  console.log("   渠道:", buildChannel);

  const env = {
    ...process.env,
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_VERSION_CODE: String(versionCode),
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
    NEXT_PUBLIC_GIT_COMMIT_SHORT: gitCommit.slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_CHANNEL: buildChannel,
    NEXT_PUBLIC_REPOSITORY: "Akira362680164/wardrobe-outfit-pwa",
  };

  execSync("next build", {
    cwd: root,
    stdio: "inherit",
    env,
  });
}

main();
