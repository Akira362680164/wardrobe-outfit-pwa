// scripts/verify-v1.1.27-khaki-live.mjs
// v1.1.27: 真实 MiniMax AI 识别 — 用用户提供的卡其衬衫图片，验证返回 primary="卡其" 不被强制映射为米或棕。
//
// 安全约束：
// - MiniMax Key 从 .env.local 读取，**绝不出现在 stdout/scratchpad/JSON**。
// - 使用 length 比对而非明文验证。
// - 失败时打印结构化诊断，不打印 Key。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// 读取 .env.local
const envPath = join(root, ".env.local");
let API_KEY = "";
let API_HOST = "https://api.minimaxi.com";
let MODEL = "MiniMax-M3";
try {
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    if (m[1] === "MINIMAX_API_KEY") API_KEY = m[2].trim();
    else if (m[1] === "MINIMAX_API_HOST") API_HOST = m[2].trim();
    else if (m[1] === "MINIMAX_MODEL") MODEL = m[2].trim();
  }
} catch (e) {
  console.log("⚠ 无法读取 .env.local：", e.message);
}

console.log(`\n=== v1.1.27 真实 MiniMax 卡其衬衫识别 ===`);
console.log(`Key 长度: ${API_KEY.length}, Host: ${API_HOST}, Model: ${MODEL}`);

if (API_KEY.length < 50) {
  console.log("❌ MINIMAX_API_KEY 不可用或过短");
  console.log("未验证风险：真实 MiniMax 识别列为未验证");
  process.exit(0);
}

// 读图 → base64
const IMAGE_PATH = process.env.MINIMAX_TEST_IMAGE_PATH?.trim() ?? "";
let imageBase64;
if (!IMAGE_PATH) {
  console.log("⚠ 未设置 MINIMAX_TEST_IMAGE_PATH，跳过真实图片识别验证");
  process.exit(0);
}
try {
  const buf = readFileSync(IMAGE_PATH);
  imageBase64 = `data:image/jpeg;base64,${buf.toString("base64")}`;
  console.log(`图片大小: ${(buf.length / 1024).toFixed(1)}KB`);
} catch (e) {
  console.log(`❌ 无法读取图片 ${IMAGE_PATH}:`, e.message);
  process.exit(0);
}

// 加载真实的 tagGarmentOnDevice
const { tagGarmentOnDevice } = await import("../src/lib/device-minimax.ts");

const settings = {
  apiKey: API_KEY,
  apiHost: API_HOST,
  model: MODEL,
  timeoutMs: 60000,
};

async function run() {
  console.log("\n--- 调用 tagGarmentOnDevice（真实识别）---");
  try {
    const result = await tagGarmentOnDevice(imageBase64, "卡其衬衫", settings);
    console.log("\n--- 原始返回 (sanitized) ---");
    const safeResult = JSON.stringify(result, (key, value) => {
      if (key === "notes") return value ? value.slice(0, 60) + "..." : value;
      if (key === "confidence") return typeof value === "number" ? value.toFixed(2) : value;
      return value;
    }, 2);
    console.log(safeResult);
    console.log("\n--- 颜色解析校验 ---");
    const colors = result.colors;
    if (!colors) {
      console.log("❌ colors 为空");
      return { pass: false, reason: "colors missing" };
    }
    if (colors.mode === "single") {
      const p = colors.primary;
      console.log(`mode=single, primary="${p}", needsReview=${result.needsReview}`);
      const isKhaki = p === "卡其";
      const isRice = p === "米";
      const isBrown = p === "棕";
      if (isKhaki) {
        console.log("✅ 正确识别为卡其");
        return { pass: true, primary: p };
      }
      if (isRice) {
        console.log("❌ 错误：识别为米（应识别为卡其）");
        return { pass: false, reason: "primary=米（应=卡其）" };
      }
      if (isBrown) {
        console.log("❌ 错误：识别为棕（应识别为卡其）");
        return { pass: false, reason: "primary=棕（应=卡其）" };
      }
      console.log(`❌ 错误：识别为「${p}」（应=卡其）`);
      return { pass: false, reason: `primary=${p}（应=卡其）` };
    }
    if (colors.mode === "main_with_accent") {
      console.log(`mode=main_with_accent, primary="${colors.primary}", accents=${JSON.stringify(colors.accents)}`);
      if (colors.primary === "卡其") {
        console.log("✅ 主色正确识别为卡其");
        return { pass: true, primary: colors.primary };
      }
      return { pass: false, reason: `primary=${colors.primary}` };
    }
    if (colors.mode === "multicolor") {
      console.log(`mode=multicolor, primaries=${JSON.stringify(colors.primaries)}`);
      if (colors.primaries.includes("卡其")) {
        console.log("✅ 包含卡其");
        return { pass: true };
      }
      return { pass: false, reason: `primaries=${colors.primaries.join(",")}` };
    }
    return { pass: false, reason: `未知 mode=${colors.mode}` };
  } catch (e) {
    console.log(`❌ MiniMax 调用失败：${e?.message || e}`);
    if (e?.message?.includes("401") || e?.message?.includes("auth")) {
      console.log("可能 Key 过期或余额不足");
    }
    return { pass: false, reason: e?.message || String(e) };
  }
}

const result = await run();
console.log("\n=== 结果 ===");
console.log(JSON.stringify(result, null, 2));
process.exit(result.pass ? 0 : 2);
