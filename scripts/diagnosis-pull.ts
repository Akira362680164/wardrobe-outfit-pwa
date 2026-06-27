#!/usr/bin/env tsx
// scripts/diagnosis-pull.ts
// 下载诊断工单原始数据（Agent CLI）

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API_BASE = process.env.WARDROBE_API_BASE_URL ?? "http://localhost:3001";
const READER_TOKEN = process.env.DIAGNOSTIC_READER_TOKEN ?? "";
const ACTOR = process.env.DIAGNOSTIC_ACTOR ?? "local-agent";
const OUT_DIR = process.env.DIAGNOSTICS_DIR ?? ".diagnostics";

async function main() {
  if (!READER_TOKEN) {
    console.error("错误: 环境变量 DIAGNOSTIC_READER_TOKEN 未设置");
    process.exit(1);
  }

  const caseId = process.argv[2];
  if (!caseId) {
    console.error("用法: npx tsx scripts/diagnosis-pull.ts <caseId>");
    process.exit(1);
  }

  // 1. 获取下载地址
  const urlRes = await fetch(`${API_BASE}/api/admin/diagnostics/cases/${caseId}/download-url`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${READER_TOKEN}`,
      "x-diagnostic-actor": ACTOR,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!urlRes.ok) {
    const body = await urlRes.text();
    console.error(`获取下载地址失败 (${urlRes.status}): ${body}`);
    process.exit(1);
  }

  const { downloadUrl, sha256, sizeBytes } = (await urlRes.json()) as {
    downloadUrl: string;
    sha256: string;
    sizeBytes: number;
  };

  // 2. 下载文件
  console.log(`正在下载 ${caseId} (${formatBytes(sizeBytes)})…`);
  const downloadRes = await fetch(downloadUrl);
  if (!downloadRes.ok) {
    console.error(`下载失败 (${downloadRes.status})`);
    process.exit(1);
  }

  const buffer = Buffer.from(await downloadRes.arrayBuffer());

  // 3. 校验 SHA-256
  const { createHash } = await import("node:crypto");
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== sha256) {
    console.error(`SHA-256 校验失败: 期望 ${sha256}, 实际 ${actualSha256}`);
    process.exit(1);
  }

  // 4. 保存到 .diagnostics/
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const fileName = `${caseId}.json`;
  const filePath = join(OUT_DIR, fileName);
  writeFileSync(filePath, buffer);

  console.log(`✅ 已保存到 ${filePath} (${formatBytes(buffer.length)})`);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

main().catch((err) => {
  console.error("意外错误:", err);
  process.exit(1);
});
