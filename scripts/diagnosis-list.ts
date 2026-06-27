#!/usr/bin/env tsx
// scripts/diagnosis-list.ts
// 列出远程诊断工单（Agent CLI）

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API_BASE = process.env.WARDROBE_API_BASE_URL ?? "http://localhost:3001";
const READER_TOKEN = process.env.DIAGNOSTIC_READER_TOKEN ?? "";
const ACTOR = process.env.DIAGNOSTIC_ACTOR ?? "local-agent";

async function main() {
  if (!READER_TOKEN) {
    console.error("错误: 环境变量 DIAGNOSTIC_READER_TOKEN 未设置");
    process.exit(1);
  }

  const limit = Number(process.argv[2] ?? 20);

  const res = await fetch(`${API_BASE}/api/admin/diagnostics/cases?limit=${limit}`, {
    headers: {
      authorization: `Bearer ${READER_TOKEN}`,
      "x-diagnostic-actor": ACTOR,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`请求失败 (${res.status}): ${body}`);
    process.exit(1);
  }

  const data = (await res.json()) as { cases: Array<Record<string, unknown>> };
  if (!data.cases || data.cases.length === 0) {
    console.log("没有诊断工单。");
    return;
  }

  console.log(`共 ${data.cases.length} 条诊断工单:\n`);
  for (const c of data.cases) {
    const uploadedAt = c.uploadedAt ? new Date(c.uploadedAt as string).toLocaleString("zh-CN") : "未上传";
    const size = formatBytes(Number(c.sizeBytes ?? 0));
    console.log(`  ${c.caseId}`);
    console.log(`    版本: ${c.appVersion} (${c.buildChannel}) · ${size} · ${c.eventCount} 事件 · ${c.itemCount} 物品`);
    console.log(`    上传时间: ${uploadedAt}`);
    if (c.problemDescription) {
      console.log(`    问题描述: ${String(c.problemDescription).slice(0, 80)}${String(c.problemDescription).length > 80 ? "…" : ""}`);
    }
    console.log();
  }
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
