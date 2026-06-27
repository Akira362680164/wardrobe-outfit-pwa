#!/usr/bin/env tsx
// scripts/diagnosis-inspect.ts
// 检查已下载的诊断数据（Agent CLI）

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = process.env.DIAGNOSTICS_DIR ?? ".diagnostics";

async function main() {
  const target = process.argv[2];

  if (!target) {
    // 列出所有已下载的诊断文件
    if (!existsSync(OUT_DIR)) {
      console.log(`目录 ${OUT_DIR} 不存在。`);
      return;
    }
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.log(`${OUT_DIR} 中没有诊断文件。`);
      return;
    }
    console.log(`已下载的诊断文件 (${files.length}):\n`);
    for (const f of files.sort().reverse()) {
      const stat = readFileSync(join(OUT_DIR, f));
      console.log(`  ${f.replace(/\.json$/, "")}  (${formatBytes(stat.length)})`);
    }
    return;
  }

  const caseId = target;
  const filePath = join(OUT_DIR, `${caseId}.json`);
  if (!existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    console.error(`提示: 先用 npx tsx scripts/diagnosis-pull.ts ${caseId} 下载。`);
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as Record<string, unknown>;

  console.log(`诊断工单: ${caseId}`);
  console.log(`文件大小: ${formatBytes(raw.length)}`);
  console.log();

  // 构建信息
  if (data.build) {
    const b = data.build as Record<string, unknown>;
    console.log("【构建信息】");
    console.log(`  版本: ${b.appVersion} (${b.buildChannel})`);
    console.log(`  Commit: ${b.gitCommitShort} (${b.gitCommit})`);
    console.log(`  构建时间: ${b.buildTime}`);
    console.log();
  }

  // 应用信息
  if (data.app) {
    const a = data.app as Record<string, unknown>;
    console.log("【应用信息】");
    console.log(`  平台: ${a.capacitorPlatform} (原生: ${a.nativePlatform})`);
    console.log();
  }

  // 导航
  if (data.navigation) {
    const n = data.navigation as Record<string, unknown>;
    console.log("【导航】");
    console.log(`  当前视图: ${n.activeView}`);
    console.log(`  路由: ${n.route}`);
    console.log();
  }

  // 数量统计
  if (data.counts) {
    const c = data.counts as Record<string, unknown>;
    console.log("【数据量】");
    console.log(`  物品: ${c.items} · 位置: ${c.locations} · 穿搭: ${c.outfits} · 心愿单: ${c.wishlistItems}`);
    console.log();
  }

  // 用户报告
  if (data.userReport) {
    const ur = data.userReport as Record<string, unknown>;
    if (ur.description) {
      console.log("【用户问题描述】");
      console.log(`  ${ur.description}`);
      console.log();
    }
  }

  // 环境
  if (data.environment) {
    const e = data.environment as Record<string, unknown>;
    console.log("【环境】");
    if (e.userAgent) console.log(`  UA: ${String(e.userAgent).slice(0, 120)}`);
    if (e.viewport) {
      const v = e.viewport as Record<string, unknown>;
      console.log(`  视口: ${v.width}×${v.height} @ ${v.devicePixelRatio}x`);
    }
    console.log();
  }

  // 网络
  if (data.network) {
    const net = data.network as Record<string, unknown>;
    console.log("【网络】");
    console.log(`  浏览器在线: ${net.browserOnline}`);
    console.log(`  传输方式: ${net.transport}`);
    console.log(`  API 标签: ${net.apiHostLabel}`);
    console.log();
  }

  // 最近事件
  if (data.recentEvents && Array.isArray(data.recentEvents)) {
    const events = data.recentEvents as Array<Record<string, unknown>>;
    console.log(`【最近事件】 (${events.length} 条)`);
    for (const ev of events.slice(-10)) {
      const time = new Date(String(ev.occurredAt)).toLocaleTimeString("zh-CN");
      console.log(`  [${time}] ${ev.category} / ${ev.name} (${ev.severity})`);
    }
    if (events.length > 10) {
      console.log(`  … 还有 ${events.length - 10} 条`);
    }
    console.log();
  }

  // 物品摘要（前5条）
  if (data.items && Array.isArray(data.items)) {
    const items = data.items as Array<Record<string, unknown>>;
    console.log(`【物品摘要】 (${items.length} 条，展示前 5 条)`);
    for (const item of items.slice(0, 5)) {
      console.log(`  · ${item.name} (${item.category}) — ${item.status}`);
    }
    if (items.length > 5) {
      console.log(`  … 还有 ${items.length - 5} 条`);
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
