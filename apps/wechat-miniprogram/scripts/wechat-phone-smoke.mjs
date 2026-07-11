#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultApiBase = "https://api.zhengfangapps.cloud";

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
  console.log(`
wechat-phone-smoke

Usage:
  WECHAT_TEST_PHONE=... WECHAT_TEST_PASSWORD=... npm --prefix apps/wechat-miniprogram run test:phone-smoke

Options:
  --skip-preview  Do not push a new DevTools preview before the manual smoke.
  --self-check    Run script parser/sanitizer checks only.

Environment:
  WECHAT_TEST_API_BASE   API base URL, default ${defaultApiBase}
  WECHAT_TEST_DEVICE     ADB serial when more than one device is connected
  WECHAT_PHONE_SMOKE_OUT Output directory, default ~/Desktop/wechat-phone-smoke-<time>
`);
  process.exit(0);
}

if (args.has("--self-check")) {
  selfCheck();
  console.log("wechat-phone-smoke self-check passed");
  process.exit(0);
}

main().catch((error) => {
  console.error(sanitizeText(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});

async function main() {
  if (typeof fetch !== "function") throw new Error("Node.js 18+ is required for fetch().");

  const phone = requiredEnv("WECHAT_TEST_PHONE");
  const password = requiredEnv("WECHAT_TEST_PASSWORD");
  const apiBase = String(process.env.WECHAT_TEST_API_BASE || defaultApiBase).replace(/\/$/, "");
  const outDir = process.env.WECHAT_PHONE_SMOKE_OUT || path.join(os.homedir(), "Desktop", `wechat-phone-smoke-${timestamp()}`);
  mkdirSync(outDir, { recursive: true });

  const serial = detectDevice(process.env.WECHAT_TEST_DEVICE);
  const device = {
    serial,
    model: adb(serial, ["shell", "getprop", "ro.product.model"]).trim() || "unknown",
    android: adb(serial, ["shell", "getprop", "ro.build.version.release"]).trim() || "unknown",
  };

  console.log(`device: ${device.model} / Android ${device.android} / ${serial}`);
  console.log(`api: ${apiBase}`);
  console.log(`account: ${maskPhone(phone)}`);
  console.log(`output: ${outDir}`);

  if (!args.has("--skip-preview")) {
    runNodeScript("wechatide-status.mjs", ["--no-projects"]);
    runNodeScript("wechatide-preview.mjs", ["--auto"]);
  }

  const deviceId = `wechat-phone-smoke-${Date.now()}`;
  const login = await apiJson(apiBase, "/api/auth/login", {
    method: "POST",
    body: {
      phone,
      password,
      deviceId,
      deviceLabel: `${device.model} / Android ${device.android}`,
    },
  });
  const token = String(login.accessToken || "");
  if (!token) throw new Error("Login succeeded but accessToken is missing.");

  const beforeItems = await fetchGarments(apiBase, token, deviceId);
  const beforeIds = new Set(beforeItems.map((item) => String(item.id || "")));

  const screenshots = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await wait(rl, "1. 在手机微信中打开刚推送的小程序预览，使用测试账号登录，并停在衣橱首页。");
    screenshots.push(capture(serial, outDir, "01-after-login.png"));

    await wait(rl, "2. 在手机上完成：添加单品 -> 选 1 张真实衣物图 -> 等 AI 识别 -> 保存单品 -> 回到衣橱首页。");
    screenshots.push(capture(serial, outDir, "02-after-intake-save.png"));

    const afterItems = await fetchGarments(apiBase, token, deviceId);
    const createdItems = afterItems.filter((item) => !beforeIds.has(String(item.id || "")));
    if (!createdItems.length) {
      throw new Error(`No new garment was found. Before=${beforeItems.length}, after=${afterItems.length}.`);
    }

    await wait(rl, "3. 打开刚保存的单品详情页。");
    screenshots.push(capture(serial, outDir, "03-garment-detail.png"));

    const reportPath = path.join(outDir, "report.md");
    writeReport(reportPath, {
      status: "PASSED",
      apiBase,
      phone,
      device,
      beforeCount: beforeItems.length,
      afterCount: afterItems.length,
      createdCount: createdItems.length,
      screenshots,
    });
    console.log(`report: ${reportPath}`);
  } finally {
    rl.close();
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Do not put test credentials in source files; pass them as env vars.`);
  return value;
}

function runNodeScript(name, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(scriptDir, name), ...scriptArgs], {
    cwd: path.resolve(scriptDir, ".."),
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 0) !== 0) throw new Error(`${name} failed with exit code ${result.status}`);
}

function detectDevice(preferredSerial) {
  const devices = parseAdbDevices(run("adb", ["devices", "-l"]));
  if (preferredSerial) {
    const found = devices.find((device) => device.serial === preferredSerial);
    if (!found) throw new Error(`ADB device not found: ${preferredSerial}`);
    return preferredSerial;
  }
  if (devices.length !== 1) {
    throw new Error(`Expected exactly one authorized ADB device, found ${devices.length}. Set WECHAT_TEST_DEVICE.`);
  }
  return devices[0].serial;
}

function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/, 3);
      return { serial, state };
    })
    .filter((device) => device.serial && device.state === "device");
}

function adb(serial, adbArgs) {
  return run("adb", ["-s", serial, ...adbArgs]);
}

function run(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).replace(/\r/g, "");
}

function capture(serial, outDir, name) {
  const file = path.join(outDir, name);
  const png = execFileSync("adb", ["-s", serial, "exec-out", "screencap", "-p"], {
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  writeFileSync(file, png);
  console.log(`screenshot: ${file}`);
  return file;
}

async function apiJson(apiBase, apiPath, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Wardrobe-Request-Id": `wechat-phone-smoke-${Date.now()}`,
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.deviceId) headers["X-Wardrobe-Device-Id"] = options.deviceId;

  const response = await fetch(`${apiBase}${apiPath}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) {
    const message = data && typeof data === "object" && "message" in data ? data.message : text;
    throw new Error(`${method} ${apiPath} failed: HTTP ${response.status} ${sanitizeText(String(message || ""))}`);
  }
  return data;
}

async function fetchGarments(apiBase, token, deviceId) {
  const data = await apiJson(apiBase, "/api/workspace/garments?limit=80", { token, deviceId });
  return Array.isArray(data.items) ? data.items : [];
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function wait(rl, message) {
  console.log(`\n${message}`);
  await rl.question("完成后按回车继续：");
}

function writeReport(file, result) {
  const lines = [
    "# 微信小程序真机 Smoke",
    "",
    `- 结果：${result.status}`,
    `- API：${result.apiBase}`,
    `- 账号：${maskPhone(result.phone)}`,
    `- 设备：${result.device.model} / Android ${result.device.android} / ${result.device.serial}`,
    `- 添加前衣物数：${result.beforeCount}`,
    `- 添加后衣物数：${result.afterCount}`,
    `- 本轮新增衣物数：${result.createdCount}`,
    "",
    "## 覆盖用例",
    "",
    "1. 预览版本可推送到开发者微信。",
    "2. 测试账号可在真机微信小程序登录并进入衣橱首页。",
    "3. 真实图片录入单品后，服务端衣物列表出现新增记录。",
    "4. 新增单品详情页可打开，真机截图已留存。",
    "",
    "## 截图",
    "",
    ...result.screenshots.map((screenshot) => `- ${screenshot}`),
    "",
  ];
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function maskPhone(phone) {
  const text = String(phone);
  if (text.length < 7) return "***";
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function sanitizeText(text) {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>")
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "<jwt>")
    .replace(new RegExp(escapeRegExp(process.env.WECHAT_TEST_PASSWORD || "$^"), "g"), "<password>")
    .replace(new RegExp(escapeRegExp(process.env.WECHAT_TEST_PHONE || "$^"), "g"), maskPhone(process.env.WECHAT_TEST_PHONE || ""));
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function selfCheck() {
  assert.deepEqual(
    parseAdbDevices(`List of devices attached
serial-1 device usb:1 product:test
serial-2 unauthorized usb:2
serial-3 offline usb:3
`),
    [{ serial: "serial-1", state: "device" }],
  );
  assert.equal(maskPhone("16497316497"), "164****6497");
  process.env.WECHAT_TEST_PHONE = "16497316497";
  process.env.WECHAT_TEST_PASSWORD = "12345678";
  assert.equal(sanitizeText("Bearer abc.def.ghi 16497316497 12345678"), "Bearer <redacted> 164****6497 <password>");
}
