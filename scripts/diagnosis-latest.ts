#!/usr/bin/env tsx
// scripts/diagnosis-latest.ts
// 获取最新诊断工单（Agent CLI）

const API_BASE = process.env.WARDROBE_API_BASE_URL ?? "http://localhost:3001";
const READER_TOKEN = process.env.DIAGNOSTIC_READER_TOKEN ?? "";
const ACTOR = process.env.DIAGNOSTIC_ACTOR ?? "local-agent";

async function main() {
  if (!READER_TOKEN) {
    console.error("错误: 环境变量 DIAGNOSTIC_READER_TOKEN 未设置");
    process.exit(1);
  }

  const res = await fetch(`${API_BASE}/api/admin/diagnostics/cases/latest`, {
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

  const c = (await res.json()) as Record<string, unknown>;
  const uploadedAt = c.uploadedAt ? new Date(c.uploadedAt as string).toLocaleString("zh-CN") : "未上传";
  const size = formatBytes(Number(c.sizeBytes ?? 0));

  console.log(`最新诊断工单: ${c.caseId}`);
  console.log(`  版本: ${c.appVersion} (${c.buildChannel})`);
  console.log(`  大小: ${size}`);
  console.log(`  事件: ${c.eventCount} · 物品: ${c.itemCount} · 穿搭: ${c.outfitCount} · 心愿单: ${c.wishlistCount}`);
  console.log(`  上传时间: ${uploadedAt}`);
  console.log(`  Commit: ${c.clientGitCommit}`);
  if (c.problemDescription) {
    console.log(`  问题描述: ${c.problemDescription}`);
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
