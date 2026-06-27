#!/usr/bin/env tsx
// scripts/test-build-identity.ts
// 验证构建身份注入和诊断契约

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${message}`);
  } else {
    fail++;
    console.error(`  ❌ ${message}`);
  }
}

function readRootFile(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

function grepFiles(pattern: string, files: string[]): boolean {
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    if (pattern.test(content)) return true;
  }
  return false;
}

console.log("=== 构建身份测试 ===\n");

// 1. 验证 package.json 使用了新的 build 脚本
const pkg = JSON.parse(readRootFile("package.json"));
assert(pkg.scripts.build === "node scripts/build-web-with-info.mjs", "package.json build 使用 build-web-with-info.mjs");
assert(pkg.scripts["build:web"] === "node scripts/build-web-with-info.mjs", "package.json build:web 使用 build-web-with-info.mjs");

// 2. 验证构建脚本存在且包含关键逻辑
const buildScript = readRootFile("scripts/build-web-with-info.mjs");
assert(buildScript.includes("git rev-parse HEAD"), "构建脚本读取 Git Commit");
assert(buildScript.includes("40}"), "构建脚本校验 40 位 SHA");
assert(buildScript.includes("NEXT_PUBLIC_GIT_COMMIT"), "构建脚本注入 NEXT_PUBLIC_GIT_COMMIT");
assert(buildScript.includes("NEXT_PUBLIC_BUILD_TIME"), "构建脚本注入 NEXT_PUBLIC_BUILD_TIME");
assert(buildScript.includes("process.exit(1)"), "构建脚本在 Commit 无效时失败");

// 3. 验证当前 Git Commit 为 40 位
const gitCommit = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
assert(/^[a-f0-9]{40}$/.test(gitCommit), `当前 Git Commit 为 40 位十六进制 (${gitCommit.slice(0, 8)}...)`);

// 4. 验证 cloud-contracts 导出诊断契约
const contractsIndex = readRootFile("packages/cloud-contracts/src/index.ts");
assert(contractsIndex.includes("./diagnostics/contracts.js"), "cloud-contracts index.ts 导出诊断契约");

// 5. 验证诊断契约文件存在且包含关键 schema
const diagnosticContracts = readRootFile("packages/cloud-contracts/src/diagnostics/contracts.ts");
assert(diagnosticContracts.includes("DiagnosticUploadAuthorizeRequestSchema"), "诊断契约包含授权请求 Schema");
assert(diagnosticContracts.includes("DiagnosticUploadAuthorizeResponseSchema"), "诊断契约包含授权响应 Schema");
assert(diagnosticContracts.includes("DiagnosticUploadCompleteRequestSchema"), "诊断契约包含完成请求 Schema");
assert(diagnosticContracts.includes("DiagnosticUploadCompleteResponseSchema"), "诊断契约包含完成响应 Schema");
assert(diagnosticContracts.includes("DiagnosticCaseMetadataSchema"), "诊断契约包含工单元数据 Schema");
assert(diagnosticContracts.includes("ApiRequestTraceSchema"), "诊断契约包含请求轨迹 Schema");
assert(diagnosticContracts.includes('z.string().regex(/^[a-f0-9]{64}$/)'), "诊断契约校验 SHA-256 格式");
assert(diagnosticContracts.includes('z.string().regex(/^WD-\\d{8}-[A-Z0-9]{6}$/)'), "诊断契约校验工单号格式");
assert(diagnosticContracts.includes("10 * 1024 * 1024"), "诊断契约限制 10 MiB 大小");
assert(diagnosticContracts.includes(".max(1000)"), "诊断契约限制问题描述 1000 字符");

console.log("\n=== 结果 ===");
console.log(`通过: ${pass} / 失败: ${fail}`);
if (fail > 0) process.exit(1);
