// v2.0.1: APK build pre-flight environment validation
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = {
  NEXT_PUBLIC_CLOUD_AUTH_ENABLED: "true",
  NEXT_PUBLIC_ACCOUNT_WORKSPACE_ENABLED: "true",
  NEXT_PUBLIC_CLOUD_SYNC_ENABLED: "true",
};

let failed = false;

function check(label, actual) {
  if (actual === undefined || actual === null || actual === "") {
    console.error(`❌ ${label}: 未设置`);
    failed = true;
    return false;
  }
  if (REQUIRED[label] && actual !== REQUIRED[label]) {
    console.error(`❌ ${label}: 期望 "${REQUIRED[label]}"，实际 "${actual}"`);
    failed = true;
    return false;
  }
  console.log(`  ✅ ${label}=${label === "NEXT_PUBLIC_WARDROBE_API_BASE_URL" ? actual : actual}`);
  return true;
}

// Load .env if exists
const envPath = join(process.cwd(), ".env");
let env = {};
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
  }
} catch {
  console.log("  ⚠ 未找到 .env 文件，使用 process.env");
  env = process.env;
}

console.log("\n=== Cloud Build Env Validation ===");

for (const key of Object.keys(REQUIRED)) {
  check(key, env[key]);
}

// API base URL
const apiBase = env.NEXT_PUBLIC_WARDROBE_API_BASE_URL;
if (!apiBase) {
  console.error("❌ NEXT_PUBLIC_WARDROBE_API_BASE_URL: 未设置");
  failed = true;
} else if (!/^https?:\/\/.+/.test(apiBase)) {
  console.error(`❌ NEXT_PUBLIC_WARDROBE_API_BASE_URL: 不是合法绝对 URL: ${apiBase}`);
  failed = true;
} else {
  console.log(`  ✅ NEXT_PUBLIC_WARDROBE_API_BASE_URL=${apiBase}`);
  if (apiBase.startsWith("http://")) {
    console.log("  ⚠ HTTP 明文 API 地址，仅用于当前临时测试，域名 HTTPS 可用后切换");
  }
}

if (failed) {
  console.error("\n❌ 构建前环境校验失败，请检查 .env 文件。\n");
  process.exit(1);
}

console.log("\n✅ 构建前环境校验通过\n");
