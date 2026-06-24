#!/usr/bin/env node

/**
 * v1.1.8 ChatGPT 审查用固定代码库导出脚本
 *
 * 用法:
 *   node scripts/export-chatgpt-codebase.mjs
 *
 * 固定输出目录: $HOME/Desktop/wardrobe-chatgpt-codebase
 *
 * 生成 8 个 Markdown 文件 (04-VALIDATION_REPORT.md 由验证流程后续覆盖):
 *   00-PROJECT_MAP.md
 *   01-CODEBASE_MERGED.md
 *   02-CODEBASE_MAP.md
 *   03-GIT_STATE.md
 *   04-VALIDATION_REPORT.md (template)
 *   05-CHANGED_FILES_MERGED.md
 *   06-CHANGED_FILES_MAP.md
 *   README_FOR_CHATGPT.md
 *
 * 不生成 ZIP, 不修改源码, 不提交导出目录.
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(homedir(), "Desktop", "wardrobe-chatgpt-codebase");

// ────────────────────────────────────────────────────────────────────────────
// CODEBASE_MERGED 固定文件清单 (来自提示词)
// 每条: [path, category, reviewFocus]
// ────────────────────────────────────────────────────────────────────────────

const CODEBASE_FILES = [
  ["AGENTS.md",                                                   "docs",     "项目 AI 协作主规范, 隐私/Git/APK/签名/版本规则"],
  ["README.md",                                                   "docs",     "项目入口说明"],
  ["VERSION_HISTORY.md",                                          "docs",     "版本与变更记录, 顶部为最新条目"],
  ["package.json",                                                "config",   "验证脚本, 重点检查 test:logic:all 与 export:chatgpt"],
  ["tsconfig.json",                                               "config",   "TypeScript 编译器配置"],
  ["next.config.ts",                                              "config",   "Next.js App Router 配置"],
  ["capacitor.config.ts",                                         "config",   "Capacitor (Android) 配置"],
  ["src/app/layout.tsx",                                          "entry",    "Next.js 根布局, Provider 嵌套"],
  ["src/app/page.tsx",                                            "entry",    "Next.js 根路由, 渲染 WardrobeApp"],
  ["src/components/wardrobe-app.tsx",                             "shell",    "根组件, AppRoute 接入, refreshState, 撤销购买全局刷新"],
  ["src/components/use-app-navigation-controller.ts",             "shell",    "v1.1.7 4A AppRoute 导航控制器"],
  ["src/components/wishlist-view-2.0.tsx",                        "detail",   "种草 2.0, handleUndoPurchase, onDataChanged"],
  ["src/components/outfit-list-view.tsx",                         "detail",   "套装列表 / 详情壳"],
  ["src/components/garment-detail-3.0.tsx",                       "detail",   "单品详情 3.0"],
  ["src/components/detail-shell.tsx",                             "detail",   "v1.1.5 详情页统一壳"],
  ["src/components/outfit-planning-calendar-view.tsx",            "planning", "穿搭计划日历视图"],
  ["src/components/outfit-weekly-plan-strip.tsx",                 "planning", "7 天穿搭计划条"],
  ["src/components/outfit-plan-day-card.tsx",                     "planning", "穿搭计划单日卡片"],
  ["src/components/app-sub-page-top-bar.tsx",                     "shell",    "统一子页顶部栏 (v1.1.7 4A)"],
  ["src/lib/types.ts",                                            "data",     "Dexie schema 类型, 业务实体定义"],
  ["src/lib/db.ts",                                               "data",     "Dexie 数据库实例 + schema 版本"],
  ["src/lib/data-repo.ts",                                        "data",     "仓库入口, 只读查询, 写入口聚合"],
  ["src/lib/wishlist-conversion.ts",                              "data",     "种草转衣橱, 撤销购买, 事务一致性"],
  ["src/lib/wardrobe-cascade-delete.ts",                          "data",     "衣橱级联删除"],
  ["src/lib/outfit-cascade-delete.ts",                            "data",     "套装级联删除"],
  ["src/lib/outfit-planning.ts",                                  "planning", "穿搭计划业务逻辑"],
  ["src/lib/outfit-calendar.ts",                                  "planning", "日历视图业务逻辑"],
  ["src/lib/outfit-wear-sync.ts",                                 "planning", "计划-穿着记录同步"],
  ["src/lib/plan-packing.ts",                                     "planning", "旅行打包清单"],
  ["src/lib/app-route.ts",                                        "shell",    "v1.1.7 4A AppRoute 模型"],
  ["scripts/test-app-route-navigation.ts",                        "test",     "AppRoute 导航源码级断言"],
  ["scripts/test-data-repo.ts",                                   "test",     "data-repo 源码级断言, v1.1.8 新增 hotfix 断言"],
  ["scripts/test-navigation-and-intake-entry.ts",                 "test",     "导航 + 录入入口断言"],
  ["scripts/test-wishlist-management-followup.ts",                "test",     "种草管理 followup 断言, v1.1.8 新增 hotfix 断言"],
  ["scripts/test-v1-1-6-rework-regression.ts",                    "test",     "v1.1.6 rework 回归断言"],
];

// ────────────────────────────────────────────────────────────────────────────
// CHANGED_FILES_MERGED 排除规则
// ────────────────────────────────────────────────────────────────────────────

const EXCLUDE_PATTERNS = [
  /^node_modules\//,
  /^\.next\//,
  /^out\//,
  /^android\/app\/src\/main\/assets\/public\//,
  /^android\/.+\/build\//,
  /\.apk$/,
  /^\.env(\..+)?$/,
  /^android\/local\.properties$/,
  /\.jks$/,
  /\.keystore$/,
  /signing.*\.properties$/i,
  /.*signing.*\.properties$/i,
];

function isExcluded(relPath) {
  return EXCLUDE_PATTERNS.some((re) => re.test(relPath));
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function countLines(s) {
  if (s.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  // 末尾若是 \n, 不应额外加一
  if (s.charCodeAt(s.length - 1) === 10) n--;
  return Math.max(n, 1);
}

function tryGit(cmd) {
  try {
    return execSync(cmd, { cwd: PROJECT_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
  } catch (e) {
    return `(git command failed: ${cmd})\n${e.stderr || e.message || ""}`.trimEnd();
  }
}

function tryGitArr(cmd) {
  const raw = tryGit(cmd);
  if (raw.startsWith("(git command failed")) return [];
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

function readFileMaybe(relPath) {
  const abs = join(PROJECT_ROOT, relPath);
  if (!existsSync(abs)) return null;
  try {
    const stat = statSync(abs);
    if (!stat.isFile()) return null;
    const content = readFileSync(abs, "utf8");
    return { content, bytes: Buffer.byteLength(content, "utf8"), lines: countLines(content), sha: sha256(content) };
  } catch (e) {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ────────────────────────────────────────────────────────────────────────────
// 文件头格式
// ────────────────────────────────────────────────────────────────────────────

function fileHeader(relPath, info) {
  return [
    "// ================================================================================",
    `// FILE: ${relPath}`,
    `// BYTES: ${info.bytes}`,
    `// LINES: ${info.lines}`,
    `// SHA256: ${info.sha}`,
    "// ================================================================================",
    "",
  ].join("\n");
}

function fileMissingBlock(relPath) {
  return [
    "// ================================================================================",
    `// FILE MISSING: ${relPath}`,
    "// ================================================================================",
    "",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 01 + 02 CODEBASE_MERGED + CODEBASE_MAP
// ────────────────────────────────────────────────────────────────────────────

function buildCodebaseMerged() {
  const intro = [
    "# 01-CODEBASE_MERGED",
    "",
    "> 本文件是 ChatGPT 审查用全量代码合并包.",
    "> 每个原文件之间用固定头部 `// FILE:` 分隔, 通过 grep `// FILE: <path>` 即可定位.",
    "> 这不是合法源码, 不能编译, 仅供阅读.",
    "",
    `生成时间: ${nowIso()}`,
    `项目根: ${PROJECT_ROOT}`,
    `文件总数 (清单): ${CODEBASE_FILES.length}`,
    "",
    "---",
    "",
  ].join("\n");

  let merged = intro;
  let currentLine = countLines(merged) + 1; // 下一段从这一行开始

  const mapRows = [];

  for (let i = 0; i < CODEBASE_FILES.length; i++) {
    const [relPath, category, focus] = CODEBASE_FILES[i];
    const info = readFileMaybe(relPath);

    let block;
    let blockLines;
    let bytes = 0;
    let lines = 0;
    let sha = "MISSING";

    if (info == null) {
      block = fileMissingBlock(relPath) + "\n";
      blockLines = countLines(block);
    } else {
      block = fileHeader(relPath, info) + info.content;
      if (!block.endsWith("\n")) block += "\n";
      block += "\n";
      blockLines = countLines(block);
      bytes = info.bytes;
      lines = info.lines;
      sha = info.sha;
    }

    const startLine = currentLine;
    const endLine = currentLine + blockLines - 1;
    merged += block;
    currentLine = endLine + 1;

    mapRows.push({
      idx: i + 1,
      path: relPath,
      startLine,
      endLine,
      lines,
      bytes,
      sha,
      category,
      focus,
    });
  }

  return { merged, mapRows };
}

function buildCodebaseMap(mapRows) {
  const lines = [
    "# 02-CODEBASE_MAP",
    "",
    "> 01-CODEBASE_MERGED.md 的索引表. 起止行号从 1 开始, 与 01 文件原始行号一致.",
    "",
    `生成时间: ${nowIso()}`,
    `条目总数: ${mapRows.length}`,
    "",
    "| 序号 | 文件路径 | 起始行 | 结束行 | 行数 | 字节数 | SHA256 | 分类 | 审查重点 |",
    "|------|----------|--------|--------|------|--------|--------|------|----------|",
  ];
  for (const r of mapRows) {
    lines.push(
      `| ${r.idx} | \`${r.path}\` | ${r.startLine} | ${r.endLine} | ${r.lines} | ${r.bytes} | \`${r.sha}\` | ${r.category} | ${r.focus} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 03 GIT_STATE
// ────────────────────────────────────────────────────────────────────────────

function buildGitState() {
  const branch = tryGit("git branch --show-current");
  const status = tryGit("git status --short");
  const log = tryGit("git log --oneline -n 20");
  const diffStat = tryGit("git diff --stat main...HEAD");
  const diffNames = tryGit("git diff --name-only main...HEAD");
  const head = tryGit("git rev-parse HEAD");

  const namesArr = tryGitArr("git diff --name-only main...HEAD");
  const statusArr = tryGitArr("git status --short");

  const isOnTargetBranch = branch === "refactor/app-route-4a";
  const workspaceClean = statusArr.length === 0;
  const hasUntrackedExportArtifact = statusArr.some((l) => /POST_4B_HOTFIX_|wardrobe-chatgpt-codebase/.test(l));
  const hasApk = statusArr.some((l) => /\.apk\b/i.test(l)) || namesArr.some((p) => /\.apk$/i.test(p));
  const hasSigning = statusArr.some((l) => /\.(jks|keystore)\b/i.test(l) || /signing.*\.properties/i.test(l))
    || namesArr.some((p) => /\.(jks|keystore)$/i.test(p) || /signing.*\.properties/i.test(p));

  const out = [
    "# 03-GIT_STATE",
    "",
    `生成时间: ${nowIso()}`,
    `HEAD commit: \`${head}\``,
    "",
    "## git branch --show-current",
    "",
    "```",
    branch,
    "```",
    "",
    "## git status --short",
    "",
    "```",
    status || "(clean)",
    "```",
    "",
    "## git log --oneline -n 20",
    "",
    "```",
    log,
    "```",
    "",
    "## git diff --stat main...HEAD",
    "",
    "```",
    diffStat || "(empty)",
    "```",
    "",
    "## git diff --name-only main...HEAD",
    "",
    "```",
    diffNames || "(empty)",
    "```",
    "",
    "## 声明性检查",
    "",
    `- 当前分支是否为 \`refactor/app-route-4a\`: **${isOnTargetBranch ? "是" : "否"}**`,
    `- 工作区是否干净: **${workspaceClean ? "是" : "否"}**`,
    `- 是否存在未提交改动: **${workspaceClean ? "否" : "是"}**`,
    `- 是否存在生成产物 (POST_4B_HOTFIX_*.md / wardrobe-chatgpt-codebase) 待提交: **${hasUntrackedExportArtifact ? "是" : "否"}**`,
    `- 是否存在 APK 待提交: **${hasApk ? "是" : "否"}**`,
    `- 是否存在签名文件 (\`*.jks\` / \`*.keystore\` / signing*.properties) 待提交: **${hasSigning ? "是" : "否"}**`,
    "",
  ];
  return out.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 05 + 06 CHANGED_FILES_MERGED + CHANGED_FILES_MAP
// ────────────────────────────────────────────────────────────────────────────

function getChangedFilesNameStatus() {
  const raw = tryGit("git diff --name-status main...HEAD");
  if (!raw || raw.startsWith("(git command failed")) return [];
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(/\t+/);
    if (parts.length < 2) continue;
    const status = parts[0].trim();
    const path = parts[parts.length - 1].trim();
    out.push({ status, path });
  }
  return out;
}

function buildChangedFiles() {
  const all = getChangedFilesNameStatus();
  const filtered = all.filter((e) => !isExcluded(e.path));
  const excluded = all.filter((e) => isExcluded(e.path));

  const intro = [
    "# 05-CHANGED_FILES_MERGED",
    "",
    "> 本文件只合并当前分支相对 `main` 发生变化的源码文件 (即 `git diff --name-only main...HEAD`).",
    "> 已应用排除规则: `node_modules/**`, `.next/**`, `out/**`, `android/app/src/main/assets/public/**`, `android/**/build/**`, `*.apk`, `.env*`, `android/local.properties`, `*.jks`, `*.keystore`, signing*.properties.",
    "> 已删除文件 (status `D`) 不再读取内容, 仅在索引中标记.",
    "",
    `生成时间: ${nowIso()}`,
    `候选文件: ${all.length}`,
    `排除文件: ${excluded.length}`,
    `合并文件: ${filtered.length}`,
    "",
    "## 排除文件清单",
    "",
  ];
  if (excluded.length === 0) {
    intro.push("(无)", "");
  } else {
    intro.push("```");
    for (const e of excluded) intro.push(`${e.status}\t${e.path}`);
    intro.push("```", "");
  }
  intro.push("---", "");

  let merged = intro.join("\n");
  let currentLine = countLines(merged) + 1;
  const mapRows = [];

  for (let i = 0; i < filtered.length; i++) {
    const { status, path: relPath } = filtered[i];

    let block;
    let blockLines;
    let bytes = 0;
    let lines = 0;
    let sha = "MISSING";

    if (status === "D") {
      block = [
        "// ================================================================================",
        `// FILE DELETED: ${relPath}`,
        `// STATUS: ${status}`,
        "// ================================================================================",
        "",
        "",
      ].join("\n");
      blockLines = countLines(block);
      sha = "DELETED";
    } else {
      const info = readFileMaybe(relPath);
      if (info == null) {
        block = fileMissingBlock(relPath) + "\n";
        blockLines = countLines(block);
      } else {
        block = fileHeader(relPath, info) + info.content;
        if (!block.endsWith("\n")) block += "\n";
        block += "\n";
        blockLines = countLines(block);
        bytes = info.bytes;
        lines = info.lines;
        sha = info.sha;
      }
    }

    const startLine = currentLine;
    const endLine = currentLine + blockLines - 1;
    merged += block;
    currentLine = endLine + 1;

    mapRows.push({
      idx: i + 1,
      path: relPath,
      startLine,
      endLine,
      lines,
      bytes,
      sha,
      status,
      focus: focusForChangedFile(relPath),
    });
  }

  return { merged, mapRows, excluded };
}

function focusForChangedFile(p) {
  if (/wishlist-conversion\.ts$/.test(p)) return "撤销购买事务一致性, 删除校验抛错";
  if (/data-repo\.ts$/.test(p)) return "仓库入口, 写入口聚合, wardrobeDataRepo";
  if (/wishlist-view-2\.0\.tsx$/.test(p)) return "onDataChanged prop, handleUndoPurchase";
  if (/wardrobe-app\.tsx$/.test(p)) return "refreshState 透传, AppRoute 接入";
  if (/^scripts\/test-/.test(p)) return "源码级断言";
  if (/package\.json$/.test(p)) return "脚本编排, test:logic:all, export:chatgpt";
  if (/VERSION_HISTORY\.md$/.test(p)) return "版本与变更记录";
  if (/^src\/components\//.test(p)) return "UI 组件";
  if (/^src\/lib\//.test(p)) return "数据/业务逻辑";
  return "审查重点待定";
}

function buildChangedFilesMap(mapRows) {
  const lines = [
    "# 06-CHANGED_FILES_MAP",
    "",
    "> 05-CHANGED_FILES_MERGED.md 的索引表. 变更类型来自 `git diff --name-status main...HEAD`.",
    "> A=新增, M=修改, D=删除, R=重命名, C=复制.",
    "",
    `生成时间: ${nowIso()}`,
    `条目总数: ${mapRows.length}`,
    "",
    "| 序号 | 文件路径 | 起始行 | 结束行 | 行数 | 字节数 | SHA256 | 变更类型 | 审查重点 |",
    "|------|----------|--------|--------|------|--------|--------|----------|----------|",
  ];
  for (const r of mapRows) {
    lines.push(
      `| ${r.idx} | \`${r.path}\` | ${r.startLine} | ${r.endLine} | ${r.lines} | ${r.bytes} | \`${r.sha}\` | ${r.status} | ${r.focus} |`,
    );
  }
  if (mapRows.length === 0) {
    lines.push("| - | (无变更文件) | - | - | - | - | - | - | - |");
  }
  lines.push("");
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 00 PROJECT_MAP
// ────────────────────────────────────────────────────────────────────────────

function buildProjectMap() {
  const branch = tryGit("git branch --show-current");
  const head = tryGit("git rev-parse HEAD");
  const recent10 = tryGit("git log --oneline -n 10");

  let pkgVersion = "(unknown)";
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
    pkgVersion = pkg.version || "(no version field)";
  } catch (e) {
    pkgVersion = `(failed to read package.json: ${e.message})`;
  }

  return [
    "# 00-PROJECT_MAP",
    "",
    "项目名称: 衣橱穿搭助手 (Wardrobe + Outfit Planning)",
    `导出时间: ${nowIso()}`,
    `当前分支: \`${branch}\``,
    `当前 HEAD commit: \`${head}\``,
    `package.json version: \`${pkgVersion}\``,
    "",
    "## 最近 10 条 commit",
    "",
    "```",
    recent10,
    "```",
    "",
    "## 本次导出包含的文件类别",
    "",
    "- 项目文档: `AGENTS.md`, `README.md`, `VERSION_HISTORY.md`",
    "- 项目根配置: `package.json`, `tsconfig.json`, `next.config.ts`, `capacitor.config.ts`",
    "- Next.js App Router 入口: `src/app/layout.tsx`, `src/app/page.tsx`",
    "- 应用壳与导航: `wardrobe-app.tsx`, `use-app-navigation-controller.ts`, `app-sub-page-top-bar.tsx`, `app-route.ts`",
    "- 详情/列表: `wishlist-view-2.0.tsx`, `outfit-list-view.tsx`, `garment-detail-3.0.tsx`, `detail-shell.tsx`",
    "- 穿搭计划: `outfit-planning-calendar-view.tsx`, `outfit-weekly-plan-strip.tsx`, `outfit-plan-day-card.tsx`, `outfit-planning.ts`, `outfit-calendar.ts`, `outfit-wear-sync.ts`, `plan-packing.ts`",
    "- 数据层: `types.ts`, `db.ts`, `data-repo.ts`, `wishlist-conversion.ts`, `wardrobe-cascade-delete.ts`, `outfit-cascade-delete.ts`",
    "- 测试脚本: `test-app-route-navigation.ts`, `test-data-repo.ts`, `test-navigation-and-intake-entry.ts`, `test-wishlist-management-followup.ts`, `test-v1-1-6-rework-regression.ts`",
    "",
    "## 排除的文件类别",
    "",
    "- `node_modules/**`",
    "- `.next/**`, `out/**` (构建产物)",
    "- `android/app/src/main/assets/public/**`, `android/**/build/**`",
    "- `*.apk`",
    "- `.env*`",
    "- `android/local.properties`",
    "- `*.jks`, `*.keystore`, `signing*.properties` (签名文件)",
    "",
    "## 如何阅读 01-CODEBASE_MERGED.md",
    "",
    "- 用 grep `// FILE: <path>` 定位单个文件.",
    "- 每个原文件用以下头部包裹:",
    "",
    "```",
    "// ================================================================================",
    "// FILE: <path>",
    "// BYTES: <bytes>",
    "// LINES: <lines>",
    "// SHA256: <sha>",
    "// ================================================================================",
    "```",
    "",
    "- 缺失的文件用 `// FILE MISSING: <path>` 占位, 不会中断整个合并包.",
    "- 索引在 02-CODEBASE_MAP.md, 表格列出每个文件的起止行号.",
    "",
    "## 如何阅读 05-CHANGED_FILES_MERGED.md",
    "",
    "- 只包含当前分支相对 `main` 有差异的文件 (`git diff --name-only main...HEAD`).",
    "- 已删除文件 (status `D`) 用 `// FILE DELETED:` 头部标记, 不读取内容.",
    "- 索引在 06-CHANGED_FILES_MAP.md, 含变更类型列 (A/M/D/R/C).",
    "",
    "## 阅读优先级",
    "",
    "1. 先读 00-PROJECT_MAP.md (本文件).",
    "2. 全量审查时读 01-CODEBASE_MERGED.md + 02-CODEBASE_MAP.md.",
    "3. 只看本分支改动时读 05-CHANGED_FILES_MERGED.md + 06-CHANGED_FILES_MAP.md.",
    "4. 判断是否可合并 main 时读 03-GIT_STATE.md + 04-VALIDATION_REPORT.md.",
    "",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 04 VALIDATION_REPORT (template - 留待验证流程填充)
// ────────────────────────────────────────────────────────────────────────────

function buildValidationTemplate() {
  return [
    "# 04-VALIDATION_REPORT",
    "",
    `模板生成时间: ${nowIso()}`,
    "",
    "> 本文件为模板. 验证流程会在执行后覆盖, 写入每条命令的开始/结束时间, 退出码, stdout/stderr 摘要, 是否通过, 失败原因.",
    "",
    "## 验证命令清单",
    "",
    "```bash",
    "npm run typecheck",
    "npm run test:logic:data-repo",
    "npm run test:logic:wishlist-management-followup",
    "npm run test:logic:followup-navigation",
    "npm run test:logic:app-route",
    "npm run test:logic:all",
    "npm run build",
    "```",
    "",
    "## 模板字段",
    "",
    "每条命令需记录:",
    "",
    "- 命令",
    "- 开始时间",
    "- 结束时间",
    "- 退出码",
    "- stdout 摘要",
    "- stderr 摘要",
    "- 是否通过",
    "- 失败原因 (若有)",
    "",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// README_FOR_CHATGPT
// ────────────────────────────────────────────────────────────────────────────

function buildReadme() {
  return [
    "# README_FOR_CHATGPT",
    "",
    "这是衣橱穿搭助手项目的固定审查导出目录.",
    "",
    "- 优先读取 `00-PROJECT_MAP.md`.",
    "- 需要全量审查时读取 `01-CODEBASE_MERGED.md` 和 `02-CODEBASE_MAP.md`.",
    "- 只审查本分支改动时读取 `05-CHANGED_FILES_MERGED.md` 和 `06-CHANGED_FILES_MAP.md`.",
    "- 需要判断是否可合并 main 时读取 `03-GIT_STATE.md` 和 `04-VALIDATION_REPORT.md`.",
    "",
    "## 文件清单",
    "",
    "| 文件 | 用途 |",
    "|------|------|",
    "| `00-PROJECT_MAP.md` | 项目结构总览, 阅读入口 |",
    "| `01-CODEBASE_MERGED.md` | 全量代码合并包 |",
    "| `02-CODEBASE_MAP.md` | 全量代码索引 |",
    "| `03-GIT_STATE.md` | Git 状态 (分支 / status / log / diff) |",
    "| `04-VALIDATION_REPORT.md` | typecheck / 测试 / build 验证记录 |",
    "| `05-CHANGED_FILES_MERGED.md` | 当前分支相对 main 改动合并包 |",
    "| `06-CHANGED_FILES_MAP.md` | 改动文件索引 + 变更类型 |",
    "| `README_FOR_CHATGPT.md` | 本文件 |",
    "",
    "## 阅读约定",
    "",
    "- 所有合并包都使用 `// FILE: <path>` 头部分隔, 通过 grep 即可定位.",
    "- 头部包含 `BYTES`, `LINES`, `SHA256`, 用于校验.",
    "- 合并包不是合法源码, 不要尝试编译.",
    "- 缺失文件用 `// FILE MISSING: <path>` 标记.",
    "- 已删除文件用 `// FILE DELETED: <path>` 标记 (仅出现在 05).",
    "",
    "## 不包含内容",
    "",
    "- node_modules / .next / out / android build 产物",
    "- *.apk / 签名文件 (*.jks / *.keystore / signing*.properties)",
    "- .env / android/local.properties",
    "- ChatGPT 审查导出目录本身 (不进入 Git)",
    "",
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`[export-chatgpt-codebase] PROJECT_ROOT = ${PROJECT_ROOT}`);
  console.log(`[export-chatgpt-codebase] OUT_DIR      = ${OUT_DIR}`);

  ensureDir(OUT_DIR);

  console.log("[export-chatgpt-codebase] 生成 01-CODEBASE_MERGED.md ...");
  const { merged: codebaseMerged, mapRows: codebaseMap } = buildCodebaseMerged();
  writeFileSync(join(OUT_DIR, "01-CODEBASE_MERGED.md"), codebaseMerged);
  console.log(`  -> 01-CODEBASE_MERGED.md (${codebaseMap.length} files)`);

  console.log("[export-chatgpt-codebase] 生成 02-CODEBASE_MAP.md ...");
  writeFileSync(join(OUT_DIR, "02-CODEBASE_MAP.md"), buildCodebaseMap(codebaseMap));

  console.log("[export-chatgpt-codebase] 生成 03-GIT_STATE.md ...");
  writeFileSync(join(OUT_DIR, "03-GIT_STATE.md"), buildGitState());

  console.log("[export-chatgpt-codebase] 生成 04-VALIDATION_REPORT.md (template) ...");
  // 不覆盖已有的 VALIDATION_REPORT (验证流程可能已经写入实际结果)
  const validationPath = join(OUT_DIR, "04-VALIDATION_REPORT.md");
  if (!existsSync(validationPath)) {
    writeFileSync(validationPath, buildValidationTemplate());
  } else {
    console.log("  -> 04-VALIDATION_REPORT.md 已存在, 保留 (验证流程负责覆盖)");
  }

  console.log("[export-chatgpt-codebase] 生成 05-CHANGED_FILES_MERGED.md ...");
  const { merged: changedMerged, mapRows: changedMap } = buildChangedFiles();
  writeFileSync(join(OUT_DIR, "05-CHANGED_FILES_MERGED.md"), changedMerged);
  console.log(`  -> 05-CHANGED_FILES_MERGED.md (${changedMap.length} files)`);

  console.log("[export-chatgpt-codebase] 生成 06-CHANGED_FILES_MAP.md ...");
  writeFileSync(join(OUT_DIR, "06-CHANGED_FILES_MAP.md"), buildChangedFilesMap(changedMap));

  console.log("[export-chatgpt-codebase] 生成 00-PROJECT_MAP.md ...");
  writeFileSync(join(OUT_DIR, "00-PROJECT_MAP.md"), buildProjectMap());

  console.log("[export-chatgpt-codebase] 生成 README_FOR_CHATGPT.md ...");
  writeFileSync(join(OUT_DIR, "README_FOR_CHATGPT.md"), buildReadme());

  console.log("[export-chatgpt-codebase] DONE.");
  console.log(`  输出目录: ${OUT_DIR}`);
}

main();
